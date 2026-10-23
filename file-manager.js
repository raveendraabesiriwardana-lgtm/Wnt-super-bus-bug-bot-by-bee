const fs = require('fs');
const path = require('path');
const config = require('./config');

function ensureFolder(folderPath) {
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
    }
}

function getFilesList(folderPath) {
    ensureFolder(folderPath);
    return fs.readdirSync(folderPath).filter(file => file.endsWith('.txt'));
}

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
