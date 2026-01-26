const functions = require("firebase-functions");
const { admin, db } = require("./firebaseAdmin");

/**
 * 1. Create a New Message Template
 */
exports.createTemplate = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');
    const { companyId, name, method, subject, message } = data;
    const userId = context.auth.uid;

    if (!companyId || !name || !message) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required fields.');
    }

    try {
        const ref = db.collection('companies').doc(companyId).collection('message_templates').doc();
        await ref.set({
            id: ref.id,
            name,
            method: method || 'sms',
            subject: subject || '',
            message,
            createdBy: userId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            usageCount: 0
        });

        return { success: true, templateId: ref.id };
    } catch (error) {
        console.error("createTemplate Error:", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * 2. Get All Templates for Company
 */
exports.getTemplates = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');
    const { companyId } = data;

    try {
        const snapshot = await db.collection('companies').doc(companyId)
            .collection('message_templates')
            .orderBy('createdAt', 'desc')
            .get();

        const templates = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return { success: true, templates };
    } catch (error) {
        console.error("getTemplates Error:", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * 3. Update a Template
 */
exports.updateTemplate = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');
    const { companyId, templateId, updates } = data;

    try {
        await db.collection('companies').doc(companyId)
            .collection('message_templates').doc(templateId)
            .update({
                ...updates,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        return { success: true };
    } catch (error) {
        console.error("updateTemplate Error:", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * 4. Delete a Template
 */
exports.deleteTemplate = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');
    const { companyId, templateId } = data;

    try {
        await db.collection('companies').doc(companyId)
            .collection('message_templates').doc(templateId).delete();
        return { success: true };
    } catch (error) {
        console.error("deleteTemplate Error:", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
