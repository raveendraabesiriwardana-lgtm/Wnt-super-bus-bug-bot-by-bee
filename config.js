module.exports = {
    BOT_NAME: 'WNT BUS BOT',
    PREFIX: '.',
    // Token එක එන්නේ OminiHost Variables එකෙන්. GitHub එකේ දාන්න එපා!
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
    NUMBERBUS_PATH: './numberbus',
    GROUPBUS_PATH: './groupbus',
    SESSION_PATH: './sessions'
};
