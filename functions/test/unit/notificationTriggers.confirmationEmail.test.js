// DL-4 regression: the applicant confirmation email must call
// sendDynamicEmail with POSITIONAL args (companyId, to, subject, html).
// A previous bug passed a single {to, subject, html} object as the `to`
// parameter, which left subject/html undefined and broke every
// "Application Received" email.

jest.mock('../../firebaseAdmin', () => {
  const companyDoc = {
    exists: true,
    data: () => ({ companyName: 'Acme Trucking' }),
  };
  return {
    db: {
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(companyDoc),
        })),
      })),
    },
  };
});

jest.mock('../../emailService', () => ({
  sendDynamicEmail: jest.fn().mockResolvedValue({ success: true, messageId: 'x' }),
}));

const { sendDynamicEmail } = require('../../emailService');
const { onNewApplicationEmailConfirmation } = require('../../notificationTriggers');

function makeEvent(data, { companyId = 'company-1', appId = 'abcdef1234567890' } = {}) {
  return {
    params: { companyId, appId },
    data: { data: () => data },
  };
}

describe('onNewApplicationEmailConfirmation (DL-4)', () => {
  beforeEach(() => {
    sendDynamicEmail.mockClear();
  });

  it('sends the confirmation email with positional (companyId, to, subject, html) args', async () => {
    const event = makeEvent({
      email: 'driver@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
      confirmationNumber: 'CONF-1234',
      positionApplyingTo: 'CDL Driver',
    });

    await onNewApplicationEmailConfirmation.run(event);

    expect(sendDynamicEmail).toHaveBeenCalledTimes(1);
    const [companyId, to, subject, html] = sendDynamicEmail.mock.calls[0];
    expect(companyId).toBe('company-1');
    // `to` must be the plain email string — NOT an options object.
    expect(to).toBe('driver@example.com');
    expect(typeof subject).toBe('string');
    expect(subject).toContain('Acme Trucking');
    expect(subject).toContain('CONF-1234');
    expect(typeof html).toBe('string');
    expect(html).toContain('CONF-1234');
    expect(html).toContain('Jane Doe');
  });

  it('skips applications without a valid email', async () => {
    await onNewApplicationEmailConfirmation.run(makeEvent({ email: 'not-an-email' }));
    await onNewApplicationEmailConfirmation.run(makeEvent({}));
    expect(sendDynamicEmail).not.toHaveBeenCalled();
  });

  it('does not throw when email sending fails (non-fatal)', async () => {
    sendDynamicEmail.mockRejectedValueOnce(new Error('smtp down'));
    await expect(
      onNewApplicationEmailConfirmation.run(
        makeEvent({ email: 'driver@example.com', firstName: 'J' }),
      ),
    ).resolves.toBeUndefined();
  });
});
