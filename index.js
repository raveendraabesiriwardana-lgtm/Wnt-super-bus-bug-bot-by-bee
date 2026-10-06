import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidNormalizedUser
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import pino from 'pino'
import fs from 'fs'
import path from 'path'
import TelegramBot from 'node-telegram-bot-api'

// ====================== CONFIG ======================
const SPECIAL_NUMBERS = [
  '94767488626',
  '94754950042',
  '94712207184',
  '94705727575'
]

const PREMIUM_PASSWORD = '2014226bihadu#£%/÷=×()?9'
const PREFIX = '.'
const DELAY_MS = 2500

const NUMBERBUS_DIR = './numberbus'
const GROUPBUS_DIR  = './groupbus'
const CHANNELBUS_DIR = './channelbus'
const PREMIUM_FILE  = './premium.json'
const AUTH_DIR = './auth_info'

const TELEGRAM_TOKEN = '8962244605:AAFzE6tVQLAD-xZF-XDSiWtFwMWfe-2yzSA'
const TELEGRAM_BOT_LINK = 'http://t.me/Wnt_bus_bot'
// ====================================================

let isBusy = false
let sock = null
let isConnected = false

const sleep = ms => new Promise(r => setTimeout(r, ms))

function ensureDirs() {
  [NUMBERBUS_DIR, GROUPBUS_DIR, CHANNELBUS_DIR, AUTH_DIR].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
  })
  if (!fs.existsSync(PREMIUM_FILE)) fs.writeFileSync(PREMIUM_FILE, '[]')
}

function loadPremium() {
  try { return JSON.parse(fs.readFileSync(PREMIUM_FILE, 'utf8')) } 
  catch { return [] }
}

function savePremium(list) {
  fs.writeFileSync(PREMIUM_FILE, JSON.stringify(list, null, 2))
}

function getNumber(jid) {
  return jidNormalizedUser(jid).replace(/\D/g, '')
}

function isSpecial(jid) {
  const num = getNumber(jid)
  return SPECIAL_NUMBERS.some(s => num.endsWith(s))
}

function isPremium(jid) {
  const num = getNumber(jid)
  const list = loadPremium()
  return list.some(p => num.endsWith(p.replace(/\D/g, '')))
}

function canUseBot(jid) {
  return isSpecial(jid) || isPremium(jid)
}

function getTextFiles(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter(f => f.toLowerCase().endsWith('.txt'))
    .sort()
    .map(f => path.join(dir, f))
}

function getVideoFiles(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter(f => /\.(mp4|mkv|avi|mov|webm)$/i.test(f))
    .sort()
    .map(f => path.join(dir, f))
}

function normalizeNumber(input) {
  let n = String(input).replace(/\D/g, '')
  if (n.startsWith('0')) n = '94' + n.slice(1)
  return n
}

function isBotConnected() {
  return isConnected === true
}

function clearAuth() {
  isConnected = false
  if (fs.existsSync(AUTH_DIR)) {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true })
    fs.mkdirSync(AUTH_DIR, { recursive: true })
    console.log('🧹 auth_info cleaned')
  }
}

