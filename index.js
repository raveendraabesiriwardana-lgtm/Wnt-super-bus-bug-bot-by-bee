const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const config = require('./config');
const { getFilesList, readFileContent, ensureFolder } = require('./file-manager');
const TelegramBot = require('./telegram-bot');

// Crash loops නවත්තන්න
process.on('unhandledRejection', (err) => console.error('⚠️ unhandledRejection:', err && err.message ? err.message : err));
process.on('uncaughtException', (err) => console.error('⚠️ uncaughtException:', err && err.message ? err.message : err));

let sock;
let isProcessing = false;

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
    ensureFolder(config.SESSION_PATH);
    const { state, saveCreds } = await useMultiFileAuthState(config.SESSION_PATH);

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: require('pino')({ level: 'silent' }),
        browser: ['WNT BUS BOT', 'Chrome', '1.0.0']
    });

    new TelegramBot(sock); // Singleton - එක වතරක් විතරයි හදන්නේ

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) qrcode.generate(qr, { small: true });
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) setTimeout(connectToWhatsApp, 5000);
        } else if (connection === 'open') {
            console.log('✅ WNT BUS BOT සම්බන්ධ විය!');
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

💡 numberbus/ සහ groupbus/ folders වලට .txt files දාන්න.
`;
                await sock.sendMessage(jid, { text: menu });
            }

            else if (command === 'numberbus') {
                if (args.length < 1) {
                    await sock.sendMessage(jid, { text: "❗ භාවිතය: .numberbus <number> [file_number හෝ ALL]\nඋදා: .numberbus 94771234567" });
                    return;
                }
                const targetNumber = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
                const files = getFilesList(config.NUMBERBUS_PATH);

                if (files.length === 0) {
                    await sock.sendMessage(jid, { text: "❗ numberbus folder එකේ .txt files කිසිවක් නැත!" });
                    return;
                }

                const fileList = files.map((f, i) => `${i + 1}. ${f}`).join('\n');

                if (args.length === 1) {
                    await sock.sendMessage(jid, {
                        text: `*📂 Available Files:*\n\n${fileList}\n\n*භාවිතය:*\n.numberbus ${args[0]} <number>\nහෝ\n.numberbus ${args[0]} ALL`
                    });
                    return;
                }

                const fileArg = args[1].toUpperCase();
                const userJid = jid;

                const result = await processQueue(async () => {
                    if (fileArg === 'ALL') {
                        await sock.sendMessage(userJid, { text: `📤 *${args[0]} වෙත සියලුම files (${files.length}) යැවීම ආරම්භ විය...*\n⏳ රැඳී සිටින්න...` });
                        for (let i = 0; i < files.length; i++) {
                            const content = readFileContent(config.NUMBERBUS_PATH, files[i]);
                            if (content) {
                                await sock.sendMessage(targetNumber, { text: `*[${i + 1}/${files.length}]*\n\n${content}` });
                                await new Promise(r => setTimeout(r, 3000));
                            }
                        }
                        await sock.sendMessage(userJid, { text: `✅ *සියලුම files සාර්ථකව ${args[0]} වෙත යැවීම අවසන් විය!*` });
                    }
                    else {
                        const fileIndex = parseInt(fileArg) - 1;
                        if (isNaN(fileIndex) || fileIndex < 0 || fileIndex >= files.length) {
                            await sock.sendMessage(userJid, { text: `❗ වැරදි file number එකක්!\n\nලබා ගත හැකි files:\n${fileList}` });
                            return;
                        }
                        const targetFile = files[fileIndex];
                        const content = readFileContent(config.NUMBERBUS_PATH, targetFile);
                        await sock.sendMessage(targetNumber, { text: content });
                        await sock.sendMessage(userJid, { text: `✅ *${targetFile} file එක ${args[0]} වෙත සාර්ථකව යැවීම අවසන් විය!*` });
                    }
                });

                if (result.includes("දැනට තවත් task")) {
                    await sock.sendMessage(jid, { text: result });
                }
            }

            else if (command === 'groupbus') {
                if (args.length < 1) {
                    await sock.sendMessage(jid, { text: "❗ භාවිතය: .groupbus <jid> [file_number හෝ ALL]\nඋදා: .groupbus 120363xxx@g.us" });
                    return;
                }
                const targetJid = args[0].includes('@g.us') ? args[0] : args[0] + '@g.us';
                const files = getFilesList(config.GROUPBUS_PATH);

                if (files.length === 0) {
                    await sock.sendMessage(jid, { text: "❗ groupbus folder එකේ .txt files කිසිවක් නැත!" });
                    return;
                }

                const fileList = files.map((f, i) => `${i + 1}. ${f}`).join('\n');

                if (args.length === 1) {
                    await sock.sendMessage(jid, {
                        text: `*📂 Available Files:*\n\n${fileList}\n\n*භාවිතය:*\n.groupbus ${args[0]} <number>\nහෝ\n.groupbus ${args[0]} ALL`
                    });
                    return;
                }

                const fileArg = args[1].toUpperCase();
                const userJid = jid;

                const result = await processQueue(async () => {
                    if (fileArg === 'ALL') {
                        await sock.sendMessage(userJid, { text: `📤 *Group එක වෙත සියලුම files (${files.length}) යැවීම ආරම්භ විය...*\n⏳ රැඳී සිටින්න...` });
                        for (let i = 0; i < files.length; i++) {
                            const content = readFileContent(config.GROUPBUS_PATH, files[i]);
                            if (content) {
                                await sock.sendMessage(targetJid, { text: `*[${i + 1}/${files.length}]*\n\n${content}` });
                                await new Promise(r => setTimeout(r, 3000));
                            }
                        }
                        await sock.sendMessage(userJid, { text: `✅ *සියලුම files සාර්ථකව Group එක වෙත යැවීම අවසන් විය!*` });
                    }
                    else {
                        const fileIndex = parseInt(fileArg) - 1;
                        if (isNaN(fileIndex) || fileIndex < 0 || fileIndex >= files.length) {
                            await sock.sendMessage(userJid, { text: `❗ වැරදි file number එකක්!\n\nලබා ගත හැකි files:\n${fileList}` });
                            return;
                        }
                        const targetFile = files[fileIndex];
                        const content = readFileContent(config.GROUPBUS_PATH, targetFile);
                        await sock.sendMessage(targetJid, { text: content });
                        await sock.sendMessage(userJid, { text: `✅ *${targetFile} file එක Group එක වෙත සාර්ථකව යැවීම අවසන් විය!*` });
                    }
                });

                if (result.includes("දැනට තවත් task")) {
                    await sock.sendMessage(jid, { text: result });
                }
            }

            else if (command === 'pair') {
                if (args.length < 1) {
                    await sock.sendMessage(jid, { text: "❗ භාවිතය: .pair <number>\nඋදා: .pair 94771234567" });
                    return;
                }
                const number = args[0].replace(/[^0-9]/g, '');
                try {
                    const code = await sock.requestPairingCode(number);
                    await sock.sendMessage(jid, {
                        text: `✅ *Pairing Code:* \n\n🔢 *${code}*\n\nWhatsApp > Linked Devices > Link with phone number හි දාන්න.`
                    });
                } catch (e) {
                    await sock.sendMessage(jid, { text: `❌ Pairing code එක ලබා ගැනීමට නොහැකි විය.` });
                }
            }

            else if (command === 'ping') {
                await sock.sendMessage(jid, { text: '🟢 *Bot Online!*' });
            }

        } catch (error) {
            console.error("Command Error:", error);
            await sock.sendMessage(jid, { text: `❌ දෝයක්: ${error.message}` });
        }
    });
}

connectToWhatsApp();
