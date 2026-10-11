require("dotenv").config();

const fs = require("fs");
const path = require("path");

const folders = {
  numberbus: path.join(__dirname, "numberbus"),
  groupbus: path.join(__dirname, "groupbus"),
  channelbus: path.join(__dirname, "channelbus")
};

for (const folder of Object.values(folders)) {
  fs.mkdirSync(folder, { recursive: true });
}

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
      message: "දැනට job එකක් ක්‍රියාත්මකයි. පසුව නැවත උත්සාහ කරන්න."
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

console.log("🐝 WNT SUPER BUGIY BOT BY BEE");
console.log("📁 Folders ready:", folders);
console.log("📊 File counts:", getFolderCounts());

module.exports = {
  folders,
  getFiles,
  getTextMessages,
  getVideos,
  getFolderCounts,
  runExclusiveJob
};
