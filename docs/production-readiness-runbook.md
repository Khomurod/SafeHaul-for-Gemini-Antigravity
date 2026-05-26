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

## Bulk SMS / email campaigns

Campaign launch (`initBulkSession`) enqueues work to `processBulkBatch` via Google Cloud Tasks.

### Required Cloud Functions environment variables

Set on **both** `initBulkSession` and `processBulkBatch` (same values):

| Variable | Description |
|----------|-------------|
| `PROCESS_BULK_BATCH_URL` | HTTPS trigger URL for `processBulkBatch` (Cloud Run). Example shape: `https://processbulkbatch-<hash>-uc.a.run.app` — copy from Firebase Console → Functions → `processBulkBatch`. |
| `BULK_WORKER_SECRET` | Shared secret sent as header `X-SafeHaul-Internal-Auth`; must match on worker and enqueue path. Use 32+ random characters. |

CI deploy writes these from GitHub Actions secrets `PROCESS_BULK_BATCH_URL` and `BULK_WORKER_SECRET` into `functions/.env` (see `.github/workflows/main.yml`). Local emulator: copy [`functions/.env.example`](../functions/.env.example) to `functions/.env`.

### Cloud Tasks queue

- **Project:** `truckerapp-system`
- **Region:** `us-central1`
- **Queue name:** `bulk-actions-queue` (must match [`functions/bulkActions/services/queueService.js`](../functions/bulkActions/services/queueService.js))

Create if missing:

```bash
gcloud tasks queues create bulk-actions-queue --location=us-central1 --project=truckerapp-system
```

The Functions runtime service account needs permission to create tasks on this queue (`roles/cloudtasks.enqueuer` or broader).

### Post-deploy verification

1. Launch a campaign from Company Admin → Campaigns.
2. Firebase logs for `initBulkSession` should include `[enqueueWorker] Task created for session …` (not `PROCESS_BULK_BATCH_URL env var is missing`).
3. Firestore: `companies/{companyId}/bulk_sessions/{sessionId}` with `status: 'active'`.
4. Optional: `progress.processedCount` increases and `logs` subcollection receives entries (requires valid SMS integration).

## Post-Incident Review

- Complete root cause analysis within 48 hours.
- Add regression test and monitoring rule for the failure mode.
- Track action items until closure.
