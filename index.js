const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const fs = require('fs');
const config = require('./config');
const { getFilesList, readFileContent, ensureFolder } = require('./file-manager');
const TelegramBot = require('./telegram-bot');

process.on('unhandledRejection', (err) => console.error('⚠️ unhandledRejection:', err && err.message ? err.message : err));
process.on('uncaughtException', (err) => console.error('⚠️ uncaughtException:', err && err.message ? err.message : err));

let sock = null;
let tgBot = null;
let isProcessing = false;
let reconnectDelay = 5000;

// Pairing state එක
let pairInfo = { number: null, code: null, sentAt: 0, chatId: null, socketCreatedAt: 0, autoAttempts: 0, paired: false };
let qrWaiters = [];

function waitForQr(timeoutMs = 35000) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => {
            qrWaiters = qrWaiters.filter(f => f !== done);
            reject(new Error('QR wait timeout'));
        }, timeoutMs);
        function done() { clearTimeout(t); resolve(); }
        qrWaiters.push(done);
    });
}

// Pairing code ඉල්ලීම - මෙතනදී double request එකක් වෙන්නේ නෑ
async function handlePairRequest(number, chatId) {
    // තත්පර 90ක් ඇතුළත ආයෙ ඉල්ලුවොත් -> ඒ code එකම ආයෙ යවනවා (අලුත් එකක් ගන්නේ නෑ!)
    if (pairInfo.code && pairInfo.number === number && (Date.now() - pairInfo.sentAt) < 90000) {
        return { ok: true, code: pairInfo.code, reused: true };
    }

    // Socket window එක පරණ නම් (තත්පර 90+) -> අලුත් connection එකක් හදලා ඉන්නවා
    if (!sock || (Date.now() - pairInfo.socketCreatedAt) > 90000) {
        console.log('🔄 Socket window එක පරණයි - අලුත් connection එකක් හදනවා...');
        pairInfo.code = null;
        try { if (sock) sock.end(new Error('restart-for-pairing')); } catch (_) {}
        await waitForQr(35000);
    }

    const code = await sock.requestPairingCode(number);
    pairInfo.number = number;
    pairInfo.code = code;
    pairInfo.sentAt = Date.now();
    pairInfo.chatId = chatId || pairInfo.chatId;
    pairInfo.autoAttempts = 0;
    console.log('🔑 Pairing code issued:', code);
    return { ok: true, code, reused: false };
}

async function processQueue(task) {
    if (isProcessing) {
        return "⏳ දැනට තවත් task එකක් ක්‍රියාත්මක වෙමින් පවතී. කරුණාකර රැඳී සිටින්න.";
    }
    isProcessing = true;
    try {
        await task();
        return "✅ Task එක සාර්ථකව අවසන් විය!";
    } catch (error) {
        console.error("Queue Error:", error);
        return `❌ දෝෂයක්: ${error.message}`;
    } finally {
        isProcessing = false;
    }
}

