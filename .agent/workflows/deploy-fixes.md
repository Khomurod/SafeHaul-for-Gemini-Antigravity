---
description: How to deploy the critical fixes for Bulk Actions
---

# Deploy Critical Fixes

This workflow deploys the updated Firestore Rules and Cloud Functions to fix the bulk messaging issues.

## 1. Deploy Firestore Rules (Fixes "No messages sent yet" UI bug)
This step updates the security rules to allow fetching delivery logs in the dashboard.

```powershell
firebase deploy --only firestore:rules
```

## 2. Deploy Cloud Functions (Fixes Instant Sending & Timeouts)
This step pushes the updated `processBulkBatch` function with:
- Reduced batch size (20)
- Improved error handling (Try/Catch)
- Robust delay logic (3s interval)

// turbo
```powershell
firebase deploy --only functions:initBulkSession,functions:processBulkBatch,functions:retryFailedAttempts,functions:resumeBulkSession
```

> [!IMPORTANT]
> Since you experienced issues with "Instant Sending", it is possible the previous deployment failed or you were running against an old version. This deployment is required to enact the fixes.
