# Production Readiness Runbook

This runbook defines operations ownership, alerting responses, quota controls, and rollback steps required for production hardening.

## Ownership Matrix

- Frontend incidents: Web Platform team
- Cloud Functions incidents: Backend Platform team
- Auth/RBAC incidents: Security owner
- Messaging incidents (SMS/Email): Integrations owner

## Alert Triggers

- Function error rate > 5% for 10 minutes
- `permission-denied` spikes on sensitive callables
- SMS send failures > 20% for 10 minutes
- Queue backlog growth without drain for 15 minutes

## Immediate Incident Actions

1. Triage severity and assign incident commander.
2. Confirm blast radius (single tenant vs multi-tenant).
3. Freeze deployments if severity is high.
4. Apply rollback if latest deploy is implicated.
5. Publish stakeholder update every 15 minutes until stabilized.

## Rollback Procedure

1. Identify previous successful workflow run and release SHA.
2. Redeploy previous known-good Hosting + Functions revisions.
3. Validate smoke checks:
   - Auth login
   - `initBulkSession`
   - `sendSMS` (non-production dry-run tenant)
   - `submitGuestApplication`
4. Reopen traffic once errors return to baseline.

## Quotas and Rate Caps

- SMS/test SMS: per-company and per-user rate limits (server-side).
- Public verification endpoints: fail-closed rate limiting.
- Guest upload/submit: callable rate limits + path validation (see [security-posture.md](security-posture.md); App Check not used).

## Post-Incident Review

- Complete root cause analysis within 48 hours.
- Add regression test and monitoring rule for the failure mode.
- Track action items until closure.
