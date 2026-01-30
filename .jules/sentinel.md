## 2024-05-23 - Fail-Open Webhook Verification
**Vulnerability:** Facebook webhook handler checked for signature but allowed requests to proceed if the signature was missing (fail-open).
**Learning:** Security checks were implemented but commented out or logically bypassed, likely for easier local testing, but left unsafe for production.
**Prevention:** Ensure all security verification logic defaults to 'deny' (fail-closed) and enforce checks strictly in all environments, or use explicit dev-only bypass flags.
