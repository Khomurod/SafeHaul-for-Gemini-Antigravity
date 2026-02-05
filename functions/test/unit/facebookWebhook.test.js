const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');
const jestMock = require('@jest/globals').jest;
const firebaseFunctionsTest = require('firebase-functions-test');
const crypto = require('crypto');
const test = firebaseFunctionsTest();

// Mock Firebase Functions V2
jestMock.mock('firebase-functions/v2/https', () => ({
    onRequest: jestMock.fn((opts, handler) => handler),
    onCall: jestMock.fn((opts, handler) => handler),
    HttpsError: class extends Error {
        constructor(code, message) {
            super(message);
            this.code = code;
        }
    }
}));

// Mock Secrets
const mockSecretValue = 'test-app-secret';
jestMock.mock('firebase-functions/params', () => {
    return {
        defineSecret: jestMock.fn(() => ({
            value: jestMock.fn(() => mockSecretValue)
        }))
    };
});

// Mock Firestore
const mockFirestore = {
    collection: jestMock.fn(),
};
jestMock.mock('firebase-admin', () => ({
    firestore: () => mockFirestore,
    initializeApp: jestMock.fn(),
    firestore: Object.assign(() => mockFirestore, {
        Timestamp: { fromDate: (d) => d },
        FieldValue: { serverTimestamp: () => 'TIMESTAMP' }
    })
}));

// Mock Axios
jestMock.mock('axios');

// Import the module under test
const facebookIntegrations = require('../../integrations/facebook');

describe('Facebook Webhook Security Tests', () => {
    afterEach(() => {
        jestMock.clearAllMocks();
    });

    it('should REJECT webhook request missing X-Hub-Signature', async () => {
        const req = {
            method: 'POST',
            headers: {}, // Missing signature
            body: {
                object: 'page',
                entry: [{ changes: [{ field: 'leadgen', value: {} }] }]
            },
            rawBody: Buffer.from(JSON.stringify({
                object: 'page',
                entry: [{ changes: [{ field: 'leadgen', value: {} }] }]
            }))
        };

        const res = {
            sendStatus: jestMock.fn(),
            status: jestMock.fn().mockReturnThis(),
            send: jestMock.fn()
        };

        await facebookIntegrations.facebookWebhook(req, res);

        // EXPECTATION: Should verify signature and fail
        expect(res.sendStatus).toHaveBeenCalledWith(403);
    });

    it('should REJECT webhook request with INVALID X-Hub-Signature', async () => {
        const payload = JSON.stringify({ object: 'page', entry: [] });
        const req = {
            method: 'POST',
            headers: { 'x-hub-signature': 'sha1=invalidhash' },
            body: JSON.parse(payload),
            rawBody: Buffer.from(payload)
        };

        const res = {
            sendStatus: jestMock.fn(),
            status: jestMock.fn().mockReturnThis(),
            send: jestMock.fn()
        };

        await facebookIntegrations.facebookWebhook(req, res);

        expect(res.sendStatus).toHaveBeenCalledWith(403);
    });

    it('should ACCEPT webhook request with VALID X-Hub-Signature', async () => {
        const payload = JSON.stringify({
            object: 'page',
            entry: [{ changes: [{ field: 'leadgen', value: { leadgen_id: '123', page_id: '456' } }] }]
        });

        const expectedHash = crypto.createHmac('sha1', mockSecretValue).update(payload).digest('hex');

        const req = {
            method: 'POST',
            headers: { 'x-hub-signature': `sha1=${expectedHash}` },
            body: JSON.parse(payload),
            rawBody: Buffer.from(payload)
        };

        const res = {
            sendStatus: jestMock.fn(),
            status: jestMock.fn().mockReturnThis(),
            send: jestMock.fn()
        };

        // Mock DB to avoid error during processing
        mockFirestore.collection.mockReturnValue({
            doc: jestMock.fn().mockReturnValue({
                get: jestMock.fn().mockResolvedValue({ exists: false }) // Simulate unknown page to stop early cleanly
            })
        });

        await facebookIntegrations.facebookWebhook(req, res);

        // Should NOT be forbidden
        expect(res.sendStatus).not.toHaveBeenCalledWith(403);
        // Since we mocked page not found, it logs error and returns?
        // In processLead: if (!integrationDoc.exists) ... return;
        // Then facebookWebhook returns res.status(200).send('EVENT_RECEIVED');
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.send).toHaveBeenCalledWith('EVENT_RECEIVED');
    });
});
