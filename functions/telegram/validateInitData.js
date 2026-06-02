const crypto = require('crypto');

function parseInitData(initData) {
    const params = new URLSearchParams(String(initData || ''));
    const out = {};
    for (const [key, value] of params.entries()) {
        out[key] = value;
    }
    if (out.user) {
        try {
            out.userObject = JSON.parse(out.user);
        } catch {
            out.userObject = null;
        }
    }
    return out;
}

function buildDataCheckString(parsed) {
    return Object.keys(parsed)
        .filter((key) => key !== 'hash' && key !== 'userObject')
        .sort()
        .map((key) => `${key}=${parsed[key]}`)
        .join('\n');
}

function validateInitData(initData, botToken, options = {}) {
    if (!botToken) {
        return { valid: true, skipped: true, user: null };
    }
    if (!initData || typeof initData !== 'string') {
        return { valid: false, reason: 'missing_init_data' };
    }

    const parsed = parseInitData(initData);
    if (!parsed.hash) {
        return { valid: false, reason: 'missing_hash' };
    }

    const dataCheckString = buildDataCheckString(parsed);
    const secretKey = crypto
        .createHmac('sha256', 'WebAppData')
        .update(botToken)
        .digest();
    const expectedHash = crypto
        .createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');

    const provided = Buffer.from(parsed.hash, 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
        return { valid: false, reason: 'invalid_hash' };
    }

    const maxAgeSeconds = options.maxAgeSeconds ?? 86400;
    const authDate = Number(parsed.auth_date || 0);
    if (!authDate || Date.now() / 1000 - authDate > maxAgeSeconds) {
        return { valid: false, reason: 'stale_auth_date' };
    }

    if (options.telegramUserId) {
        const initUserId = parsed.userObject?.id ? String(parsed.userObject.id) : '';
        if (initUserId !== String(options.telegramUserId)) {
            return { valid: false, reason: 'user_mismatch' };
        }
    }

    return { valid: true, user: parsed.userObject || null };
}

module.exports = { buildDataCheckString, parseInitData, validateInitData };
