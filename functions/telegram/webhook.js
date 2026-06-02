const { onRequest } = require('firebase-functions/v2/https');
const { hasBotToken } = require('./botApi');
const { processUpdate } = require('./conversationEngine');

function secretMatches(req) {
    const expected = String(process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
    if (!expected) return true;
    const header = String(req.get('x-telegram-bot-api-secret-token') || '').trim();
    const query = String(req.query.secret || '').trim();
    return header === expected || query === expected;
}

exports.telegramWebhook = onRequest({ invoker: 'public', cors: true }, async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }
    if (!secretMatches(req)) {
        return res.status(403).send('Forbidden');
    }
    if (!hasBotToken()) {
        console.warn('[telegramWebhook] TELEGRAM_BOT_TOKEN empty; acknowledged without processing.');
        return res.status(200).send('TOKEN_NOT_CONFIGURED');
    }

    try {
        await processUpdate(req.body || {});
        return res.status(200).send('OK');
    } catch (err) {
        console.error('[telegramWebhook] Update processing failed:', err);
        return res.status(200).send('ERROR_ACKNOWLEDGED');
    }
});