// ====================== WHATSAPP BOT ======================
async function startWhatsApp() {
  ensureDirs()
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
  const { version } = await fetchLatestBaileysVersion()

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['WNT SUPER BUGIY BOT BY BEE', 'Chrome', '2.5.0'],
    markOnlineOnConnect: false,
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      isConnected = false
      console.log('⏳ QR/Pairing ready. Telegram Bot එකට /pair <number> ගහලා Pair Code ගන්න')
    }

    if (connection === 'open') {
      isConnected = true
      console.log('✅ WhatsApp Bot Connected!')
    }

    if (connection === 'close') {
      isConnected = false
      const shouldReconnect = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
        : true
      if (shouldReconnect) {
        setTimeout(() => startWhatsApp(), 3000)
      }
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    const msg = messages[0]
    if (!msg.message || msg.key.fromMe) return

    const from = msg.key.remoteJid
    const sender = msg.key.participant || from
    const body = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim()

    if (!body.startsWith(PREFIX)) return

    const parts = body.slice(PREFIX.length).trim().split(/\s+/)
    const cmd = parts[0].toLowerCase()
    const args = parts.slice(1)

    // ===== .menu =====
    if (cmd === 'menu' || cmd === 'help') {
      await sock.sendMessage(from, {
        text: `*🤖 WNT SUPER BUGIY BOT BY BEE*\n\n` +
              `📋 *Commands:*\n` +
              `• .numberbus <number> [count]\n` +
              `• .groupbus <jid/lid> [count]\n` +
              `• .channelbus <channel jid> [count]\n` +
              `• .bustxtandvideo\n` +
              `• .pair <number>\n` +
              `• .addpremium <number> <password>\n\n` +
              `🔗 *Pair කරන විදිහ:*\n` +
              `Telegram Bot: ${TELEGRAM_BOT_LINK}\n` +
              `/pair 9477XXXXXXX`
      })
      return
    }

    // ===== .addpremium =====
    if (cmd === 'addpremium') {
      if (isPremium(sender) && !isSpecial(sender)) {
        await sock.sendMessage(from, { text: '❌ Premium users cannot add premium' })
        return
      }

      if (args.length < 1) {
        await sock.sendMessage(from, { text: 'Usage:\n.addpremium <number>\n.addpremium <number> <password>' })
        return
      }

      const number = normalizeNumber(args[0])
      const pass = args.slice(1).join(' ')

      if (!isSpecial(sender)) {
        if (pass !== PREMIUM_PASSWORD) {
          await sock.sendMessage(from, { text: '❌ Wrong password හෝ ඔබට permission නැහැ' })
          return
        }
      }

      let list = loadPremium()
      if (list.includes(number)) {
        await sock.sendMessage(from, { text: `⚠️ ${number} already premium` })
        return
      }
      list.push(number)
      savePremium(list)
      await sock.sendMessage(from, { text: `✅ Premium added successfully\nNumber: ${number}` })
      return
    }

    // Permission check
    if (!canUseBot(sender)) {
      await sock.sendMessage(from, { text: '❌ ඔබට bot භාවිතා කිරීමට permission නැහැ.\n.menu ගහලා බලන්න.' })
      return
    }

    try {
      // ===== .bustxtandvideo =====
      if (cmd === 'bustxtandvideo') {
        const n = getTextFiles(NUMBERBUS_DIR).length
        const g = getTextFiles(GROUPBUS_DIR).length
        const c = getVideoFiles(CHANNELBUS_DIR).length
        await sock.sendMessage(from, {
          text: `📂 *Folder Status*\n\n• numberbus → ${n} txt\n• groupbus → ${g} txt\n• channelbus → ${c} video`
        })
        return
      }

      // ===== .pair =====
      if (cmd === 'pair') {
        if (isBotConnected()) {
          await sock.sendMessage(from, { 
            text: '❌ Bot එක දැනටම Connected වෙලා තියෙනවා.\nඅලුතෙන් pair කරන්න ඕන නම් කලින් logout කරන්න.' 
          })
          return
        }

        if (args.length < 1) {
          await sock.sendMessage(from, { text: 'Usage: .pair 9477XXXXXXX' })
          return
        }

        const number = normalizeNumber(args[0])
        try {
          clearAuth()
          // Restart socket after clearing auth
          setTimeout(() => startWhatsApp(), 1000)
          await sock.sendMessage(from, { 
            text: '🧹 Session cleaned.\nමදක් ඉන්න... ඊට පස්සේ ආයෙත් .pair ගහන්න හෝ Telegram එකෙන් /pair ගහන්න.' 
          })
        } catch (e) {
          await sock.sendMessage(from, { text: '❌ Error: ' + e.message })
        }
        return
      }

      // ===== .numberbus =====
      if (cmd === 'numberbus') {
        if (isBusy) {
          await sock.sendMessage(from, { text: '⏳ Bot එක දැනට busy. මදක් ඉන්න...' })
          return
        }
        if (args.length < 1) {
          await sock.sendMessage(from, { text: 'Usage: .numberbus <number> [count]' })
          return
        }

        isBusy = true
        try {
          const jid = normalizeNumber(args[0]) + '@s.whatsapp.net'
          let count = args[1] ? parseInt(args[1]) : null
          let files = getTextFiles(NUMBERBUS_DIR)
          if (!files.length) {
            await sock.sendMessage(from, { text: '❌ numberbus folder එකේ txt නැහැ' })
            return
          }
          if (count > 0) files = files.slice(0, count)

          await sock.sendMessage(from, { text: `📤 numberbus started...\nTotal: ${files.length}` })

          let success = 0, failed = 0
          for (let i = 0; i < files.length; i++) {
            try {
              const text = fs.readFileSync(files[i], 'utf8').trim()
              if (text) {
                await sock.sendMessage(jid, { text })
                success++
              }
            } catch { failed++ }

            if ((i + 1) % 5 === 0 || i === files.length - 1) {
              await sock.sendMessage(from, { text: `⏳ Progress: \( {i + 1}/ \){files.length}` })
            }
            await sleep(DELAY_MS)
          }
          await sock.sendMessage(from, {
            text: `✅ numberbus ඉවරයි\n\n✔️ Success: ${success}\n❌ Failed: ${failed}`
          })
        } finally {
          isBusy = false
        }
      }

      // ===== .groupbus =====
      else if (cmd === 'groupbus') {
        if (isBusy) {
          await sock.sendMessage(from, { text: '⏳ Bot එක දැනට busy. මදක් ඉන්න...' })
          return
        }
        if (args.length < 1) {
          await sock.sendMessage(from, { text: 'Usage: .groupbus <jid> [count]' })
          return
        }

        isBusy = true
        try {
          const jid = args[0]
          let count = args[1] ? parseInt(args[1]) : null
          let files = getTextFiles(GROUPBUS_DIR)
          if (!files.length) {
            await sock.sendMessage(from, { text: '❌ groupbus folder එකේ txt නැහැ' })
            return
          }
          if (count > 0) files = files.slice(0, count)

          await sock.sendMessage(from, { text: `📤 groupbus started...\nTotal: ${files.length}` })

          let success = 0, failed = 0
          for (let i = 0; i < files.length; i++) {
            try {
              const text = fs.readFileSync(files[i], 'utf8').trim()
              if (text) {
                await sock.sendMessage(jid, { text })
                success++
              }
            } catch { failed++ }

            if ((i + 1) % 5 === 0 || i === files.length - 1) {
              await sock.sendMessage(from, { text: `⏳ Progress: \( {i + 1}/ \){files.length}` })
            }
            await sleep(DELAY_MS)
          }
          await sock.sendMessage(from, {
            text: `✅ groupbus ඉවරයි\n\n✔️ Success: ${success}\n❌ Failed: ${failed}`
          })
        } finally {
          isBusy = false
        }
      }

      // ===== .channelbus =====
      else if (cmd === 'channelbus') {
        if (isBusy) {
          await sock.sendMessage(from, { text: '⏳ Bot එක දැනට busy. මදක් ඉන්න...' })
          return
        }
        if (args.length < 1) {
          await sock.sendMessage(from, { text: 'Usage: .channelbus <channeljid> [count]' })
          return
        }

        isBusy = true
        try {
          let jid = args[0]
          if (!jid.includes('@')) jid += '@newsletter'
          let count = args[1] ? parseInt(args[1]) : null
          let files = getVideoFiles(CHANNELBUS_DIR)
          if (!files.length) {
            await sock.sendMessage(from, { text: '❌ channelbus folder එකේ video නැහැ' })
            return
          }
          if (count > 0) files = files.slice(0, count)

          await sock.sendMessage(from, { text: `📤 channelbus started...\nTotal: ${files.length}` })

          let success = 0, failed = 0
          for (let i = 0; i < files.length; i++) {
            try {
              await sock.sendMessage(jid, {
                video: { url: files[i] },
                caption: path.basename(files[i])
              })
              success++
            } catch { failed++ }

            await sock.sendMessage(from, { text: `⏳ Progress: \( {i + 1}/ \){files.length}` })
            await sleep(DELAY_MS + 2000)
          }
          await sock.sendMessage(from, {
            text: `✅ channelbus ඉවරයි\n\n✔️ Success: ${success}\n❌ Failed: ${failed}`
          })
        } finally {
          isBusy = false
        }
      }

    } catch (err) {
      console.error(err)
      isBusy = false
      await sock.sendMessage(from, { text: 'Error: ' + err.message })
    }
  })
}

