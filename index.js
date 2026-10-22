const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, makeInMemoryStore, jidNormalizedUser } = require('@whiskeysockets/baileys');
const { default: Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const TelegramBot = require('./telegram-bot');

// Message Queue System
class MessageQueue {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
    }

    add(task) {
        this.queue.push(task);
        this.process();
    }

    async process() {
        if (this.isProcessing || this.queue.length === 0) return;
        
        this.isProcessing = true;
        const task = this.queue.shift();
        
        try {
            await task();
        } catch (error) {
            console.error('Queue error:', error);
        } finally {
            this.isProcessing = false;
            setTimeout(() => this.process(), 1000);
        }
    }

    clear() {
        this.queue = [];
        this.isProcessing = false;
    }
}

const messageQueue = new MessageQueue();
let sock;
let telegramBot;

// Create folders if not exist
function ensureFolders() {
    if (!fs.existsSync(config.SESSION_PATH)) {
        fs.mkdirSync(config.SESSION_PATH, { recursive: true });
    }
    if (!fs.existsSync(config.NUMBERBUS_PATH)) {
        fs.mkdirSync(config.NUMBERBUS_PATH, { recursive: true });
    }
    if (!fs.existsSync(config.GROUPBUS_PATH)) {
        fs.mkdirSync(config.GROUPBUS_PATH, { recursive: true });
    }
}

// Get files from folder
function getFilesFromFolder(folderPath) {
    if (!fs.existsSync(folderPath)) return [];
    return fs.readdirSync(folderPath).filter(file => file.endsWith('.txt'));
}

// Read file content
function readFileContent(folderPath, fileName) {
    const filePath = path.join(folderPath, fileName);
    if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf-8');
    }
    return null;
}

// Menu Command
async function sendMenu(jid) {
    const menu = `
╔═══════════════════════╗
   *🚀 ${config.BOT_NAME}*
╚═══════════════════════╝

*📱 NUMBER BUS COMMANDS:*
├ .numberbus <number>
│   └ Send files to number
├ .numberbus <number> <file>
│    Send specific file
└ .numberbus <number> ALL
    └ Send all files

*👥 GROUP BUS COMMANDS:*
├ .groupbus <jid>
│   └ Send files to group
├ .groupbus <jid> <file>
│   └ Send specific file
└ .groupbus <jid> ALL
    └ Send all files

*🔗 PAIRING COMMANDS:*
├ .pair <number>
│   └ Get pairing code
└ .paircode <number>
     Alternative pairing

*📋 OTHER COMMANDS:*
├ .menu
│   └ Show this menu
├ .ping
│   └ Check bot status
 .help
    └ Full help

╔═══════════════════════╗
   *Made by WNT TEAM*
═══════════════════════╝
`;

    await sock.sendMessage(jid, { text: menu });
}

// Number Bus Command
async function handleNumberBus(jid, args, senderName) {
    if (args.length < 1) {
        await sock.sendMessage(jid, { 
            text: '*❗ Usage:* .numberbus <number> [file/ALL]\n\nExample:\n.numberbus 94771234567\n.numberbus 94771234567 1\n.numberbus 94771234567 ALL' 
        });
        return;
    }

    const targetNumber = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
    const fileName = args[1] || 'ALL';
    const files = getFilesFromFolder(config.NUMBERBUS_PATH);

    if (files.length === 0) {
        await sock.sendMessage(jid, { 
            text: `*❗ Error:* No files found in ${config.NUMBERBUS_PATH} folder!\n\nPlease add .txt files to the numberbus folder.` 
        });
        return;
    }

    await sock.sendMessage(jid, { 
        text: ` *Sending to:* ${args[0]}\n📂 *File:* ${fileName}\n⏳ Please wait...` 
    });

    messageQueue.add(async () => {
        let sentCount = 0;
        let failedCount = 0;

        try {
            if (fileName.toUpperCase() === 'ALL') {
                // Send all files
                for (const file of files) {
                    try {
                        const content = readFileContent(config.NUMBERBUS_PATH, file);
                        if (content) {
                            await sock.sendMessage(targetNumber, { text: content });
                            sentCount++;
                            await new Promise(resolve => setTimeout(resolve, 2000)); // Delay between messages
                        }
                    } catch (err) {
                        console.error(`Error sending ${file}:`, err);
                        failedCount++;
                    }
                }
            } else {
                // Send specific file
                const targetFile = files.find(f => f === fileName || f === `${fileName}.txt`);
                if (targetFile) {
                    const content = readFileContent(config.NUMBERBUS_PATH, targetFile);
                    if (content) {
                        await sock.sendMessage(targetNumber, { text: content });
                        sentCount++;
                    } else {
                        await sock.sendMessage(jid, { 
                            text: `*❗ Error:* File "${fileName}" is empty or not found!` 
                        });
                        return;
                    }
                } else {
                    await sock.sendMessage(jid, { 
                        text: `*❗ Error:* File "${fileName}" not found!\n\nAvailable files:\n${files.join('\n')}` 
                    });
                    return;
                }
            }

            await sock.sendMessage(jid, { 
                text: `✅ *Sending Completed!*\n\n📬 Sent: ${sentCount} message(s)\n Failed: ${failedCount}\n To: ${args[0]}\n\n✅ *Task finished successfully!*` 
            });

        } catch (error) {
            console.error('NumberBus error:', error);
            await sock.sendMessage(jid, { 
                text: `*❗ Error:* ${error.message}` 
            });
        }
    });
}