async function connectToWhatsApp() {
    try {
        console.log('🚀 Starting WhatsApp connection...');
        ensureFolder(config.SESSION_PATH);
        const { state, saveCreds } = await useMultiFileAuthState(config.SESSION_PATH);

        sock = makeWASocket({
            auth: state,
            logger: require('pino')({ level: 'warn' }),
            browser: ['WNT BUS BOT', 'Chrome', '1.0.0']
        });

        pairInfo.socketCreatedAt = Date.now();
        pairInfo.code = null;
        pairInfo.sentAt = 0;
        console.log('✅ Socket created!');

        if (!tgBot) tgBot = new TelegramBot();
        tgBot.setSock(sock);
        tgBot.setPairHandler(handlePairRequest);

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            const err = lastDisconnect?.error;
            const code = err?.output?.statusCode;

            if (qr) {
                tgBot.setWaReady(true);
                qrWaiters.forEach(f => f());
                qrWaiters = [];
                console.log('🔑 Socket connected (QR phase) - /pair වැඩ කරයි');

                // කලින් window එක මැරුණා නම් අලුත් code එකක් AUTO යවනවා
                if (pairInfo.number && !pairInfo.code && !pairInfo.paired && pairInfo.autoAttempts > 0 && pairInfo.autoAttempts <= 2) {
                    try {
                        const newCode = await sock.requestPairingCode(pairInfo.number);
                        pairInfo.code = newCode;
                        pairInfo.sentAt = Date.now();
                        console.log('🔑 AUTO new pairing code:', newCode);
                        tgBot.sendTo(pairInfo.chatId, `🔄 *අලුත් Pairing Code:* 🔢 *${newCode}*\n\n⚡ *දැන්ම* දාන්න: WhatsApp → Settings → Linked Devices → Link a Device → Link with phone number → code එක\n\n⏱️ විනාඩි 1යි! ආයෙ /pair ගහන්න එපා!`);
                    } catch (e) {
                        console.error('auto pair error:', e.message);
                    }
                }
            }

            if (connection === 'open') {
                reconnectDelay = 5000;
                tgBot.setWaReady(true);
                pairInfo.paired = true;
                console.log('✅ WA FULL LOGIN! Bot එක දැන් වැඩ කරනවා!');
                tgBot.sendTo(pairInfo.chatId, '🎉 *WhatsApp login සාර්ථකයි!*\n✅ Bot එක දැන් ONLINE.\n\nදැන් WhatsApp එකේ .menu ගහලා බලන්න!');
            }

            if (connection === 'close') {
                tgBot.setWaReady(false);
                console.log('❌ WA close. code:', code || '(නෑ)', '|', err?.message || '');

                // 401 = session මැරිලා -> sessions clear කරලා අලුත් එකක්
                if (code === DisconnectReason.loggedOut) {
                    console.log('🧹 Sessions clear කරලා අලුත් connection එකක් හදනවා...');
                    try { fs.rmSync(config.SESSION_PATH, { recursive: true, force: true }); } catch (_) {}
                    pairInfo.number = null;
                    pairInfo.code = null;
                    pairInfo.paired = false;
                    pairInfo.autoAttempts = 0;
                    setTimeout(connectToWhatsApp, 5000);
                    return;
                }

                // Pairing window එක මැරුණා නම් (code එකක් තිබුණා, login වුණේ නෑ) -> auto retry
                const pairWindowDied = pairInfo.code && !pairInfo.paired && pairInfo.number;
                if (pairWindowDied && pairInfo.autoAttempts < 2) {
                    pairInfo.autoAttempts++;
                    pairInfo.code = null;
                    console.log('🔄 Pairing window එක ඉවර වුණා - auto retry', pairInfo.autoAttempts, '/ 2');
                    setTimeout(connectToWhatsApp, 3000);
                    return;
                }

                console.log('🔄 Reconnecting in', reconnectDelay / 1000, 's');
                setTimeout(connectToWhatsApp, reconnectDelay);
                reconnectDelay = Math.min(reconnectDelay * 2, 30000);
            }
        });

        sock.ev.on('messages.upsert', async (m) => {
            const message = m.messages[0];
            if (!message.message) return;

            const jid = message.key.remoteJid;
            const messageType = Object.keys(message.message)[0];
            const text = message.message[messageType]?.text || '';

            if (!text || !text.startsWith(config.PREFIX)) return;

            const args = text.slice(config.PREFIX.length).trim().split(/ +/);
            const command = args.shift().toLowerCase();

            try {
                if (command === 'menu' || command === 'help') {
                    const menu = `
╔══════════════════════╗
   *🚀 ${config.BOT_NAME}*
╚══════════════════════╝

*📱 NUMBER BUS:*
├ .numberbus <number>
├ .numberbus <number> <file_number>
└ .numberbus <number> ALL

*👥 GROUP BUS:*
├ .groupbus <jid>
├ .groupbus <jid> <file_number>
└ .groupbus <jid> ALL

*🔗 PAIRING:*
└ .pair <number>
`;
                    await sock.sendMessage(jid, { text: menu });
                }

                else if (command === 'numberbus') {
                    if (args.length < 1) {
                        await sock.sendMessage(jid, { text: "❗ භාවිතය: .numberbus <number> [file_number හෝ ALL]" });
                        return;
                    }
                    const targetNumber = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
                    const files = getFilesList(config.NUMBERBUS_PATH);

                    if (files.length === 0) {
                        await sock.sendMessage(jid, { text: "❗ numberbus folder එකේ .txt files නෑ!" });
                        return;
                    }

                    const fileList = files.map((f, i) => `${i + 1}. ${f}`).join('\n');

                    if (args.length === 1) {
                        await sock.sendMessage(jid, { text: `*📂 Available Files:*\n\n${fileList}\n\n*භාවිතය:*\n.numberbus ${args[0]} <number>\nහෝ\n.numberbus ${args[0]} ALL` });
                        return;
                    }

                    const fileArg = args[1].toUpperCase();
                    const userJid = jid;

                    const result = await processQueue(async () => {
                        if (fileArg === 'ALL') {
                            await sock.sendMessage(userJid, { text: `📤 *${args[0]} වෙත files ${files.length} යැවීම ආරම්භ විය...*` });
                            for (let i = 0; i < files.length; i++) {
                                const content = readFileContent(config.NUMBERBUS_PATH, files[i]);
                                if (content) {
                                    await sock.sendMessage(targetNumber, { text: `*[${i + 1}/${files.length}]*\n\n${content}` });
                                    await new Promise(r => setTimeout(r, 3000));
                                }
                            }
                            await sock.sendMessage(userJid, { text: `✅ *සියලුම files ${args[0]} වෙත යැවීම අවසන්!*` });
                        } else {
                            const fileIndex = parseInt(fileArg) - 1;
                            if (isNaN(fileIndex) || fileIndex < 0 || fileIndex >= files.length) {
                                await sock.sendMessage(userJid, { text: `❗ වැරදි number එකක්!\n\n${fileList}` });
                                return;
                            }
                            const content = readFileContent(config.NUMBERBUS_PATH, files[fileIndex]);
                            await sock.sendMessage(targetNumber, { text: content });
                            await sock.sendMessage(userJid, { text: `✅ *${files[fileIndex]} යැවීම අවසන්!*` });
                        }
                    });

                    if (result.includes("දැනට තවත් task")) await sock.sendMessage(jid, { text: result });
                }

                else if (command === 'groupbus') {
                    if (args.length < 1) {
                        await sock.sendMessage(jid, { text: "❗ භාවිතය: .groupbus <jid> [file_number හෝ ALL]" });
                        return;
                    }
                    const targetJid = args[0].includes('@g.us') ? args[0] : args[0] + '@g.us';
                    const files = getFilesList(config.GROUPBUS_PATH);

                    if (files.length === 0) {
                        await sock.sendMessage(jid, { text: "❗ groupbus folder එකේ .txt files නෑ!" });
                        return;
                    }

                    const fileList = files.map((f, i) => `${i + 1}. ${f}`).join('\n');

                    if (args.length === 1) {
                        await sock.sendMessage(jid, { text: `*📂 Available Files:*\n\n${fileList}\n\n*භාවිතය:*\n.groupbus ${args[0]} <number>\nහෝ\n.groupbus ${args[0]} ALL` });
                        return;
                    }

                    const fileArg = args[1].toUpperCase();
                    const userJid = jid;

                    const result = await processQueue(async () => {
                        if (fileArg === 'ALL') {
                            await sock.sendMessage(userJid, { text: `📤 *Group එකට files ${files.length} යැවීම ආරම්භ විය...*` });
                            for (let i = 0; i < files.length; i++) {
                                const content = readFileContent(config.GROUPBUS_PATH, files[i]);
                                if (content) {
                                    await sock.sendMessage(targetJid, { text: `*[${i + 1}/${files.length}]*\n\n${content}` });
                                    await new Promise(r => setTimeout(r, 3000));
                                }
                            }
                            await sock.sendMessage(userJid, { text: `✅ *සියලුම files Group එකට යැවීම අවසන්!*` });
                        } else {
                            const fileIndex = parseInt(fileArg) - 1;
                            if (isNaN(fileIndex) || fileIndex < 0 || fileIndex >= files.length) {
                                await sock.sendMessage(userJid, { text: `❗ වැරදි number එකක්!\n\n${fileList}` });
                                return;
                            }
                            const content = readFileContent(config.GROUPBUS_PATH, files[fileIndex]);
                            await sock.sendMessage(targetJid, { text: content });
                            await sock.sendMessage(userJid, { text: `✅ *${files[fileIndex]} Group එකට යැවීම අවසන්!*` });
                        }
                    });

                    if (result.includes("දැනට තවත් task")) await sock.sendMessage(jid, { text: result });
                }

                else if (command === 'pair') {
                    if (args.length < 1) {
                        await sock.sendMessage(jid, { text: "❗ භාවිතය: .pair <number>" });
                        return;
                    }
                    try {
                        const res = await handlePairRequest(args[0].replace(/[^0-9]/g, ''), null);
                        await sock.sendMessage(jid, { text: `✅ *Pairing Code:* 🔢 *${res.code}*` });
                    } catch (e) {
                        await sock.sendMessage(jid, { text: `❌ Pairing error: ${e && e.message ? e.message : e}` });
                    }
                }

                else if (command === 'ping') {
                    await sock.sendMessage(jid, { text: '🟢 *Bot Online!*' });
                }

            } catch (error) {
                console.error("Command Error:", error);
            }
        });

    } catch (error) {
        console.error('❌ Failed to start WhatsApp:', error.message);
        setTimeout(connectToWhatsApp, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 30000);
    }
}

connectToWhatsApp();
