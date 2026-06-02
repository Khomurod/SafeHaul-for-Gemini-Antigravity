const path = require('path');
const { db, storage } = require('../firebaseAdmin');
const { assertCompanyAcceptingIntake } = require('../shared/companyTenant');
const { checkRateLimit } = require('../shared/rateLimiter');
const { getFile, downloadFile, sendMessage, answerCallbackQuery } = require('./botApi');
const sessionService = require('./sessionService');
const { loadSchemaForCompany } = require('./schemaAdapter');
const { employerRowHasVerifierContact } = require('./employment');

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_OK = /^\d{4}-\d{2}-\d{2}$/;

function parseStartPayload(text = '') {
    const parts = String(text).trim().split(/\s+/);
    if (parts[0] !== '/start') return null;
    const payload = parts[1] || '';
    if (!payload.startsWith('apply_')) return { slug: null, recruiterCode: null };
    const body = payload.slice('apply_'.length);
    const marker = '_r_';
    const markerIndex = body.lastIndexOf(marker);
    if (markerIndex > 0) {
        return {
            slug: body.slice(0, markerIndex),
            recruiterCode: body.slice(markerIndex + marker.length) || null,
        };
    }
    return { slug: body || null, recruiterCode: null };
}

async function resolveCompanyBySlug(slug) {
    if (!slug) return null;
    const byAppSlug = await db.collection('public_profiles')
        .where('appSlug', '==', slug)
        .limit(1)
        .get();
    let publicDoc = null;
    if (!byAppSlug.empty) {
        publicDoc = byAppSlug.docs[0];
    } else {
        const fallback = await db.collection('public_profiles').doc(slug).get();
        if (fallback.exists) publicDoc = fallback;
    }
    if (!publicDoc) return null;

    const companyId = publicDoc.id;
    const publicData = publicDoc.data() || {};
    const companyData = await assertCompanyAcceptingIntake(db, companyId);
    const companySnap = await db.collection('companies').doc(companyId).get();
    const privateData = companySnap.exists ? companySnap.data() || {} : {};
    if (privateData.features?.telegramApply !== true) {
        return { disabled: true, companyId, publicData, companyData: privateData || companyData };
    }
    return {
        companyId,
        publicData,
        companyData: { ...companyData, ...privateData },
        companyName: publicData.companyName || privateData.companyName || companyData.companyName || 'Unknown Company',
        applicationConfig: publicData.applicationConfig ?? privateData.applicationConfig ?? companyData.applicationConfig ?? {},
    };
}

function fieldPrompt(field) {
    if (field.type === 'file') {
        return `Please upload ${field.label}. You can send a photo or document.`;
    }
    return `${field.label}${field.required ? ' *' : ''}`;
}

function inlineKeyboardForOptions(options = []) {
    return {
        inline_keyboard: options.map((option) => ([{
            text: option.label || option.value,
            callback_data: `answer:${option.value}`,
        }])),
    };
}

function consentKeyboard() {
    return {
        inline_keyboard: [[
            { text: 'Accept', callback_data: 'consent:accept' },
            { text: 'Decline', callback_data: 'consent:decline' },
        ]],
    };
}

function addDoneKeyboard() {
    return {
        inline_keyboard: [[
            { text: 'Add another employer', callback_data: 'employer:add' },
            { text: 'Done', callback_data: 'employer:done' },
        ]],
    };
}

function webAppKeyboard(sessionId) {
    const base = process.env.TELEGRAM_MINI_APP_URL || 'https://truckerapp-system.web.app/telegram/sign';
    const separator = base.includes('?') ? '&' : '?';
    return {
        inline_keyboard: [[
            {
                text: 'Sign application',
                web_app: { url: `${base}${separator}token=${encodeURIComponent(sessionId)}` },
            },
        ]],
    };
}

