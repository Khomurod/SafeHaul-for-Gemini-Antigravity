const axios = require('axios');

const TELEGRAM_API = 'https://api.telegram.org';

function getBotToken() {
    return String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
}

function hasBotToken() {
    return Boolean(getBotToken());
}

async function callTelegram(method, payload = {}) {
    const token = getBotToken();
    if (!token) {
        console.warn(`[telegram:${method}] TELEGRAM_BOT_TOKEN empty; no-op.`);
        return { ok: false, nooped: true };
    }

    const url = `${TELEGRAM_API}/bot${token}/${method}`;
    const { data } = await axios.post(url, payload, { timeout: 10000 });
    return data;
}

async function sendMessage(chatId, text, options = {}) {
    if (!chatId) return { ok: false, nooped: true };
    return callTelegram('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: options.parseMode,
        reply_markup: options.replyMarkup,
        disable_web_page_preview: options.disableWebPagePreview ?? true,
    });
}

async function answerCallbackQuery(callbackQueryId, text = '') {
    if (!callbackQueryId) return { ok: false, nooped: true };
    return callTelegram('answerCallbackQuery', {
        callback_query_id: callbackQueryId,
        text,
        show_alert: false,
    });
}

async function editMessageReplyMarkup(chatId, messageId, replyMarkup = null) {
    if (!chatId || !messageId) return { ok: false, nooped: true };
    return callTelegram('editMessageReplyMarkup', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: replyMarkup,
    });
}

async function getFile(fileId) {
    if (!fileId) throw new Error('Missing Telegram file id.');
    const result = await callTelegram('getFile', { file_id: fileId });
    if (result.nooped) throw new Error('Telegram bot token is not configured.');
    if (!result.ok || !result.result?.file_path) {
        throw new Error('Telegram file lookup failed.');
    }
    return result.result;
}

async function downloadFile(filePath) {
    const token = getBotToken();
    if (!token) throw new Error('Telegram bot token is not configured.');
    const url = `${TELEGRAM_API}/file/bot${token}/${filePath}`;
    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 20000,
    });
    return Buffer.from(response.data);
}

module.exports = {
    answerCallbackQuery,
    callTelegram,
    downloadFile,
    editMessageReplyMarkup,
    getFile,
    getBotToken,
    hasBotToken,
    sendMessage,
};
