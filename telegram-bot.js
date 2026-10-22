const TelegramBotAPI = require('node-telegram-bot-api');
const config = require('./config');

class TelegramBot {
    constructor(whatsappSock) {
        this.sock = whatsappSock;
        this.bot = new TelegramBotAPI(config.TELEGRAM_BOT_TOKEN, { polling: true });
        this.userSessions = {};
        
        this.setupCommands();
        console.log('✅ Telegram Bot initialized!');
    }

    setupCommands() {
        // /start command
        this.bot.onText(/\/start/, (msg) => {
            const chatId = msg.chat.id;
            const helpText = `
🤖 *WNT BUS BOT - Telegram Control Panel*

*📱 Available Commands:*

*/pair <number>*
Generate WhatsApp pairing code
Example: /pair 94771234567

*/status*
Check bot connection status

*/menu*
Show all WhatsApp commands

*/help*
Detailed help guide

*🔧 WhatsApp Commands:*
Once paired, use these in WhatsApp:

*.menu* - Show all commands
*.numberbus <number>* - Send files to number
*.groupbus <jid>* - Send files to group
*.pair <number>* - Generate pairing code

*📝 How to Pair:*
1. Send: /pair 94771234567
2. You'll receive a pairing code
3. Open WhatsApp on your phone
4. Go to Settings > Linked Devices
5. Tap "Link a Device"
6. Enter the pairing code

* File Structure:*
- numberbus/ - Files for number messaging
- groupbus/ - Files for group messaging
- Each .txt file = 1 message

*💡 Tips:*
- Use ALL to send all files
- Files sent with 2s delay
- Queue system prevents conflicts

*🌐 Bot is hosted on:*
https://ominihost.ominisave.store

*Made with ❤️ by WNT TEAM*
`;
            this.bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
        });

        // /pair command
        this.bot.onText(/\/pair\s+(\d+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const number = match[1];

            try {
                const pairingCode = await this.sock.requestPairingCode(number);
                
                const response = `
✅ *Pairing Code Generated!*

📱 Number: ${number}
🔢 Code: *${pairingCode}*

📲 *How to use:*
1. Open WhatsApp on your phone
2. Go to Settings > Linked Devices
3. Tap "Link a Device"
4. Enter code: ${pairingCode}

⏱️ Code expires in 2 minutes
`;
                this.bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
                console.log(`Pairing code for ${number}: ${pairingCode}`);
                
            } catch (error) {
                this.bot.sendMessage(chatId, `❗ *Error:* ${error.message}\n\nMake sure the number is correct (e.g., 94771234567)`);
            }
        });

        // /status command
        this.bot.onText(/\/status/, (msg) => {
            const chatId = msg.chat.id;
            const isConnected = this.sock && this.sock.user;
            
            this.bot.sendMessage(chatId, 
                isConnected ? 
                ' *Bot Status: ONLINE*\n✅ Connected to WhatsApp' : 
                ' *Bot Status: OFFLINE*\n❌ Not connected to WhatsApp',
                { parse_mode: 'Markdown' }
            );
        });

        // /menu command
        this.bot.onText(/\/menu/, (msg) => {
            const chatId = msg.chat.id;
            const menuText = `
*📱 WNT BUS BOT - COMMANDS*

*NUMBER BUS:*
/numberbus <number> - Send all files
/numberbus <number> 1 - Send file 1
/numberbus <number> ALL - Send all

*GROUP BUS:*
/groupbus <jid> - Send all files
/groupbus <jid> 1 - Send file 1
/groupbus <jid> ALL - Send all

*PAIRING:*
/pair <number> - Get pairing code

*INFO:*
/status - Check bot status
/help - Full help guide

*Use in WhatsApp (not Telegram):*
.menu - Show menu
.ping - Check if online
`;
            this.bot.sendMessage(chatId, menuText, { parse_mode: 'Markdown' });
        });

        // /help command
        this.bot.onText(/\/help/, (msg) => {
            const chatId = msg.chat.id;
            const helpText = `
*📖 COMPLETE GUIDE*

*1️⃣ PAIRING:*
Use /pair 94771234567 to get a pairing code
Enter this code in WhatsApp to link the bot

*2️⃣ NUMBER BUS:*
Add .txt files to numberbus/ folder
Use .numberbus <number> in WhatsApp to send

Example:
.numberbus 94771234567 - Sends all files
.numberbus 94771234567 1 - Sends 1.txt
.numberbus 94771234567 ALL - Sends all

*3️ GROUP BUS:*
Add .txt files to groupbus/ folder
Use .groupbus <jid> in WhatsApp to send

Example:
.groupbus 120363xxxxxxx@g.us - All files
.groupbus 120363xxxxxxx@g.us 1 - 1.txt
.groupbus 120363xxxxxxx@g.us ALL - All files

*4️⃣ FEATURES:*
✅ Queue system - No message conflicts
✅ Auto delay - 2s between messages
✅ Success confirmation
✅ Error handling
✅ File-based messaging

*5️⃣ HOSTING:*
This bot can be hosted on:
https://ominihost.ominisave.store

Upload files to GitHub and deploy!

*Need help? Contact WNT TEAM*
`;
            this.bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
        });

        // Handle unknown commands
        this.bot.on('message', (msg) => {
            if (msg.text && msg.text.startsWith('/')) {
                // Unknown command
                this.bot.sendMessage(msg.chat.id, 
                    '❗ Unknown command. Use /start to see available commands.'
                );
            }
        });
    }
}

module.exports = TelegramBot;
