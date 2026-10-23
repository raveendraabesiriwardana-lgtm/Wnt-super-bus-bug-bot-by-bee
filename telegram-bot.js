const TelegramBotAPI = require('node-telegram-bot-api');
const config = require('./config');

let instance = null;

class TelegramBot {
    constructor(whatsappSock) {
        if (instance) return instance; // Reconnect වලදී අලුත් instance එකක් හදන්නේ නෑ
        instance = this;
        this.sock = whatsappSock;
        this.bot = null;
        this.stopped = false;
        this.init();
    }

    async init() {
        const token = String(config.TELEGRAM_BOT_TOKEN || '').trim();

        if (!token) {
            console.log('⚠️ TELEGRAM_BOT_TOKEN එකක් නෑ → Telegram bot එක OFF.');
            return;
        }

        try {
            const test = new TelegramBotAPI(token, { polling: false });
            test.on('error', (e) => console.error('Telegram error:', e.message));

            const me = await test.getMe(); // Token එක valid ද කියලා මුලින්ම check කරනවා
            this.bot = test;
            console.log('✅ Telegram Bot සම්බන්ධ විය! @' + me.username);
            this.setupCommands();
            this.startSafePolling();
        } catch (e) {
            console.log('❌ Telegram token එක වැරදියි! Telegram bot එක OFF කරනවා (loop එකක් නෑ).');
            console.log('⚠️ @BotFather ගෙන් අලුත් token එකක් ගෙන OminiHost > Variables > TELEGRAM_BOT_TOKEN එකේ දාන්න.');
            this.bot = null;
        }
    }

    startSafePolling() {
        if (!this.bot || this.stopped) return;
        let errCount = 0;
        this.bot.on('polling_error', (e) => {
            errCount++;
            if (errCount <= 3) console.error('Telegram polling error:', e.message);
            if (errCount >= 5 && !this.stopped) {
                this.stopped = true;
                console.log('❌ Telegram polling නවත්තනවා.');
                try { this.bot.stopPolling(); } catch (_) {}
            }
        });
        this.bot.startPolling({ interval: 1000, params: { timeout: 10 } });
    }

    setupCommands() {
        if (!this.bot) return;

        this.bot.onText(/\/start/, (msg) => {
            const helpText = `
🤖 *WNT BUS BOT - Telegram Control*

*Commands:*
/pair <number> - WhatsApp pairing code ලබා ගන්න
/status - Bot status එක
/help - සම්පූර්ණ උදව්

*WhatsApp Commands:*
.menu - මෙනුව
.numberbus <number> [1 or ALL]
.groupbus <jid> [1 or ALL]
.pair <number>
`;
            this.bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });
        });

        this.bot.onText(/\/pair\s+(\d+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const number = match[1];
            try {
                const code = await this.sock.requestPairingCode(number);
                this.bot.sendMessage(chatId,
                    `✅ *Pairing Code:* \n\n🔢 *${code}*\n\nWhatsApp > Linked Devices > Link with phone number හි දාන්න.`,
                    { parse_mode: 'Markdown' }
                );
            } catch (e) {
                this.bot.sendMessage(chatId, `❌ දෝෂයක්! number එක බලන්න (උදා: 94771234567)`);
            }
        });

        this.bot.onText(/\/status/, (msg) => {
            const ok = this.sock && this.sock.user;
            this.bot.sendMessage(msg.chat.id,
                ok ? '🟢 *Bot Online*\n✅ WhatsApp සම්බන්ධයි' : '🟡 *WhatsApp login වෙන්න රැඳී සිටී*',
                { parse_mode: 'Markdown' }
            );
        });

        this.bot.onText(/\/help/, (msg) => {
            this.bot.sendMessage(msg.chat.id, "WhatsApp එකේ *.menu* ගසන්න සම්පූර්ණ විස්තර සඳහා.");
        });
    }
}

module.exports = TelegramBot;
