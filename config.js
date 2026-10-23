module.exports = {
    BOT_NAME: 'WNT BUS BOT',
    PREFIX: '.',
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
    NUMBERBUS_PATH: './numberbus',
    GROUPBUS_PATH: './groupbus',
    SESSION_PATH: './sessions'
};
