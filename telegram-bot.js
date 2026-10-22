const TelegramBotAPI = require('node-telegram-bot-api');
const config = require('./config');

class TelegramBot {
    constructor(whatsappSock) {
        this.sock = whatsappSock;
        this.bot = new TelegramBotAPI(config.TELEGRAM_BOT_TOKEN, { polling: true });
        this.setupCommands();
        console.log('✅ Telegram Bot සම්බන්ධ විය!');
    }

    setupCommands() {
        this.bot.onText(/\/start/, (msg) => {
            const helpText = `
🤖 *WNT BUS BOT - Telegram Control*

*Available Commands:*
/pair <number> - WhatsApp pairing code එක ලබා ගන්න (උදා: /pair 94771234567)
/help - සම්පූර්ණ උදව්

*WhatsApp එකේ භාවිතා කරන Commands:*
.menu - මෙනුව පෙන්වයි
.numberbus <number> [1 හෝ ALL] - Number එකකට files යවයි
.groupbus <jid> [1 හෝ ALL] - Group එකකට files යවයි
.pair <number> - Pairing code එක ලබා ගනී
`;
            this.bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });
        });

        this.bot.onText(/\/pair\s+(\d+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const number = match[1];
            try {
                const code = await this.sock.requestPairingCode(number);
                this.bot.sendMessage(chatId, `✅ *Pairing Code:* \n\n🔢 *${code}*\n\nමේ code එක WhatsApp > Linked Devices > Link with phone number හි ඇතුලත් කරන්න.`, { parse_mode: 'Markdown' });
            } catch (e) {
                this.bot.sendMessage(chatId, `❌ දෝෂයක්! number එක නිවැරදිදැයි බලන්න (උදා: 94771234567)`);
            }
        });

        this.bot.onText(/\/help/, (msg) => {
            this.bot.sendMessage(msg.chat.id, "WhatsApp එකේ .help ගසන්න සම්පූර්ණ විස්තර සඳහා.", { parse_mode: 'Markdown' });
        });
    }
}

module.exports = TelegramBot;