// ====================== TELEGRAM BOT ======================
function startTelegram() {
  const tg = new TelegramBot(TELEGRAM_TOKEN, { polling: true })

  tg.onText(/\/pair (.+)/, async (msg, match) => {
    const chatId = msg.chat.id
    const number = normalizeNumber(match[1])

    if (isBotConnected()) {
      return tg.sendMessage(chatId, 
        '❌ Bot එක දැනටම Connected වෙලා තියෙනවා.\nඅලුතෙන් pair කරන්න ඕන නම් කලින් logout කරන්න.'
      )
    }

    if (!sock) {
      return tg.sendMessage(chatId, '❌ WhatsApp bot තාම ready නැහැ. මදක් ඉන්න.')
    }

    try {
      clearAuth()

      // Socket එක restart වෙනකල් පොඩ්ඩක් ඉන්න
      await new Promise(r => setTimeout(r, 2000))

      const code = await sock.requestPairingCode(number)

      if (!code) {
        return tg.sendMessage(chatId, '❌ Pair code එක generate වුණේ නැහැ. ආයෙත් try කරන්න.')
      }

      await tg.sendMessage(chatId, 
        `🔗 *Pair Code for ${number}*\n\n` +
        `\`${code}\`\n\n` +
        `WhatsApp → Linked Devices → Link with phone number → Code එක දාන්න\n\n` +
        `⚠️ Code එක 1-2 මිනිත්තු ඇතුළත දාන්න`,
        { parse_mode: 'Markdown' }
      )
    } catch (e) {
      console.error('Pair error:', e)
      tg.sendMessage(chatId, '❌ Failed: ' + (e.message || e))
    }
  })

  tg.onText(/\/start/, (msg) => {
    tg.sendMessage(msg.chat.id, 
      `🤖 *WNT SUPER BUGIY BOT*\n\n` +
      `Pair code ගන්න:\n/pair 9477XXXXXXX\n\n` +
      `උදාහරණ:\n/pair 94771924811`,
      { parse_mode: 'Markdown' }
    )
  })

  console.log('✅ Telegram Bot Started →', TELEGRAM_BOT_LINK)
}

// Start both
startWhatsApp()
startTelegram()
