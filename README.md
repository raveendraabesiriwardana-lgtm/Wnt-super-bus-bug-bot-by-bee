# 🚀 WNT BUS BOT

Advanced WhatsApp Bot with Telegram Integration

## 📦 Installation

1. Clone this repository
2. Install dependencies:
```bash
npm install
```

3. Start the bot:
```bash
npm start
```

## 🔧 Configuration

Edit `config.js` to customize:
- BOT_NAME
- OWNER_NUMBER
- PREFIX
- TELEGRAM_BOT_TOKEN

## 📱 Commands

### WhatsApp Commands:
- `.menu` - Show all commands
- `.numberbus <number>` - Send files to number
- `.groupbus <jid>` - Send files to group
- `.pair <number>` - Generate pairing code
- `.ping` - Check bot status
- `.help` - Full help guide

### Telegram Commands:
- `/start` - Show welcome message
- `/pair <number>` - Generate pairing code
- `/status` - Check bot status
- `/menu` - Show commands
- `/help` - Full guide

##  Hosting

This bot can be hosted on:
- https://ominihost.ominisave.store
- Railway
- Render
- Heroku
- VPS

## 📂 File Structure

- `numberbus/` - Files for number messaging
- `groupbus/` - Files for group messaging
- `sessions/` - WhatsApp session (auto-created)

## 🔐 Pairing

1. Use `.pair 94771234567` in WhatsApp
2. Or `/pair 94771234567` in Telegram
3. Enter the code in WhatsApp > Settings > Linked Devices

## 📝 Features

✅ Queue system for message sending
✅ Auto delay between messages (2s)
✅ Success/Error notifications
✅ Telegram integration
✅ File-based messaging
✅ Multi-device support
✅ Pairing code authentication

## 👨‍💻 Made by WNT TEAM

## 📄 License

MIT License
