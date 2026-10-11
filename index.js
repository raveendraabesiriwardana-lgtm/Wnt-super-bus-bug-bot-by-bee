require("dotenv").config();

const fs = require("fs");
const path = require("path");
const TelegramBot = require("node-telegram-bot-api");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");

// ---------- Configuration ----------

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TELEGRAM_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN .env එකේ සකසන්න.");
  process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_TOKEN, {
  polling: true
});

// ---------- Existing folders ----------

const folders = {
  numberbus: path.join(__dirname, "numberbus"),
  groupbus: path.join(__dirname, "groupbus"),
  channelbus: path.join(__dirname, "channelbus")
};

for (const folder of Object.values(folders)) {
  fs.mkdirSync(folder, { recursive: true });
}

const SESSIONS_DIR = path.join(__dirname, "sessions");
fs.mkdirSync(SESSIONS_DIR, { recursive: true });

// ---------- Existing functions ----------

let activeJob = false;

function getFiles(folder, extensions) {
  return fs.readdirSync(folder, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .filter(name =>
      extensions.includes(path.extname(name).toLowerCase())
    )
    .sort()
    .map(name => path.join(folder, name));
}

function getTextMessages(folder) {
  return getFiles(folder, [".txt"]).map(file => ({
    name: path.basename(file),
    text: fs.readFileSync(file, "utf8")
  }));
}

function getVideos(folder) {
  return getFiles(folder, [".mp4", ".mov", ".webm"])
    .map(file => ({
      name: path.basename(file),
      path: file
    }));
}

async function runExclusiveJob(job) {
  if (activeJob) {
    return {
      ok: false,
      message: "දැනට job එකක් ක්‍රියාත්මකයි. පසුව උත්සාහ කරන්න."
    };
  }

  activeJob = true;

  try {
    await job();
    return { ok: true, message: "Job එක අවසන්." };
  } catch (error) {
    console.error("Job error:", error.message);
    return { ok: false, message: "Job එක අසාර්ථකයි." };
  } finally {
    activeJob = false;
  }
}

function getFolderCounts() {
  return {
    numberbus: getFiles(folders.numberbus, [".txt"]).length,
    groupbus: getFiles(folders.groupbus, [".txt"]).length,
    channelbus: getVideos(folders.channelbus).length
  };
}

// ---------- WhatsApp sessions ----------

const sessions = new Map();
const awaitingNumber = new Set();

// WhatsApp command conversations.
// Each flow belongs to one WhatsApp session and chat.
const commandFlows = new Map();

function getSessionDir(userId) {
  if (!/^\d+$/.test(String(userId))) {
    throw new Error("Invalid Telegram user ID");
  }

  return path.join(SESSIONS_DIR, String(userId));
}

function normalizePhoneNumber(input) {
  const number = String(input || "").replace(/\D/g, "");

  if (number.length < 8 || number.length > 15) {
    return null;
  }

  return number;
}

function getSession(userId) {
  userId = String(userId);

  if (!sessions.has(userId)) {
    sessions.set(userId, {
      sock: null,
      starting: false,
      reconnectTimer: null
    });
  }

  return sessions.get(userId);
}

function isPrivateChat(msg) {
  return msg.chat?.type === "private";
}

async function safeSend(chatId, text) {
  try {
    await bot.sendMessage(chatId, text);
  } catch (error) {
    console.error("Telegram send error:", error.message);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------- WhatsApp pairing ----------

async function startWhatsApp(userId, phoneNumber = null) {
  userId = String(userId);

  const session = getSession(userId);

  if (session.starting || session.sock) {
    return;
  }

  session.starting = true;

  let sock;

  try {
    const sessionDir = getSessionDir(userId);
    fs.mkdirSync(sessionDir, { recursive: true });

    const { state, saveCreds } =
      await useMultiFileAuthState(sessionDir);

    if (state.creds.registered) {
      phoneNumber = null;
    }

    sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      browser: ["WNT SUPER BUGIY BOT BY BEE", "Chrome", "1.0.0"]
    });

    session.sock = sock;
    session.starting = false;

    let pairingRequested = false;

    sock.ev.on("creds.update", saveCreds);

    // Request the pairing code without waiting for a QR event.
    if (phoneNumber && !state.creds.registered) {
      (async () => {
        await sleep(1500);

        if (
          session.sock !== sock ||
          pairingRequested ||
          state.creds.registered
        ) {
          return;
        }

        pairingRequested = true;

        try {
          const code = await sock.requestPairingCode(phoneNumber);

          await safeSend(
            userId,
            "🔐 WhatsApp Pairing Code\n\n" +
            code + "\n\n" +
            "WhatsApp app එක විවෘත කරන්න:\n" +
            "Settings → Linked devices → Link a device → " +
            "Link with phone number instead\n\n" +
            "ඔයාගේම WhatsApp account එකට පමණක් මේ code එක භාවිත කරන්න."
          );

          console.log(`[${userId}] Pairing code generated.`);
        } catch (error) {
          console.error(`[${userId}] Pairing error:`, error.message);

          await safeSend(
            userId,
            "❌ Pairing code ලබාගන්න බැරි වුණා.\n" +
            "Number එක country code සමඟ නිවැරදිද බලලා /pair නැවත භාවිත කරන්න."
          );
        }
      })().catch(error => {
        console.error("Pairing task error:", error.message);
      });
    }

    sock.ev.on("connection.update", async update => {
      const { connection, lastDisconnect } = update;

      if (connection === "open") {
        console.log(`[${userId}] WhatsApp connected.`);

        await safeSend(
          userId,
          "✅ WhatsApp connect වුණා!\n\n" +
          "Commands භාවිත කිරීමට WhatsApp හි Message yourself chat එක විවෘත කරන්න.\n" +
          ".menu යවලා ආරම්භ කරන්න."
        );

        if (session.reconnectTimer) {
          clearTimeout(session.reconnectTimer);
          session.reconnectTimer = null;
        }
      }

      if (connection === "close") {
        const statusCode =
          lastDisconnect?.error?.output?.statusCode;

        console.log(
          `[${userId}] WhatsApp disconnected:`,
          statusCode || "unknown"
        );

        if (session.sock !== sock) {
          return;
        }

        session.sock = null;
        session.starting = false;

        if (session.reconnectTimer) {
          clearTimeout(session.reconnectTimer);
          session.reconnectTimer = null;
        }

        if (statusCode === DisconnectReason.loggedOut) {
          await safeSend(
            userId,
            "⚠️ WhatsApp session එක logout වෙලා.\n" +
            "නැවත connect වීමට /pair භාවිත කරන්න."
          );
          return;
        }

        session.reconnectTimer = setTimeout(() => {
          session.reconnectTimer = null;

          startWhatsApp(userId, null).catch(error => {
            console.error("Reconnect error:", error.message);
          });
        }, 3000);
      }
    });

    // Only process commands sent by the linked account itself.
    // Incoming messages from other people are not allowed to start jobs.
    sock.ev.on("messages.upsert", async ({ messages }) => {
      for (const message of messages) {
        try {
          if (!message.message || !message.key.fromMe) {
            continue;
          }

          const jid = message.key.remoteJid || "";

          if (
            jid === "status@broadcast" ||
            jid.endsWith("@g.us") ||
            jid.endsWith("@newsletter") ||
            jid.endsWith("@broadcast")
          ) {
            continue;
          }

          const text =
            message.message.conversation ||
            message.message.extendedTextMessage?.text ||
            "";

          if (!text.trim()) {
            continue;
          }

          await handleWhatsAppCommand(userId, sock, jid, text.trim());
        } catch (error) {
          console.error(
            `[${userId}] Message handler error:`,
            error.message
          );
        }
      }
    });

  } catch (error) {
    console.error(`[${userId}] WhatsApp startup error:`, error.message);

    if (session.sock === sock || !sock) {
      session.sock = null;
    }

    session.starting = false;

    await safeSend(
      userId,
      "❌ WhatsApp connection එක ආරම්භ කරන්න බැරි වුණා.\n" +
      "ටිකකින් නැවත උත්සාහ කරන්න."
    );
  }
}

// ---------- WhatsApp command helpers ----------

function flowKey(userId, jid) {
  return `${userId}:${jid}`;
}

async function replyWhatsApp(sock, jid, text) {
  return sock.sendMessage(jid, { text });
}

function getFlowFiles(type) {
  if (type === "numberbus" || type === "groupbus") {
    return getTextMessages(folders[type]).map(file => ({
      name: file.name,
      path: path.join(folders[type], file.name),
      type: "text",
      text: file.text
    }));
  }

  if (type === "channelbus") {
    return getVideos(folders.channelbus).map(file => ({
      name: file.name,
      path: file.path,
      type: "video"
    }));
  }

  return [];
}

function fileListText(type, files) {
  const title = {
    numberbus: "📁 NUMBERBUS TEXT FILES",
    groupbus: "📁 GROUPBUS TEXT FILES",
    channelbus: "🎬 CHANNELBUS VIDEO FILES"
  }[type];

  if (files.length === 0) {
    return `${title}\n\n❌ මේ folder එකේ යැවිය හැකි files නැහැ.`;
  }

  return (
    `${title}\n\n` +
    files.map((file, index) =>
      `${index + 1}. ${file.name}`
    ).join("\n") +
    `\n\nFiles ගණන: ${files.length}`
  );
}

async function handleWhatsAppCommand(userId, sock, jid, text) {
  const key = flowKey(userId, jid);
  const lower = text.toLowerCase();

  if (lower === ".cancel") {
    commandFlows.delete(key);
    await replyWhatsApp(sock, jid, "❌ Current operation එක cancel කළා.");
    return;
  }

  if (lower === ".menu") {
    commandFlows.delete(key);

    await replyWhatsApp(
      sock,
      jid,
      "🐝 WNT SUPER BUGIY BOT BY BEE\n\n" +
      "📌 COMMAND MENU\n\n" +
      ".menu - මේ menu එක\n" +
      ".numberbus - Text files බලන්න සහ අංකයකට යවන්න\n" +
      ".groupbus - Text files group එකකට යවන්න\n" +
      ".channelbus - Video files බලන්න සහ target එකක් තෝරන්න\n" +
      ".cancel - දැනට කරන වැඩේ නවත්වන්න\n\n" +
      "භාවිත කරන විදිහ:\n" +
      "1. Command එක යවන්න.\n" +
      "2. Target number/JID එක දෙන්න.\n" +
      "3. File numbers හෝ all තෝරන්න.\n" +
      "4. CONFIRM යවලා තහවුරු කරන්න.\n\n" +
      "⚠️ අවසර ඇති recipients පමණක් තෝරන්න.\n" +
      "එක් වරකට උපරිම files 5ක් යැවිය හැක."
    );
    return;
  }

  const command = lower.split(/\s+/)[0];

  if ([".numberbus", ".groupbus", ".channelbus"].includes(command)) {
    const type = command.slice(1);
    const files = getFlowFiles(type);

    if (files.length === 0) {
      await replyWhatsApp(sock, jid, fileListText(type, files));
      return;
    }

    commandFlows.set(key, {
      type,
      step: "target",
      target: null,
      files
    });

    let instructions = "";

    if (type === "numberbus") {
      instructions =
        "\n\n📱 දැන් target phone number එක country code සමඟ යවන්න.\n" +
        "උදා: 94771234567";
    } else if (type === "groupbus") {
      instructions =
        "\n\n👥 දැන් target WhatsApp group JID එක යවන්න.\n" +
        "උදා: 120363000000000000@g.us\n" +
        "Bot account එකට එම group එකට message යැවීමට අවසර තිබිය යුතුයි.";
    } else {
      instructions =
        "\n\n📢 දැන් target WhatsApp Channel JID එක යවන්න.\n" +
        "උදා: 120363000000000000@newsletter\n" +
        "Channel එකට post කිරීම Baileys සහ account permissions මත රඳා පවතී.";
    }

    await replyWhatsApp(
      sock,
      jid,
      fileListText(type, files) + instructions +
      "\n\nනවත්වන්න නම් .cancel යවන්න."
    );
    return;
  }

  const flow = commandFlows.get(key);

  if (!flow) {
    return;
  }

  // Step 1: get the destination.
  if (flow.step === "target") {
    const targetInput = text.trim();

    if (flow.type === "numberbus") {
      const number = normalizePhoneNumber(targetInput);

      if (!number) {
        await replyWhatsApp(
          sock,
          jid,
          "❌ Phone number එක වැරදියි.\n" +
          "Country code සමඟ digits පමණක් යවන්න."
        );
        return;
      }

      flow.target = `${number}@s.whatsapp.net`;
    } else if (flow.type === "groupbus") {
      if (!/^\d+(-\d+)?@g\.us$/.test(targetInput)) {
        await replyWhatsApp(
          sock,
          jid,
          "❌ Group JID එක නිවැරදි නැහැ.\n" +
          "උදා: 120363000000000000@g.us"
        );
        return;
      }

      flow.target = targetInput;
    } else {
      if (!/^[^@\s]+@newsletter$/.test(targetInput)) {
        await replyWhatsApp(
          sock,
          jid,
          "❌ Channel JID එක නිවැරදි නැහැ.\n" +
          "Baileys වෙතින් ලබාගත් Channel JID එක යවන්න."
        );
        return;
      }

      flow.target = targetInput;
    }

    flow.step = "files";

    await replyWhatsApp(
      sock,
      jid,
      "✅ Target එක ලබාගත්තා.\n\n" +
      "යවන්න ඕන file numbers යවන්න.\n" +
      "උදා: 1,3,4\n\n" +
      "සියල්ල තෝරන්න: all\n" +
      "එක් job එකකට උපරිම files 5යි.\n" +
      "අවලංගු කරන්න: .cancel"
    );
    return;
  }

  // Step 2: select files.
  if (flow.step === "files") {
    let selectedIndexes = [];

    if (lower === "all") {
      if (flow.files.length > 5) {
        await replyWhatsApp(
          sock,
          jid,
          `Files ${flow.files.length}ක් තියෙනවා.\n` +
          "එක් වරකට උපරිම 5ක් පමණක් තෝරන්න.\n" +
          "උදා: 1,2,3,4,5"
        );
        return;
      }

      selectedIndexes = flow.files.map((_, index) => index);
    } else {
      const parts = text.split(",").map(part => part.trim());

      if (
        parts.length === 0 ||
        parts.some(part => !/^\d+$/.test(part))
      ) {
        await replyWhatsApp(
          sock,
          jid,
          "❌ File numbers නිවැරදිව යවන්න.\nඋදා: 1,2,4"
        );
        return;
      }

      selectedIndexes = [...new Set(parts.map(part => Number(part) - 1))];

      if (
        selectedIndexes.some(
          index => index < 0 || index >= flow.files.length
        )
      ) {
        await replyWhatsApp(
          sock,
          jid,
          `❌ File number එක වැරදියි. 1 සිට ${flow.files.length} දක්වා තෝරන්න.`
        );
        return;
      }

      if (selectedIndexes.length > 5) {
        await replyWhatsApp(
          sock,
          jid,
          "එක් වරකට උපරිම files 5ක් පමණක් තෝරන්න."
        );
        return;
      }
    }

    if (selectedIndexes.length === 0) {
      await replyWhatsApp(sock, jid, "❌ Files තෝරා නැහැ.");
      return;
    }

    flow.selectedFiles = selectedIndexes.map(index => flow.files[index]);
    flow.step = "confirm";

    await replyWhatsApp(
      sock,
      jid,
      "🔎 යැවීමට පෙර තහවුරු කරන්න\n\n" +
      "Type: " + flow.type + "\n" +
      "Target: " + flow.target + "\n\n" +
      "Files:\n" +
      flow.selectedFiles.map(file => `• ${file.name}`).join("\n") +
      "\n\nයවන්න නම් CONFIRM යවන්න.\n" +
      "නවත්වන්න නම් .cancel යවන්න."
    );
    return;
  }

  // Step 3: require explicit confirmation.
  if (flow.step === "confirm") {
    if (lower !== "confirm") {
      await replyWhatsApp(
        sock,
        jid,
        "⚠️ යැවීමට CONFIRM යවන්න.\n" +
        "නවත්වන්න .cancel යවන්න."
      );
      return;
    }

    // Remove the flow before sending so the same confirmation
    // cannot accidentally start the same job again.
    commandFlows.delete(key);

    await replyWhatsApp(
      sock,
      jid,
      "⏳ Files යවන්න උත්සාහ කරනවා..."
    );

    const result = await runExclusiveJob(async () => {
      for (const file of flow.selectedFiles) {
        if (file.type === "text") {
          await sock.sendMessage(flow.target, {
            text: file.text,
            linkPreview: false
          });
        } else if (file.type === "video") {
          const extension = path.extname(file.path).toLowerCase();

          const mimetype = extension === ".mov"
            ? "video/quicktime"
            : extension === ".webm"
              ? "video/webm"
              : "video/mp4";

          await sock.sendMessage(flow.target, {
            video: fs.readFileSync(file.path),
            mimetype,
            caption: file.name
          });
        }

        // Small delay between files.
        await sleep(1200);
      }
    });

    await replyWhatsApp(
      sock,
      jid,
      result.ok
        ? "✅ Job එක අවසන්.\n" +
          `Files ${flow.selectedFiles.length}ක් යැවීමේ request එක සම්පූර්ණයි.`
        : "❌ Files යැවීම අසාර්ථකයි.\n" + result.message
    );
  }
}

// ---------- Telegram /start ----------

bot.onText(/^\/start(?:@\w+)?$/, async msg => {
  if (!isPrivateChat(msg)) return;

  await safeSend(
    msg.chat.id,
    "🐝 WNT SUPER BUGIY BOT BY BEE\n\n" +
    "WhatsApp connect කිරීමට:\n\n" +
    "1. /pair යවන්න.\n" +
    "2. Country code සමඟ phone number එක යවන්න.\n" +
    "3. Pairing code එක WhatsApp app එකට ඇතුළත් කරන්න.\n\n" +
    "Commands:\n" +
    "/pair - WhatsApp connect කරන්න\n" +
    "/status - Connection status බලන්න"
  );
});

// ---------- Telegram /pair ----------

bot.onText(
  /^\/pair(?:@\w+)?(?:\s+(.+))?$/,
  async (msg, match) => {
    if (!isPrivateChat(msg)) return;

    const userId = String(msg.from.id);
    const suppliedNumber = (match[1] || "").trim();

    if (!suppliedNumber) {
      awaitingNumber.add(userId);

      await safeSend(
        msg.chat.id,
        "📱 WhatsApp phone number එක country code සමඟ යවන්න.\n\n" +
        "උදා: 94771234567"
      );
      return;
    }

    awaitingNumber.delete(userId);

    const phoneNumber = normalizePhoneNumber(suppliedNumber);

    if (!phoneNumber) {
      await safeSend(
        msg.chat.id,
        "❌ Number එක නිවැරදි නැහැ.\nCountry code සමඟ digits පමණක් යවන්න."
      );
      return;
    }

    await beginPairing(userId, phoneNumber);
  }
);

async function beginPairing(userId, phoneNumber) {
  const session = getSession(userId);

  if (session.starting || session.sock) {
    await safeSend(
      userId,
      "⏳ WhatsApp connection එක දැනටමත් ක්‍රියාත්මකයි.\n" +
      "/status පරීක්ෂා කරන්න."
    );
    return;
  }

  try {
    const sessionDir = getSessionDir(userId);
    fs.mkdirSync(sessionDir, { recursive: true });

    const { state } = await useMultiFileAuthState(sessionDir);

    if (state.creds.registered) {
      await safeSend(
        userId,
        "ℹ️ Saved WhatsApp session එක reconnect කරනවා."
      );

      await startWhatsApp(userId, null);
      return;
    }

    await safeSend(
      userId,
      "🔄 WhatsApp connection එක සකස් කරනවා.\n" +
      "Pairing code එක ලැබෙන තුරු ටිකක් ඉන්න."
    );

    await startWhatsApp(userId, phoneNumber);
  } catch (error) {
    console.error("Pairing setup error:", error.message);

    await safeSend(
      userId,
      "❌ Pairing ආරම්භ කරන්න බැරි වුණා.\nටිකකින් නැවත උත්සාහ කරන්න."
    );
  }
}

// ---------- Receive number after /pair ----------

bot.on("message", async msg => {
  if (!isPrivateChat(msg) || !msg.from) return;

  const userId = String(msg.from.id);
  const text = String(msg.text || "").trim();

  if (!awaitingNumber.has(userId)) return;
  if (!text || text.startsWith("/")) return;

  awaitingNumber.delete(userId);

  const phoneNumber = normalizePhoneNumber(text);

  if (!phoneNumber) {
    await safeSend(
      msg.chat.id,
      "❌ Number එක වැරදියි.\nනැවත /pair යවලා නිවැරදි number එක දෙන්න."
    );
    return;
  }

  await beginPairing(userId, phoneNumber);
});

// ---------- Telegram /status ----------

bot.onText(/^\/status(?:@\w+)?$/, async msg => {
  if (!isPrivateChat(msg)) return;

  const userId = String(msg.from.id);
  const session = getSession(userId);

  let status = "Not connected ⚠️";

  if (session.sock?.user) {
    status = "Connected ✅";
  } else if (session.starting || session.sock) {
    status = "Connecting ⏳";
  }

  await safeSend(
    msg.chat.id,
    "🐝 WNT SUPER BUGIY BOT BY BEE\n\n" +
    "WhatsApp: " + status
  );
});

// ---------- Errors ----------

bot.on("polling_error", error => {
  console.error("Telegram polling error:", error.message);
});

bot.on("error", error => {
  console.error("Telegram error:", error.message);
});

process.on("unhandledRejection", error => {
  console.error("Unhandled rejection:", error);
});

process.on("uncaughtException", error => {
  console.error("Uncaught exception:", error);
});

// ---------- Restore saved sessions ----------

console.log("🐝 WNT SUPER BUGIY BOT BY BEE");
console.log("📁 Folders ready:", folders);
console.log("📊 File counts:", getFolderCounts());
console.log("🤖 Telegram bot is running.");

async function restoreSavedSessions() {
  try {
    const entries = fs.readdirSync(SESSIONS_DIR, {
      withFileTypes: true
    });

    for (const entry of entries) {
      if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) {
        continue;
      }

      const userId = entry.name;
      const sessionDir = path.join(SESSIONS_DIR, userId);

      try {
        const { state } = await useMultiFileAuthState(sessionDir);

        if (state.creds.registered) {
          console.log(`[${userId}] Restoring WhatsApp session...`);

          startWhatsApp(userId, null).catch(error => {
            console.error("Restore error:", error.message);
          });
        }
      } catch (error) {
        console.error(
          `[${userId}] Session restore failed:`,
          error.message
        );
      }
    }
  } catch (error) {
    console.error("Session restore error:", error.message);
  }
}

restoreSavedSessions();

// ---------- Existing exports ----------

module.exports = {
  folders,
  getFiles,
  getTextMessages,
  getVideos,
  getFolderCounts,
  runExclusiveJob
};
