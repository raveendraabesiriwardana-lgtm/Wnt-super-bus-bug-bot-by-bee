const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const config = require('./config');
const { getFilesList, readFileContent, ensureFolder } = require('./file-manager');
const TelegramBot = require('./telegram-bot');

let sock;
let isProcessing = false; // එක පාරක් message යවද්දී තව එකක් යවන්න දෙන්නේ නෑ

// Message Queue System (එක පාරක් යවද්දී තව එකක් යවන්න දෙන්නේ නෑ)
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

    // Telegram Bot එක start කරනවා
    new TelegramBot(sock);

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
│   (Available files list එක පෙන්වයි)
├ .numberbus <number> <file_number>
│   (උදා: .numberbus 94771234567 1)
└ .numberbus <number> ALL
    (සියලුම files එකින් එක යවයි)

*👥 GROUP BUS:*
├ .groupbus <jid>
│   (Available files list එක පෙන්වයි)
├ .groupbus <jid> <file_number>
│   (උදා: .groupbus 120363xxx@g.us 1)
└ .groupbus <jid> ALL
    (සියලුම files එකින් එක යවයි)

*🔗 PAIRING:*
├ .pair <number> (උදා: .pair 94771234567)

*💡 Note:* 
ඔයාගේ numberbus/ සහ groupbus/ folders වලට ඕන තරම් .txt files දාන්න. Bot එක ඒවා auto detect කරයි.
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
                        text: `*📂 Available Files in Number Bus:*\n\n${fileList}\n\n*භාවිතය:*\n.numberbus ${args[0]} <number>\nහෝ\n.numberbus ${args[0]} ALL` 
                    });
                    return;
                }

                const fileArg = args[1].toUpperCase();

                await processQueue(async () => {
                    if (fileArg === 'ALL') {
                        await sock.sendMessage(jid, { text: `📤 *${args[0]} වෙත සියලුම files (${files.length}) යැවීම ආරම්භ විය...*\n⏳ රැඳී සිටින්න...` });
                        
                        for (let i = 0; i < files.length; i++) {
                            const content = readFileContent(config.NUMBERBUS_PATH, files[i]);
                            if (content) {
                                await sock.sendMessage(targetNumber, { 
                                    text: `*[${i + 1}/${files.length}]*\n\n${content}` 
                                });
                                await new Promise(r => setTimeout(r, 3000)); // 3 තත්පර delay
                            }
                        }
                        await sock.sendMessage(jid, { text: `✅ *සියලුම files සාර්ථකව ${args[0]} වෙත යැවීම අවසන් විය!*` });
                    } 
                    else {
                        const fileIndex = parseInt(fileArg) - 1;
                        if (isNaN(fileIndex) || fileIndex < 0 || fileIndex >= files.length) {
                            await sock.sendMessage(jid, { text: `❗ වැරදි file number එකක්!\n\nලබා ගත හැකි files:\n${fileList}` });
                            return;
                        }
                        
                        const targetFile = files[fileIndex];
                        const content = readFileContent(config.NUMBERBUS_PATH, targetFile);
                        
                        await sock.sendMessage(targetNumber, { text: content });
                        await sock.sendMessage(jid, { text: `✅ *${targetFile} file එක ${args[0]} වෙත සාර්ථකව යැවීම අවසන් විය!*` });
                    }
                }).then(async (res) => {
                    if (res.includes("දැනට තවත් task")) {
                        await sock.sendMessage(jid, { text: res });
                    }
                });
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
                        text: `*📂 Available Files in Group Bus:*\n\n${fileList}\n\n*භාවිතය:*\n.groupbus ${args[0]} <number>\nහෝ\n.groupbus ${args[0]} ALL` 
                    });
                    return;
                }

                const fileArg = args[1].toUpperCase();

                await processQueue(async () => {
                    if (fileArg === 'ALL') {
                        await sock.sendMessage(jid, { text: `📤 *Group එක වෙත සියලුම files (${files.length}) යැවීම ආරම්භ විය...*\n⏳ රැඳී සිටින්න...` });
                        
                        for (let i = 0; i < files.length; i++) {
                            const content = readFileContent(config.GROUPBUS_PATH, files[i]);
                            if (content) {
                                await sock.sendMessage(targetJid, { 
                                    text: `*[${i + 1}/${files.length}]*\n\n${content}` 
                                });
                                await new Promise(r => setTimeout(r, 3000)); // 3 තත්පර delay
                            }
                        }
                        await sock.sendMessage(jid, { text: `✅ *සියලුම files සාර්ථකව Group එක වෙත යැවීම අවසන් විය!*` });
                    } 
                    else {
                        const fileIndex = parseInt(fileArg) - 1;
                        if (isNaN(fileIndex) || fileIndex < 0 || fileIndex >= files.length) {
                            await sock.sendMessage(jid, { text: `❗ වැරදි file number එකක්!\n\nලබා ගත හැකි files:\n${fileList}` });
                            return;
                        }
                        
                        const targetFile = files[fileIndex];
                        const content = readFileContent(config.GROUPBUS_PATH, targetFile);
                        
                        await sock.sendMessage(targetJid, { text: content });
                        await sock.sendMessage(jid, { text: `✅ *${targetFile} file එක Group එක වෙත සාර්ථකව යැවීම අවසන් විය!*` });
                    }
                }).then(async (res) => {
                    if (res.includes("දැනට තවත් task")) {
                        await sock.sendMessage(jid, { text: res });
                    }
                });
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
                        text: `✅ *Pairing Code එක:* \n\n🔢 *${code}*\n\nමේ code එක ඔයාගේ WhatsApp එකේ (Linked Devices > Link a Device > Link with phone number) එකතු කරන්න.` 
                    });
                } catch (e) {
                    await sock.sendMessage(jid, { text: `❌ Pairing code එක ලබා ගැනීමට නොහැකි විය. number එක නිවැරදිදැයි බලන්න.` });
                }
            }

        } catch (error) {
            console.error("Command Error:", error);
            await sock.sendMessage(jid, { text: `❌ දෝෂයක්: ${error.message}` });
        }
    });
}

connectToWhatsApp();