// Group Bus Command
async function handleGroupBus(jid, args, senderName) {
    if (args.length < 1) {
        await sock.sendMessage(jid, { 
            text: '* Usage:* .groupbus <jid> [file/ALL]\n\nExample:\n.groupbus 120363xxxxxxxxxx@g.us\n.groupbus 120363xxxxxxxxxx@g.us 1\n.groupbus 120363xxxxxxxxxx@g.us ALL' 
        });
        return;
    }

    const targetJid = args[0].includes('@g.us') ? args[0] : args[0] + '@g.us';
    const fileName = args[1] || 'ALL';
    const files = getFilesFromFolder(config.GROUPBUS_PATH);

    if (files.length === 0) {
        await sock.sendMessage(jid, { 
            text: `*❗ Error:* No files found in ${config.GROUPBUS_PATH} folder!\n\nPlease add .txt files to the groupbus folder.` 
        });
        return;
    }

    await sock.sendMessage(jid, { 
        text: `📤 *Sending to Group:* ${targetJid}\n📂 *File:* ${fileName}\n⏳ Please wait...` 
    });

    messageQueue.add(async () => {
        let sentCount = 0;
        let failedCount = 0;

        try {
            if (fileName.toUpperCase() === 'ALL') {
                // Send all files
                for (const file of files) {
                    try {
                        const content = readFileContent(config.GROUPBUS_PATH, file);
                        if (content) {
                            await sock.sendMessage(targetJid, { text: content });
                            sentCount++;
                            await new Promise(resolve => setTimeout(resolve, 2000)); // Delay between messages
                        }
                    } catch (err) {
                        console.error(`Error sending ${file}:`, err);
                        failedCount++;
                    }
                }
            } else {
                // Send specific file
                const targetFile = files.find(f => f === fileName || f === `${fileName}.txt`);
                if (targetFile) {
                    const content = readFileContent(config.GROUPBUS_PATH, targetFile);
                    if (content) {
                        await sock.sendMessage(targetJid, { text: content });
                        sentCount++;
                    } else {
                        await sock.sendMessage(jid, { 
                            text: `*❗ Error:* File "${fileName}" is empty or not found!` 
                        });
                        return;
                    }
                } else {
                    await sock.sendMessage(jid, { 
                        text: `*❗ Error:* File "${fileName}" not found!\n\nAvailable files:\n${files.join('\n')}` 
                    });
                    return;
                }
            }

            await sock.sendMessage(jid, { 
                text: `✅ *Sending Completed!*\n\n📬 Sent: ${sentCount} message(s)\n❌ Failed: ${failedCount}\n👥 To: Group\n\n✅ *Task finished successfully!*` 
            });

        } catch (error) {
            console.error('GroupBus error:', error);
            await sock.sendMessage(jid, { 
                text: `*❗ Error:* ${error.message}` 
            });
        }
    });
}

