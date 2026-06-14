const crypto = require('crypto');
const { onRequest } = require('firebase-functions/v2/https');
const { hasBotToken } = require('./botApi');
const { processUpdate } = require('./conversationEngine');

// A1 FIX: Fail-fast startup guard so a misconfigured deploy is visible in logs.
// (Emulator runs are exempt — no secret is expected locally.)
if (process.env.FUNCTIONS_EMULATOR !== 'true' && !process.env.TELEGRAM_WEBHOOK_SECRET) {
    console.error('[telegramWebhook] TELEGRAM_WEBHOOK_SECRET missing at startup.');
}

// A1 FIX: Constant-time comparison to avoid leaking the secret via response timing,
// mirroring the safeCompare pattern in publicSigning.js.
function timingSafeEqual(a, b) {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

function secretMatches(req) {
    const expected = String(process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
    // A1 FIX: Fail CLOSED. A missing/empty secret must never authenticate traffic —
    // treating "not configured" as "allow" is the classic fail-open auth anti-pattern.
    if (!expected) {
        console.error('[telegramWebhook] CRITICAL: TELEGRAM_WEBHOOK_SECRET unset — rejecting request.');
        return false;
    }
    const header = String(req.get('x-telegram-bot-api-secret-token') || '').trim();
    const query = String(req.query.secret || '').trim();
    return (header && timingSafeEqual(header, expected)) ||
           (query && timingSafeEqual(query, expected));
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
