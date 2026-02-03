## 2024-05-23 - Facebook Webhook Signature Bypass
**Vulnerability:** Facebook webhook endpoints (`facebookWebhook` and `facebookWebhookV1`) were configured to check for `X-Hub-Signature` existence but explicitly logged a warning instead of blocking requests when it was missing. V1 logic allowed fall-through if signature was missing.
**Learning:** Checking for the *existence* of a header is not enough; the control flow must explicitly *return/throw* to stop execution. Commented-out security enforcement code ("// Optional: Enforcement") is a major risk indicator.
**Prevention:** Always use "fail-safe" defaults. Initialize variables to insecure states and only set to secure states after validation. In express/http handlers, ensure every error path terminates the request (returns response).
