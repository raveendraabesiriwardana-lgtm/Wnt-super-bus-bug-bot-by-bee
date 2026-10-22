# 🚀 WNT BUS BOT - NUMBERED FILE SYSTEM

##  NEW FEATURES:

### *Number Reply System*
Each file now has a number. You can send files by number!

### *Unlimited Files*
Add as many files as you want to numberbus/groupbus folders!

### *Auto Sequential Sending*
Use "ALL" to send all files one by one automatically!

## 📋 COMMANDS:

### *NUMBER BUS:*

`.numberbus` - Show all available files with numbers

`.numberbus 94771234567 1` - Send file #1
`.numberbus 94771234567 2` - Send file #2
`.numberbus 94771234567 5` - Send file #5

`.numberbus 94771234567 ALL` - Send ALL files one by one!

### *GROUP BUS:*

`.groupbus` - Show all available files with numbers

`.groupbus 120363xxx@g.us 1` - Send file #1
`.groupbus 120363xxx@g.us 2` - Send file #2

`.groupbus 120363xxx@g.us ALL` - Send ALL files one by one!

## 📂 HOW TO ADD FILES:

### *GitHub Method:*
1. Go to numberbus/ or groupbus/ folder
2. Click "Add file" > "Create new file"
3. Name: offer3.txt (or any name.txt)
4. Add your content
5. Commit changes

### *Local Method:*
1. Open numberbus/ or groupbus/ folder
2. Create new .txt file
3. Add your message
4. Save and push to GitHub

## ✨ FEATURES:

✅ Auto file numbering
✅ Send by file number (1, 2, 3...)
✅ Send ALL files at once
✅ 3 second delay between messages
✅ Queue system (no conflicts)
✅ Success/Error notifications
✅ File counter [1/10], [2/10], etc.
✅ Unlimited files support
✅ Dynamic file list

##  EXAMPLE USAGE:

*User has 5 offer files:*
- offer1.txt
- offer2.txt
- offer3.txt
- offer4.txt
- offer5.txt

*Commands:*
.numberbus 94771234567        → Shows file list
.numberbus 94771234567 1      → Sends offer1.txt
.numberbus 94771234567 3      → Sends offer3.txt
.numberbus 94771234567 ALL    → Sends all 5 files one by one!

*Each message shows:*
[1/5] - Message 1
[2/5] - Message 2
[3/5] - Message 3
etc.

##  AUTO-UPDATE:

Files are automatically detected! Just add new .txt files to the folders and the bot will recognize them immediately.

No need to restart or update code!
