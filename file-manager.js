const fs = require('fs');
const path = require('path');
const config = require('./config');

// Folder එක නැත්නම් හදනවා
function ensureFolder(folderPath) {
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
    }
}

// Folder එකේ තියෙන .txt files ඔක්කොම අරගෙන list එකක් හදනවා
function getFilesList(folderPath) {
    ensureFolder(folderPath);
    return fs.readdirSync(folderPath).filter(file => file.endsWith('.txt'));
}

// File එකක content එක කියවනවා
function readFileContent(folderPath, fileName) {
    const filePath = path.join(folderPath, fileName);
    if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf-8');
    }
    return null;
}

module.exports = {
    ensureFolder,
    getFilesList,
    readFileContent
};