function normalizeDate(value) {
    const text = String(value || '').trim();
    if (DATE_OK.test(text)) return text;
    const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (!match) return '';
    let year = Number(match[3]);
    if (year < 100) year += 2000;
    const month = Number(match[1]);
    const day = Number(match[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return '';
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function validateFieldValue(field, value) {
    const text = String(value || '').trim();
    if (field.required && !text) return { ok: false, message: 'This field is required.' };
    if (!text) return { ok: true, value: '' };
    if (field.type === 'email' && !EMAIL_OK.test(text)) {
        return { ok: false, message: 'Please enter a valid email address.' };
    }
    if (field.type === 'tel' && text.replace(/\D/g, '').length < 10) {
        return { ok: false, message: 'Please enter a valid 10-digit phone number.' };
    }
    if (field.type === 'date') {
        const normalized = normalizeDate(text);
        if (!normalized) return { ok: false, message: 'Please enter a date as YYYY-MM-DD or MM/DD/YYYY.' };
        return { ok: true, value: normalized };
    }
    if (field.options?.length) {
        const allowed = new Set(field.options.map((option) => String(option.value)));
        if (!allowed.has(text)) {
            return { ok: false, message: `Please choose one of: ${[...allowed].join(', ')}.` };
        }
    }
    return { ok: true, value: text };
}

async function askCurrentQuestion(session) {
    const cursor = session.cursor || { phase: 'fields', fieldIndex: 0 };
    if (cursor.phase === 'employer') return askEmployerQuestion(session);
    if (cursor.phase === 'consent') return askConsent(session);
    if (cursor.phase === 'signature') return askSignature(session);

    const fields = session.schemaSnapshot?.chatFields || [];
    const field = fields[cursor.fieldIndex || 0];
    if (!field) return enterEmployerOrConsent(session);

    const replyMarkup = field.options?.length ? inlineKeyboardForOptions(field.options) : undefined;
    return sendMessage(session.telegramChatId, fieldPrompt(field), { replyMarkup });
}

function employerFields() {
    return [
        { key: 'companyName', label: 'Employer company name', required: true },
        { key: 'phone', label: 'Employer phone (or leave blank if you have an email)', type: 'tel' },
        { key: 'companyEmail', label: 'Employer email (or leave blank)', type: 'email' },
        { key: 'supervisorPhone', label: 'Supervisor phone (or leave blank)', type: 'tel' },
        { key: 'supervisorEmail', label: 'Supervisor email (or leave blank)', type: 'email' },
        { key: 'startDate', label: 'Start date (YYYY-MM-DD)', type: 'date', required: true },
        { key: 'endDate', label: 'End date (YYYY-MM-DD)', type: 'date', required: true },
    ];
}

async function askEmployerQuestion(session) {
    const cursor = session.cursor || {};
    const field = employerFields()[cursor.employerFieldIndex || 0];
    if (!field) return finishEmployerRow(session);
    return sendMessage(session.telegramChatId, `${field.label}${field.required ? ' *' : ''}`);
}

async function enterEmployerOrConsent(session) {
    if (session.schemaSnapshot?.requiresEmployer && !(session.formData?.employers || []).length) {
        const updated = await sessionService.updateSession(session.sessionId, {
            cursor: { phase: 'employer', employerFieldIndex: 0, currentEmployer: {} },
        });
        await sendMessage(session.telegramChatId, 'Now I need at least one recent employer so the carrier can verify employment.');
        return askEmployerQuestion(updated);
    }
    const updated = await sessionService.updateSession(session.sessionId, {
        cursor: { phase: 'consent' },
    });
    return askConsent(updated);
}

async function askConsent(session) {
    const text = [
        'Please review and accept these application agreements:',
        '',
        '- You certify the information you provided is true and complete.',
        '- You agree to use electronic records and signatures.',
        '- You authorize background check processing.',
        '- You authorize FMCSA PSP review where applicable.',
    ].join('\n');
    return sendMessage(session.telegramChatId, text, { replyMarkup: consentKeyboard() });
}

async function askSignature(session) {
    return sendMessage(
        session.telegramChatId,
        'Almost done. Open the secure signature screen and draw your signature.',
        { replyMarkup: webAppKeyboard(session.sessionId) }
    );
}

async function finishEmployerRow(session) {
    const cursor = session.cursor || {};
    const currentEmployer = cursor.currentEmployer || {};
    if (!employerRowHasVerifierContact(currentEmployer)) {
        await sendMessage(
            session.telegramChatId,
            'Please provide at least one verifier contact: employer phone/email or supervisor phone/email.'
        );
        const updated = await sessionService.updateSession(session.sessionId, {
            cursor: { ...cursor, employerFieldIndex: 1 },
        });
        return askEmployerQuestion(updated);
    }
    const employers = [...(session.formData?.employers || []), currentEmployer];
    await sessionService.updateSession(session.sessionId, {
        formData: { ...session.formData, employers },
        cursor: { phase: 'employer_choice' },
    });
    return sendMessage(session.telegramChatId, 'Employer saved. Add another employer, or finish this section.', {
        replyMarkup: addDoneKeyboard(),
    });
}

function getTelegramFile(message) {
    if (message.document?.file_id) {
        return {
            fileId: message.document.file_id,
            fileName: message.document.file_name || 'telegram-upload',
            mimeType: message.document.mime_type || 'application/octet-stream',
        };
    }
    if (Array.isArray(message.photo) && message.photo.length > 0) {
        const photo = message.photo[message.photo.length - 1];
        return {
            fileId: photo.file_id,
            fileName: `${photo.file_unique_id || photo.file_id}.jpg`,
            mimeType: 'image/jpeg',
        };
    }
    return null;
}

async function handleFileAnswer(session, field, message) {
    const fileInfo = getTelegramFile(message);
    if (!fileInfo) {
        await sendMessage(session.telegramChatId, 'Please send a photo or document for this upload.');
        return;
    }

    await sendMessage(session.telegramChatId, 'Uploading your file...');
    const telegramFile = await getFile(fileInfo.fileId);
    const bytes = await downloadFile(telegramFile.file_path);
    const safeName = path.basename(fileInfo.fileName).replace(/[^a-zA-Z0-9._-]/g, '_') || 'telegram-upload';
    const storagePath = `companies/${session.companyId}/applications/guest_uploads/telegram_${session.sessionId}/${field.key}/${Date.now()}_${safeName}`;
    const bucketFile = storage.bucket().file(storagePath);
    await bucketFile.save(bytes, {
        metadata: { contentType: fileInfo.mimeType },
    });
    const [url] = await bucketFile.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + 15 * 60 * 1000,
    });
    const formData = {
        ...session.formData,
        [field.key]: { name: safeName, url, storagePath },
    };
    const updated = await sessionService.updateSession(session.sessionId, {
        formData,
        cursor: { phase: 'fields', fieldIndex: (session.cursor?.fieldIndex || 0) + 1 },
    });
    await sendMessage(session.telegramChatId, 'File received.');
    return askCurrentQuestion(updated);
}

async function handleTextAnswer(session, messageText, message) {
    const cursor = session.cursor || { phase: 'fields', fieldIndex: 0 };
    if (cursor.phase === 'employer') {
        const fields = employerFields();
        const field = fields[cursor.employerFieldIndex || 0];
        if (!field) return finishEmployerRow(session);
        const validation = validateFieldValue(field, messageText);
        if (!validation.ok) {
            await sendMessage(session.telegramChatId, validation.message);
            return askEmployerQuestion(session);
        }
        const currentEmployer = {
            ...(cursor.currentEmployer || {}),
            [field.key]: validation.value,
        };
        const updated = await sessionService.updateSession(session.sessionId, {
            cursor: {
                ...cursor,
                currentEmployer,
                employerFieldIndex: (cursor.employerFieldIndex || 0) + 1,
            },
        });
        return askEmployerQuestion(updated);
    }

    if (cursor.phase !== 'fields') {
        return sendMessage(session.telegramChatId, 'Please use the buttons above, or send /cancel to stop.');
    }

    const fields = session.schemaSnapshot?.chatFields || [];
    const field = fields[cursor.fieldIndex || 0];
    if (!field) return enterEmployerOrConsent(session);
    if (field.type === 'file') return handleFileAnswer(session, field, message);

    const validation = validateFieldValue(field, messageText);
    if (!validation.ok) {
        await sendMessage(session.telegramChatId, validation.message);
        return askCurrentQuestion(session);
    }

    const formData = { ...session.formData, [field.key]: validation.value };
    const updated = await sessionService.updateSession(session.sessionId, {
        formData,
        cursor: { phase: 'fields', fieldIndex: (cursor.fieldIndex || 0) + 1 },
    });
    return askCurrentQuestion(updated);
}

async function handleCallback(update) {
    const callback = update.callback_query;
    const message = callback.message || {};
    const chatId = message.chat?.id;
    const data = String(callback.data || '');
    const session = await sessionService.findActiveSessionByChatId(chatId);
    await answerCallbackQuery(callback.id);
    if (!session) {
        return sendMessage(chatId, 'No active application session. Send /start apply_<company> to begin.');
    }

    if (data.startsWith('answer:')) {
        const value = data.slice('answer:'.length);
        const cursor = session.cursor || {};
        const field = (session.schemaSnapshot?.chatFields || [])[cursor.fieldIndex || 0];
        if (!field) return askCurrentQuestion(session);
        if ((field.key === 'has-violations' || field.key === 'has-accidents') && value === 'yes') {
            return sendMessage(
                session.telegramChatId,
                'Telegram MVP cannot collect detail rows for that answer yet. Please continue on the web application link or choose No to continue here. Send /cancel to stop.'
            );
        }
        if (field.options?.length && !field.options.some((option) => String(option.value) === value)) {
            return sendMessage(session.telegramChatId, 'Please choose one of the available options.');
        }
        const updated = await sessionService.updateSession(session.sessionId, {
            formData: { ...session.formData, [field.key]: value },
            cursor: { phase: 'fields', fieldIndex: (cursor.fieldIndex || 0) + 1 },
        });
        return askCurrentQuestion(updated);
    }

    if (data === 'employer:add') {
        const updated = await sessionService.updateSession(session.sessionId, {
            cursor: { phase: 'employer', employerFieldIndex: 0, currentEmployer: {} },
        });
        return askEmployerQuestion(updated);
    }
    if (data === 'employer:done') {
        if (!(session.formData?.employers || []).length) {
            return sendMessage(session.telegramChatId, 'Please add at least one employer before continuing.');
        }
        const updated = await sessionService.updateSession(session.sessionId, {
            cursor: { phase: 'consent' },
        });
        return askConsent(updated);
    }

    if (data === 'consent:decline') {
        await sessionService.cancelSession(session.sessionId);
        return sendMessage(session.telegramChatId, 'Application cancelled. You can restart later with the apply link.');
    }
    if (data === 'consent:accept') {
        const formData = {
            ...session.formData,
            'final-certification': 'agreed',
            'agree-electronic': 'agreed',
            'agree-background-check': 'agreed',
            'agree-psp': 'agreed',
        };
        const updated = await sessionService.updateSession(session.sessionId, {
            status: 'awaiting_signature',
            formData,
            cursor: { phase: 'signature' },
        });
        return askSignature(updated);
    }

    return sendMessage(session.telegramChatId, 'That button is no longer active.');
}

async function startSession(message) {
    const chatId = message.chat?.id;
    const userId = message.from?.id || chatId;
    const payload = parseStartPayload(message.text);
    if (!payload?.slug) {
        return sendMessage(chatId, 'Please use a SafeHaul apply link from a carrier to start.');
    }

    const allowed = await checkRateLimit(`telegram_start_${userId}`, 10, 60, 'closed');
    if (!allowed) {
        return sendMessage(chatId, 'Too many attempts. Please wait a moment and try again.');
    }

    const company = await resolveCompanyBySlug(payload.slug);
    if (!company) return sendMessage(chatId, 'Application link not found.');
    if (company.disabled) {
        return sendMessage(chatId, 'This carrier is not accepting Telegram applications yet. Please use their web application link.');
    }

    const { chatFields, requiresEmployer } = await loadSchemaForCompany(company.companyId, company.applicationConfig);
    const session = await sessionService.createSession({
        telegramChatId: chatId,
        telegramUserId: userId,
        companyId: company.companyId,
        companyName: company.companyName,
        appSlug: payload.slug,
        recruiterCode: payload.recruiterCode,
        chatFields,
        applicationConfig: company.applicationConfig,
        requiresEmployer,
    });
    await sendMessage(chatId, `Starting your driver application for ${company.companyName}. Send /cancel any time to stop.`);
    return askCurrentQuestion(session);
}

async function handleMessage(update) {
    const message = update.message;
    const chatId = message.chat?.id;
    const text = String(message.text || '').trim();
    if (text.startsWith('/start')) return startSession(message);

    const session = await sessionService.findActiveSessionByChatId(chatId);
    if (text === '/cancel') {
        if (session) await sessionService.cancelSession(session.sessionId);
        return sendMessage(chatId, 'Application cancelled.');
    }
    if (!session) {
        return sendMessage(chatId, 'No active application session. Use your SafeHaul Telegram apply link to begin.');
    }
    if (sessionService.isSessionExpired(session)) {
        await sessionService.updateSession(session.sessionId, { status: 'expired' });
        return sendMessage(chatId, 'This application session expired. Please start again from the apply link.');
    }
    return handleTextAnswer(session, text, message);
}

async function processUpdate(update) {
    if (update.callback_query) return handleCallback(update);
    if (update.message) return handleMessage(update);
    return null;
}

module.exports = {
    askCurrentQuestion,
    parseStartPayload,
    processUpdate,
    resolveCompanyBySlug,
    validateFieldValue,
};
