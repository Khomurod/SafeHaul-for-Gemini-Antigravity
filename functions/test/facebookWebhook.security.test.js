const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');
const firebaseFunctionsTest = require('firebase-functions-test');
const crypto = require('crypto');

// Setup mocks BEFORE importing the function
const jestMock = require('@jest/globals').jest;

// Mock secrets mechanism
jestMock.mock('firebase-functions/params', () => ({
    defineSecret: (name) => ({
        value: () => 'test-secret'
    })
}));

// Mock firebase-admin
jestMock.mock('firebase-admin', () => {
    const firestoreMock = {
        collection: jestMock.fn(),
        doc: jestMock.fn(),
    };
    return {
        apps: [],
        initializeApp: jestMock.fn(),
        firestore: jestMock.fn(() => firestoreMock),
        auth: jestMock.fn(),
        // Mock FieldValue if needed, but the test doesn't reach DB write if we just check auth
    };
});

// Mock axios to avoid network calls if code proceeds
jestMock.mock('axios');

const test = firebaseFunctionsTest();

describe('Facebook Webhook Security', () => {
    let facebookIntegrations;
    let req;
    let res;

    beforeEach(() => {
        jestMock.clearAllMocks();
        req = {
            method: 'POST',
            headers: {},
            body: {
                object: 'page',
                entry: []
            },
            rawBody: Buffer.from(JSON.stringify({ object: 'page', entry: [] }))
        };
        res = {
            status: jestMock.fn().mockReturnThis(),
            sendStatus: jestMock.fn().mockReturnThis(),
            send: jestMock.fn()
        };

        // Load the module
        facebookIntegrations = require('../integrations/facebook');
    });

    afterEach(() => {
        test.cleanup();
    });

    it('should REJECT POST request without X-Hub-Signature when secret is defined', async () => {
        // Expected behavior: It returns 403 Forbidden

        await facebookIntegrations.facebookWebhook(req, res);

        expect(res.sendStatus).toHaveBeenCalledWith(403);
    });

    it('should ACCEPT POST request with VALID X-Hub-Signature', async () => {
        const body = JSON.stringify({ object: 'page', entry: [] });
        req.rawBody = Buffer.from(body);
        const signature = 'sha1=' + crypto.createHmac('sha1', 'test-secret').update(req.rawBody).digest('hex');
        req.headers['x-hub-signature'] = signature;

        await facebookIntegrations.facebookWebhook(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.send).toHaveBeenCalledWith('EVENT_RECEIVED');
    });

    it('should REJECT POST request with INVALID X-Hub-Signature', async () => {
        req.headers['x-hub-signature'] = 'sha1=invalidsignature';

        await facebookIntegrations.facebookWebhook(req, res);

        expect(res.sendStatus).toHaveBeenCalledWith(403);
    });
});
