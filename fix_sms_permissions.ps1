$services = @(
    "executereactivationbatch",
    "sendtestsms",
    "testlineconnection",
    "verifylineconnection",
    "verifysmsconfig",
    "sendsms",
    "addphoneline",
    "removephoneline",
    "assignphonenumber",
    "addmanualphonenumber",
    "saveintegrationconfig"
)

$project = "truckerapp-system"
$region = "us-central1"

foreach ($svc in $services) {
    Write-Host "Allowing unauthenticated invocations for $svc..." -ForegroundColor Cyan
    gcloud run services add-iam-policy-binding $svc `
        --member="allUsers" `
        --role="roles/run.invoker" `
        --region=$region `
        --project=$project `
        --quiet
}

Write-Host "All permissions updated!" -ForegroundColor Green
