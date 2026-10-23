const TelegramBotAPI = require('node-telegram-bot-api');
const config = require('./config');

let instance = null;

class TelegramBot {
    constructor() {
        if (instance) return instance;
        instance = this;
        this.sock = null;
        this.waReady = false;
        this.pairBusy = false;
        this.bot = null;
        this.stopped = false;
        this.init();
    }

    setSock(sock) { this.sock = sock; this.waReady = false; }
    setWaReady(v) { this.waReady = v; }

    async init() {
        const token = String(config.TELEGRAM_BOT_TOKEN || '').trim();

        if (!token) {
            console.log('⚠️ TELEGRAM_BOT_TOKEN එකක් නෑ → Telegram bot OFF.');
            return;
        }

        try {
            const test = new TelegramBotAPI(token, { polling: false });
            test.on('error', (e) => console.error('Telegram error:', e.message));

            const me = await test.getMe();
            this.bot = test;
            console.log('✅ Telegram Bot සම්බන්ධ විය! @' + me.username);
            this.setupCommands();
            this.startSafePolling();
        } catch (e) {
            console.log('❌ Telegram token වැරදියි! Telegram bot OFF.');
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

            // socket එකක් තියෙනවා නම් attempt කරන්න දෙන්න (waReady check එක relax)
            if (!this.sock) {
                this.bot.sendMessage(chatId, '⏳ WhatsApp socket එක තවම හදන්නේ නෑ. තත්පර 10ක් රැඳී ආයෙම try කරන්න.');
                return;
            }

            if (!this.waReady) {
                this.bot.sendMessage(chatId, '⏳ WhatsApp socket එක තවම connect වෙමින් පවතී.\nතත්පර 10-20ක් රැඳී ආයෙම /pair ගහන්න.');
                return;
            }

            if (this.pairBusy) {
                this.bot.sendMessage(chatId, '⏳ කලින් pairing request එකක් සැකසෙමින් පවතී.');
                return;
            }

            this.pairBusy = true;
            try {
                console.log('🔑 Requesting pairing code for:', number);
                const code = await this.sock.requestPairingCode(number);
                this.bot.sendMessage(chatId,
                    `✅ *Pairing Code:* \n\n🔢 *${code}*\n\n*දැන් කරන්න:*\n1. WhatsApp open කරන්න\n2. Settings → Linked Devices\n3. "Link a Device" → "Link with phone number instead"\n4. Code එක දාන්න\n\n⏱️ විනාඩි 1-2ක් ඇතුළත දාන්න!`,
                    { parse_mode: 'Markdown' }
                );
                console.log('🔑 Pairing code sent for', number, ':', code);
            } catch (e) {
                const errMsg = (e && e.message) ? e.message : String(e);
                console.error('❌ Pairing error:', errMsg);
                this.bot.sendMessage(chatId,
                    `❌ Pairing error: ${errMsg}\n\nතත්පර 10කින් ආයෙම උත්සාහ කරන්න.`);
            } finally {
                this.pairBusy = false;
            }
        });

        this.bot.onText(/\/status/, (msg) => {
            let st;
            if (this.waReady && this.sock && this.sock.user) {
                st = '🟢 *Bot Online*\n✅ WhatsApp login වෙලා ඉවරයි';
            } else if (this.waReady) {
                st = '🟡 *Socket ready*\n🔑 Login වෙන්න /pair <number> ගහන්න';
            } else {
                st = '🔴 *WhatsApp socket connect වෙමින් පවතී*\n⏳ ටිකක් රැඳී සිටින්න';
            }
            this.bot.sendMessage(msg.chat.id, st, { parse_mode: 'Markdown' });
        });

        this.bot.onText(/\/help/, (msg) => {
            this.bot.sendMessage(msg.chat.id, "WhatsApp එකේ *.menu* ගසන්න සම්පූර්ණ විස්තර සඳහා.");
        });
    }
}

module.exports = TelegramBot;
