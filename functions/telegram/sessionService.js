const crypto = require('crypto');
const { admin, db } = require('../firebaseAdmin');

const ACTIVE_STATUSES = new Set(['active', 'awaiting_signature']);
const SESSION_TTL_HOURS = 72;

function newSessionId() {
    return crypto.randomBytes(24).toString('hex');
}

function sessionRef(sessionId) {
    return db.collection('telegram_sessions').doc(sessionId);
}

function timestampFromNow(hours) {
    return admin.firestore.Timestamp.fromMillis(Date.now() + hours * 60 * 60 * 1000);
}

function isSessionExpired(session) {
    const expiresAt = session?.expiresAt;
    if (!expiresAt) return false;
    const expiresMillis = typeof expiresAt.toMillis === 'function'
        ? expiresAt.toMillis()
        : new Date(expiresAt).getTime();
    return Number.isFinite(expiresMillis) && expiresMillis < Date.now();
}

async function createSession({
    telegramChatId,
    telegramUserId,
    companyId,
    companyName,
    appSlug,
    recruiterCode = null,
    chatFields = [],
    applicationConfig = {},
    requiresEmployer = false,
}) {
    const sessionId = newSessionId();
    const now = admin.firestore.FieldValue.serverTimestamp();
    const session = {
        sessionId,
        telegramChatId: String(telegramChatId),
        telegramUserId: String(telegramUserId || telegramChatId),
        companyId,
        companyName,
        appSlug,
        recruiterCode,
        status: 'active',
        cursor: { phase: 'fields', fieldIndex: 0 },
        formData: {
            employers: [],
            violations: [],
            accidents: [],
            schools: [],
            military: [],
        },
        schemaSnapshot: {
            version: 'telegram-mvp-1.0',
            chatFields,
            requiresEmployer,
        },
        applicationConfig,
        createdAt: now,
        updatedAt: now,
        expiresAt: timestampFromNow(SESSION_TTL_HOURS),
        applicationId: null,
        confirmationNumber: null,
    };
    await sessionRef(sessionId).set(session);
    return session;
}

async function getSession(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') return null;
    const snap = await sessionRef(sessionId).get();
    if (!snap.exists) return null;
    return { id: snap.id, ...snap.data() };
}

async function updateSession(sessionId, patch) {
    const update = {
        ...patch,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await sessionRef(sessionId).set(update, { merge: true });
    return getSession(sessionId);
}

async function findActiveSessionByChatId(chatId) {
    const snap = await db
        .collection('telegram_sessions')
        .where('telegramChatId', '==', String(chatId))
        .limit(10)
        .get();
    let newest = null;
    for (const doc of snap.docs) {
        const data = { id: doc.id, ...doc.data() };
        if (!ACTIVE_STATUSES.has(data.status)) continue;
        if (isSessionExpired(data)) continue;
        const updated = data.updatedAt?.toMillis ? data.updatedAt.toMillis() : 0;
        const newestUpdated = newest?.updatedAt?.toMillis ? newest.updatedAt.toMillis() : 0;
        if (!newest || updated >= newestUpdated) newest = data;
    }
    return newest;
}

async function cancelSession(sessionId) {
    return updateSession(sessionId, { status: 'cancelled' });
}

async function completeSession(sessionId, { applicationId, confirmationNumber }) {
    return updateSession(sessionId, {
        status: 'completed',
        applicationId,
        confirmationNumber,
    });
}

module.exports = {
    cancelSession,
    completeSession,
    createSession,
    findActiveSessionByChatId,
    getSession,
    isSessionExpired,
    updateSession,
};