// Pair Command
async function handlePair(jid, args) {
    if (args.length < 1) {
        await sock.sendMessage(jid, { 
            text: '*❗ Usage:* .pair <number>\n\nExample:\n.pair 94771234567\n\nThis will send a pairing code to the specified number.' 
        });
        return;
    }

    const number = args[0].replace(/[^0-9]/g, '');
    
    try {
        // Generate pairing code
        const pairingCode = await sock.requestPairingCode(number);
        
        await sock.sendMessage(jid, { 
            text: `✅ *Pairing Code Generated!*\n\n📱 Number: ${number}\n🔢 Code: ${pairingCode}\n\n Enter this code in WhatsApp to link the bot.\n\n⏱️ Code expires in 2 minutes.` 
        });

        console.log(`Pairing code for ${number}: ${pairingCode}`);
        
    } catch (error) {
        console.error('Pairing error:', error);
        await sock.sendMessage(jid, { 
            text: `*❗ Error:* ${error.message}\n\nMake sure the number is correct and in international format (e.g., 94771234567)` 
        });
    }
}

// Initialize WhatsApp Bot
async function connectToWhatsApp() {
    ensureFolders();
    
    const { state, saveCreds } = await useMultiFileAuthState(config.SESSION_PATH);
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: require('pino')({ level: 'silent' }),
        browser: ['WNT BUS BOT', 'Chrome', '1.0.0']
    });

    // Initialize Telegram Bot
    telegramBot = new TelegramBot(sock);

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            qrcode.generate(qr, { small: true });
            console.log(' Scan QR Code to connect...');
        }
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed. Reconnecting:', shouldReconnect);
            
            if (shouldReconnect) {
                setTimeout(connectToWhatsApp, 5000);
            }
        } else if (connection === 'open') {
            console.log('✅ Connected to WhatsApp!');
            console.log('🤖 WNT BUS BOT is ready!');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const message = m.messages[0];
        if (!message.message) return;

        const jid = message.key.remoteJid;
        const senderName = message.pushName || 'User';
        const isGroup = jid.endsWith('@g.us');
        
        // Get message text
        const messageType = Object.keys(message.message)[0];
        const text = message.message[messageType]?.text || '';

        if (!text || !text.startsWith(config.PREFIX)) return;

        const args = text.slice(config.PREFIX.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        console.log(`📨 Command: ${command} from ${senderName}`);

        try {
            switch (command) {
                case 'menu':
                    await sendMenu(jid);
                    break;

                case 'numberbus':
                    await handleNumberBus(jid, args, senderName);
                    break;

                case 'groupbus':
                    await handleGroupBus(jid, args, senderName);
                    break;

                case 'pair':
                case 'paircode':
                    await handlePair(jid, args);
                    break;

                case 'ping':
                    await sock.sendMessage(jid, { text: '🟢 *Bot is online!*\n⚡ Fast and ready!' });
                    break;

                case 'help':
                    const helpText = `
* WNT BUS BOT - HELP GUIDE*

* SETUP:*
1. Add files to numberbus/ folder for number messaging
2. Add files to groupbus/ folder for group messaging
3. Each .txt file contains messages to send

*📱 NUMBER BUS:*
.numberbus <number> - Send ALL files
.numberbus <number> 1 - Send file 1.txt
.numberbus <number> ALL - Send all files

*👥 GROUP BUS:*
.groupbus <jid> - Send ALL files
.groupbus <jid> 1 - Send file 1.txt
.groupbus <jid> ALL - Send all files

*🔗 PAIRING:*
.pair <number> - Get pairing code

*💡 TIPS:*
- Files are sent one by one with 2s delay
- Queue system prevents message conflicts
- Use ALL to send all files at once

*🤖 Bot by WNT TEAM*
`;
                    await sock.sendMessage(jid, { text: helpText });
                    break;

                default:
                    await sock.sendMessage(jid, { 
                        text: `❗ Unknown command: ${command}\n\nType *.menu* to see all commands` 
                    });
            }
        } catch (error) {
            console.error('Command error:', error);
            await sock.sendMessage(jid, { 
                text: `*❗ Error:* ${error.message}` 
            });
        }
    });
}

// Start the bot
connectToWhatsApp().catch(console.error);

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    messageQueue.clear();
    process.exit();
});
