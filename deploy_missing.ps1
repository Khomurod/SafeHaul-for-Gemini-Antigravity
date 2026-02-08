# Read the deployed functions list raw content
$deployedContent = Get-Content "functions_deployed_utf8.txt" -Raw

# List of all expected functions from index.js
$expectedFunctions = @(
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

# Find missing functions
$missingFunctions = @()
foreach ($func in $expectedFunctions) {
    # Check if the function name exists in the file, surrounded by spaces/boundaries
    # We use a simple string match for the name itself, implying if it's there, it's deployed.
    if ($deployedContent -notmatch "\b$func\b") {
        $missingFunctions += $func
        Write-Host "Missing function found: $func"
    }
}

if ($missingFunctions.Count -eq 0) {
    Write-Host "All functions are already deployed! No changes needed."
} else {
    Write-Host "Found $($missingFunctions.Count) missing functions. Starting deployment..."
    foreach ($func in $missingFunctions) {
        Write-Host "Deploying missing function: $func"
        firebase deploy --only functions:$func
        if ($LASTEXITCODE -ne 0) { 
             Write-Warning "Function $func failed to deploy."
        }
    }
}
