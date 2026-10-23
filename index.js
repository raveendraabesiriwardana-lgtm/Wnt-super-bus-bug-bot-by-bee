const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const config = require('./config');
const { getFilesList, readFileContent, ensureFolder } = require('./file-manager');
const TelegramBot = require('./telegram-bot');

process.on('unhandledRejection', (err) => console.error('⚠️ unhandledRejection:', err && err.message ? err.message : err));
process.on('uncaughtException', (err) => console.error('⚠️ uncaughtException:', err && err.message ? err.message : err));

let sock;
let tgBot = null;
let isProcessing = false;
let reconnectDelay = 5000;

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
        console.log('Node version:', process.version);

        ensureFolder(config.SESSION_PATH);
        const { state, saveCreds } = await useMultiFileAuthState(config.SESSION_PATH);

        console.log('📱 Creating WA socket...');

        sock = makeWASocket({
            auth: state,
            logger: require('pino')({ level: 'warn' }),
            browser: ['WNT BUS BOT', 'Chrome', '1.0.0']
        });

        console.log('✅ Socket created successfully!');

        if (!tgBot) tgBot = new TelegramBot();
        tgBot.setSock(sock);

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            const err = lastDisconnect?.error;
            const code = err?.output?.statusCode;

            console.log('📡 Connection update:', connection || '-', code ? '(code:' + code + ')' : '', qr ? '(QR ඇත)' : '');

            if (qr) {
                // ⭐ වැදගත්ම වෙනස්කම: QR එක ආපු ගමන් = socket connected = /pair දැන් වැඩ කරයි
                tgBot.setWaReady(true);
                console.log('🔑 Socket connected! Telegram එකේ /pair ගහන්න පුලුවන් (QR scan කරන්න ඕන නෑ)');
            }

            if (connection === 'open') {
                reconnectDelay = 5000;
                tgBot.setWaReady(true);
                console.log('✅ WA FULL LOGIN! Bot එක දැන් වැඩ කරනවා!');
                if (sock.user) console.log('   Bot connected as:', sock.user.name || sock.user.id);
            }

            if (connection === 'close') {
                tgBot.setWaReady(false);
                console.log('❌ WA connection closed');
                if (err) {
                    console.log('   Error:', err.message || '(no message)');
                }

                const shouldReconnect = code !== DisconnectReason.loggedOut;
                if (shouldReconnect) {
                    console.log('🔄 Reconnecting in', reconnectDelay / 1000, 'seconds...');
                    setTimeout(connectToWhatsApp, reconnectDelay);
                    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
                } else {
                    console.log('❌ Logged out! Sessions folder එකේ auth එක මැරිලා.');
                }
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

💡 Telegram එකේ /pair <number> ගහලා code pair ලබාගන්න
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
                        const code = await sock.requestPairingCode(args[0].replace(/[^0-9]/g, ''));
                        await sock.sendMessage(jid, { text: `✅ *Pairing Code:* 🔢 *${code}*` });
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
        console.log('🔄 Retrying in', reconnectDelay / 1000, 'seconds...');
        setTimeout(connectToWhatsApp, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 30000);
    }
}

connectToWhatsApp();
