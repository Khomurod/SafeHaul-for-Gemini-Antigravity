$functions = @(
    "initBulkSession",
    "processBulkBatch",
    "retryFailedAttempts",
    "getFilterCount",
    "getFilteredLeadsPage",
    "resumeBulkSession",
    "pauseBulkSession",
    "cancelBulkSession",
    "sealDocument",
    "notifySigner",
    "getPublicEnvelope",
    "submitPublicEnvelope",
    "createPortalUser",
    "deletePortalUser",
    "updatePortalUser",
    "onMembershipWrite",
    "onDriverProfileCreated",
    "joinCompanyTeam",
    "deleteCompany",
    "onApplicationSubmitted",
    "onLeadSubmitted",
    "syncDriverOnLog",
    "syncDriverOnActivity",
    "onCompanyLeadSubmitted",
    "sendAutomatedEmail",
    "cleanupBadLeads",
    "handleLeadOutcome",
    "migrateDriversToLeads",
    "confirmDriverInterest",
    "runLeadDistribution",
    "distributeDailyLeads",
    "getLeadSupplyAnalytics",
    "recallAllPlatformLeads",
    "forceUnlockPool",
    "getBadLeadsAnalytics",
    "getCompanyDistributionStatus",
    "syncSystemStructure",
    "runSecurityAudit",
    "getSignedUploadUrl",
    "testEmailConnection",
    "runMigration",
    "debugAppCounts",
    "connectFacebookPage",
    "facebookWebhook",
    "facebookWebhookV1",
    "saveIntegrationConfig",
    "verifySmsConfig",
    "sendTestSMS",
    "sendSMS",
    "executeReactivationBatch",
    "addPhoneLine",
    "removePhoneLine",
    "testLineConnection",
    "verifyLineConnection",
    "onActivityLogCreated",
    "onLegacyActivityCreated",
    "onLeadsActivityLogCreated",
    "processCompanyDistribution",
    "backfillCompanyStats",
    "backfillAllStats",
    "onApplicationUpdateSegments",
    "onApplicationCreatedSegments",
    "handleOptOut",
    "onApplicationStatusChanged",
    "onLeadAssigned",
    "onNewApplicationNotification",
    "onCallbackScheduled",
    "onLeadCallbackScheduled"
)

Write-Host "Deploying Firestore Rules..."
firebase deploy --only firestore:rules
if ($LASTEXITCODE -ne 0) { Write-Error "Firestore Rules deployment failed"; exit $LASTEXITCODE }

Write-Host "Deploying Storage Rules..."
firebase deploy --only storage
if ($LASTEXITCODE -ne 0) { Write-Error "Storage Rules deployment failed"; exit $LASTEXITCODE }

foreach ($func in $functions) {
    Write-Host "Deploying function: $func"
    firebase deploy --only functions:$func
    if ($LASTEXITCODE -ne 0) { 
        Write-Warning "Function $func failed to deploy. continuing..."
    }
}
Write-Host "Deployment sequence completed."
