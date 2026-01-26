$functions = @(
    "saveIntegrationConfig",
    "verifySmsConfig",
    "sendTestSMS",
    "sendSMS",
    "executeReactivationBatch",
    "assignPhoneNumber",
    "addManualPhoneNumber",
    "addPhoneLine",
    "removePhoneLine",
    "testLineConnection",
    "verifyLineConnection",
    "initBulkSession",
    "processBulkBatch"
)

foreach ($func in $functions) {
    Write-Host "Deploying $func..." -ForegroundColor Cyan
    firebase deploy --only functions:$func
    Write-Host "Cooling 5s..."
    Start-Sleep -Seconds 5
}
