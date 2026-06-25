jest.mock('@ringcentral/sdk', () => {
  class SDK {
    constructor() {}
  }
  SDK.server = { sandbox: 'sandbox', production: 'production' };
  return { SDK };
});

const RingCentralAdapter = require('../../integrations/adapters/ringcentral');

describe('RingCentralAdapter explicit from fallback', () => {
  it('retries without explicit from when RingCentral says the line is not on the JWT extension', async () => {
    const adapter = new RingCentralAdapter({
      clientId: 'cid',
      clientSecret: 'secret',
      jwt: 'jwt',
      defaultPhoneNumber: '+15550000001',
      assignments: { user1: '+15550000001' },
    });
    adapter.ensureLoggedIn = jest.fn().mockResolvedValue(undefined);
    const rcError = new Error("Phone number doesn't belong to extension");
    rcError.response = { status: 400, data: { message: "Phone number doesn't belong to extension" } };
    adapter._sendWithRetry = jest.fn()
      .mockRejectedValueOnce(rcError)
      .mockResolvedValueOnce(undefined);

    await expect(adapter.sendSMS('+15558675309', 'hello', 'user1')).resolves.toBe(true);

    expect(adapter._sendWithRetry).toHaveBeenCalledTimes(2);
    expect(adapter._sendWithRetry.mock.calls[0][1]).toMatchObject({
      from: { phoneNumber: '+15550000001' },
      to: [{ phoneNumber: '+15558675309' }],
      text: 'hello',
    });
    expect(adapter._sendWithRetry.mock.calls[1][1]).toEqual({
      to: [{ phoneNumber: '+15558675309' }],
      text: 'hello',
    });
  });
});
