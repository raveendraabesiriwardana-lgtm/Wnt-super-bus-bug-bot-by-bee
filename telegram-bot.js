const TelegramBotAPI = require('node-telegram-bot-api');
const config = require('./config');

class TelegramBot {
    constructor(whatsappSock) {
        this.sock = whatsappSock;
        this.bot = null;
        this.errorCount = 0;
        this.lastErrorTime = Date.now();
        this.startBot();
    }

    startBot() {
        try {
            this.bot = new TelegramBotAPI(config.TELEGRAM_BOT_TOKEN, { 
                polling: {
                    interval: 300,
                    autoStart: true,
                    params: { timeout: 10 }
                }
            });
            this.setupCommands();
            console.log('✅ Telegram Bot සම්බන්ධ විය!');
        } catch (error) {
            console.error('❌ Telegram Bot start error:', error.message);
        }
    }

    setupCommands() {
        if (!this.bot) return;

        this.bot.on('polling_error', (error) => {
            this.errorCount++;
            const now = Date.now();
            
            // 10 errors 30 seconds වලට වැඩි නම්, polling stop කරන්න
            if (this.errorCount > 10 && (now - this.lastErrorTime) < 30000) {
                console.error('❌ Telegram Bot Token වැරදියි! Polling stopped.');
                console.error('⚠️ කරුණාකර @BotFather වෙතින් අලුත් token එකක් ලබාගෙන config.js වල update කරන්න');
                this.bot.stopPolling();
                return;
            }
            
            this.lastErrorTime = now;
            
            // Error count reset කරන්න 1 minute පස්සේ
            setTimeout(() => {
                this.errorCount = 0;
            }, 60000);
        });

        this.bot.onText(/\/start/, (msg) => {
            const helpText = `
🤖 *WNT BUS BOT - Telegram Control*

*Available Commands:*
/pair <number> - WhatsApp pairing code ලබා ගන්න
/help - සම්පූර්ණ උදව්
/status - Bot status එක බලන්න

*WhatsApp Commands:*
.menu - මෙනුව
.numberbus <number> [1 or ALL] - Number එකකට files යවන්න
.groupbus <jid> [1 or ALL] - Group එකකට files යවන්න
.pair <number> - Pairing code ලබා ගන්න
`;
            this.bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });
        });

        this.bot.onText(/\/pair\s+(\d+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const number = match[1];
            try {
                const code = await this.sock.requestPairingCode(number);
                this.bot.sendMessage(chatId, 
                    `✅ *Pairing Code:* \n\n🔢 *${code}*\n\nමේ code එක WhatsApp > Linked Devices > Link with phone number හි ඇතුලත් කරන්න.`, 
                    { parse_mode: 'Markdown' }
                );
            } catch (e) {
                this.bot.sendMessage(chatId, `❌ දෝෂයක්! number එක නිවැරදිදැයි බලන්න (උදා: 94771234567)`);
            }
        });

        this.bot.onText(/\/status/, (msg) => {
            const isConnected = this.sock && this.sock.user;
            this.bot.sendMessage(msg.chat.id, 
                isConnected ? 
                '🟢 *Bot Online*\n✅ WhatsApp සම්බන්ධයි' : 
                '🔴 *Bot Offline*\n❌ WhatsApp සම්බන්ධ නැත',
                { parse_mode: 'Markdown' }
            );
        });

        this.bot.onText(/\/help/, (msg) => {
            this.bot.sendMessage(msg.chat.id, 
                "WhatsApp එකේ *.help* ගසන්න සම්පූර්ණ විස්තර සඳහා.",
                { parse_mode: 'Markdown' }
            );
        });
    }
}

module.exports = TelegramBot;
