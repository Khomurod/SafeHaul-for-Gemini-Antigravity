const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { db } = require('../firebaseAdmin');
const { checkRateLimit } = require('../shared/rateLimiter');
const { assertRequiredUploads, buildApplicationDoc } = require('../shared/buildApplicationDoc');
const { upsertApplicationDoc } = require('../shared/upsertApplicationDoc');
const { getBotToken, sendMessage } = require('./botApi');
const sessionService = require('./sessionService');
const { validateInitData } = require('./validateInitData');

function consentAccepted(formData = {}) {
    return (
        formData['final-certification'] === 'agreed' &&
        formData['agree-electronic'] === 'agreed' &&
        formData['agree-background-check'] === 'agreed' &&
        formData['agree-psp'] === 'agreed'
    );
}

function validateSessionToken(sessionToken) {
    if (!sessionToken || typeof sessionToken !== 'string' || sessionToken.length < 16) {
        throw new HttpsError('invalid-argument', 'Missing or invalid session token.');
    }
}

function validateSignature(signature) {
    return typeof signature === 'string' &&
        signature.startsWith('data:image/') &&
        signature.length >= 100;
}

function assertInitDataIfNeeded(session, initData) {
    const token = getBotToken();
    const result = validateInitData(initData, token, {
        telegramUserId: session.telegramUserId,
    });
    if (!result.valid) {
        throw new HttpsError('permission-denied', `Invalid Telegram session (${result.reason}).`);
    }
}

async function loadUsableSession(sessionToken) {
    validateSessionToken(sessionToken);
    const session = await sessionService.getSession(sessionToken);
    if (!session) throw new HttpsError('not-found', 'Telegram session not found.');
    if (sessionService.isSessionExpired(session)) {
        await sessionService.updateSession(session.sessionId, { status: 'expired' });
        return { ...session, status: 'expired', expired: true };
    }
    return { ...session, expired: false };
}

exports.getTelegramSessionStatus = onCall({ cors: true }, async (request) => {
    const { sessionToken, initData } = request.data || {};
    const session = await loadUsableSession(sessionToken);
    assertInitDataIfNeeded(session, initData);
    return {
        status: session.status,
        companyName: session.companyName || '',
        appSlug: session.appSlug || '',
        consentAccepted: consentAccepted(session.formData),
        expired: Boolean(session.expired),
        error: session.expired ? 'expired' : undefined,
    };
});

exports.completeTelegramApplication = onCall({ cors: true }, async (request) => {
    const { sessionToken, signature, initData } = request.data || {};
    const clientIp = request.rawRequest?.ip || 'unknown';
    const allowed = await checkRateLimit(`telegram_complete_${sessionToken || clientIp}`, 5, 60, 'closed');
    if (!allowed) {
        throw new HttpsError('resource-exhausted', 'Too many attempts. Please wait.');
    }

    const session = await loadUsableSession(sessionToken);
    assertInitDataIfNeeded(session, initData);

    if (session.status !== 'awaiting_signature') {
        throw new HttpsError('failed-precondition', 'This Telegram application is not ready for signature.');
    }
    if (!consentAccepted(session.formData)) {
        throw new HttpsError('failed-precondition', 'Consent has not been accepted.');
    }
    if (!validateSignature(signature)) {
        throw new HttpsError('invalid-argument', 'Signature is missing or invalid.');
    }

    const formData = {
        ...(session.formData || {}),
        signature,
        signatureType: 'drawn',
        signatureDate: new Date().toISOString(),
        companyId: session.companyId,
        companyName: session.companyName,
        recruiterCode: session.recruiterCode || null,
        sourceType: 'Telegram Bot',
        sourceSlug: session.appSlug,
        lifecycle: {
            clientVersion: 'telegram-1.0',
            isGuest: true,
        },
    };

    assertRequiredUploads(session.applicationConfig || {}, formData);

    const email = formData.email || '';
    const phone = formData.phone || '';
    if (!email && !phone) {
        throw new HttpsError('invalid-argument', 'At least one of email or phone is required.');
    }

    const {
        applicantKeyFull,
        applicationId,
        confirmationNumber,
        applicationDoc,
        now,
    } = buildApplicationDoc({
        companyId: session.companyId,
        companyName: session.companyName || 'Unknown Company',
        email,
        phone,
        signature,
        formData,
        sourceMeta: {
            sourceType: 'Telegram Bot',
            sourceSlug: session.appSlug,
            recruiterCode: session.recruiterCode || null,
            clientVersion: 'telegram-1.0',
            isGuest: true,
        },
    });

    const result = await upsertApplicationDoc({
        db,
        companyId: session.companyId,
        applicationId,
        applicantKeyFull,
        applicationDoc,
        now,
        logLabel: 'completeTelegramApplication',
    });

    const finalConfirmation = result.confirmationNumber || confirmationNumber;
    await sessionService.completeSession(session.sessionId, {
        applicationId: result.applicationId,
        confirmationNumber: finalConfirmation,
    });
    await sendMessage(
        session.telegramChatId,
        `Application submitted. Confirmation number: ${finalConfirmation}`
    );

    return {
        success: true,
        applicationId: result.applicationId,
        confirmationNumber: finalConfirmation,
    };
});

module.exports.consentAccepted = consentAccepted;
module.exports.validateSignature = validateSignature;
