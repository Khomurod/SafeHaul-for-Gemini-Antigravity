const { describe, it, expect, beforeEach, afterEach, jest: jestMock } = require('@jest/globals');
const crypto = require('crypto');

// Mock dependencies BEFORE requiring the module
jestMock.mock('firebase-admin', () => {
    const firestoreFn = jestMock.fn(() => ({
        collection: jestMock.fn(() => ({
            doc: jestMock.fn(() => ({
                get: jestMock.fn().mockResolvedValue({
                    exists: true,
                    data: () => ({ companyId: 'comp1', accessToken: 'token' })
                }),
                set: jestMock.fn(),
                collection: jestMock.fn(() => ({
                    add: jestMock.fn()
                }))
            })),
        })),
    }));

    firestoreFn.FieldValue = {
        serverTimestamp: jestMock.fn(),
        increment: jestMock.fn()
    };
    firestoreFn.Timestamp = {
        fromDate: jestMock.fn((d) => d)
    };

    return {
        firestore: firestoreFn,
        initializeApp: jestMock.fn()
    };
});

jestMock.mock('axios', () => ({
    get: jestMock.fn().mockResolvedValue({
        data: {
            created_time: new Date().toISOString(),
            field_data: []
        }
    }),
    post: jestMock.fn()
}));

// Mock params
const mockSecretValue = 'test-secret';
jestMock.mock('firebase-functions/params', () => ({
    defineSecret: (name) => ({
        value: () => mockSecretValue
    })
}));

// Mock v2 https
jestMock.mock('firebase-functions/v2/https', () => ({
    onCall: (opts, handler) => handler,
    onRequest: (opts, handler) => handler,
    HttpsError: class extends Error {}
}));

// Mock v1 functions
jestMock.mock('firebase-functions', () => ({
    https: {
        onRequest: (handler) => handler
    }
}));

// Set env vars for V1
process.env.FACEBOOK_APP_SECRET_VALUE = mockSecretValue;
process.env.FACEBOOK_VERIFY_TOKEN_VALUE = 'test-token';

const facebookIntegration = require('../../integrations/facebook');

describe('Facebook Webhook Security Verification', () => {

    it('should REJECT request without signature in v2', async () => {
        const req = {
            method: 'POST',
            headers: {}, // Missing signature
            body: { object: 'page', entry: [] },
            rawBody: Buffer.from(JSON.stringify({ object: 'page', entry: [] }))
        };

        const res = {
            status: jestMock.fn().mockReturnThis(),
            send: jestMock.fn(),
            sendStatus: jestMock.fn()
        };

        await facebookIntegration.facebookWebhook(req, res);

        expect(res.sendStatus).toHaveBeenCalledWith(401);
        expect(res.send).not.toHaveBeenCalledWith('EVENT_RECEIVED');
    });

    it('should REJECT request without signature in v1', async () => {
        const req = {
            method: 'POST',
            headers: {}, // Missing signature
            body: { object: 'page', entry: [] },
            rawBody: Buffer.from(JSON.stringify({ object: 'page', entry: [] }))
        };

        const res = {
            status: jestMock.fn().mockReturnThis(),
            send: jestMock.fn(),
            sendStatus: jestMock.fn()
        };

        await facebookIntegration.facebookWebhookV1(req, res);

        expect(res.sendStatus).toHaveBeenCalledWith(403);
        expect(res.send).not.toHaveBeenCalledWith('EVENT_RECEIVED');
    });

    it('should ACCEPT request with VALID signature in v2', async () => {
        const bodyObj = {
            object: 'page',
            entry: [{
                changes: [{
                    field: 'leadgen',
                    value: { leadgen_id: '123', page_id: '456' }
                }]
            }]
        };
        const rawBody = Buffer.from(JSON.stringify(bodyObj));
        const signature = 'sha1=' + crypto.createHmac('sha1', mockSecretValue).update(rawBody).digest('hex');

        const req = {
            method: 'POST',
            headers: { 'x-hub-signature': signature },
            body: bodyObj,
            rawBody: rawBody
        };

        const res = {
            status: jestMock.fn().mockReturnThis(),
            send: jestMock.fn(),
            sendStatus: jestMock.fn()
        };

        await facebookIntegration.facebookWebhook(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.send).toHaveBeenCalledWith('EVENT_RECEIVED');
    });
});
