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
    "verifyLineConnection"
)

$logFile = "deployment_sms_log.txt"
"Starting SMS Function Deployment - $(Get-Date)" | Out-File $logFile

foreach ($func in $functions) {
    Write-Host "Deploying $func..." -ForegroundColor Cyan
    try {
        # Using cmd /c with firebase deploy. Added -NoNewWindow to capture output in current console if possible.
        $proc = Start-Process -FilePath "cmd" -ArgumentList "/c firebase deploy --only functions:$func" -Wait -NoNewWindow -PassThru
        
        if ($proc.ExitCode -eq 0) {
            Write-Host "SUCCESS: $func" -ForegroundColor Green
            "SUCCESS: $func" | Out-File $logFile -Append
        }
        else {
            Write-Host "FAILURE: $func" -ForegroundColor Red
            "FAILURE: $func" | Out-File $logFile -Append
        }
    }
    catch {
        Write-Host "ERROR executing deployment for $func" -ForegroundColor Red
        "ERROR: $func - $_" | Out-File $logFile -Append
    }

    Write-Host "Waiting 15 seconds to cool down CPU..." -ForegroundColor Yellow
    Start-Sleep -Seconds 15
}

Write-Host "All SMS functions attempted. Check $logFile." -ForegroundColor Green
