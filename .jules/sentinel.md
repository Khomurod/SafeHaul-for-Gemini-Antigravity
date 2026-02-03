# Sentinel's Journal

## 2025-02-17 - [Facebook Webhook Signature Bypass]
**Vulnerability:** The Facebook webhook handler allowed requests without the `X-Hub-Signature` header to pass through without verification, even when `FACEBOOK_APP_SECRET` was configured. In one case, the enforcement code was commented out (`// return res.sendStatus(401)`). In the v1 handler, the logic skipped verification if the signature was missing.
**Learning:** Security controls that "fail open" (proceed if check is skipped) are a major risk. Commented-out security code suggests incomplete implementation or debugging leftovers that made it to production.
**Prevention:** Always "fail closed". If a security header is expected but missing, reject the request immediately. Do not make security checks optional based on the presence of the proof.
