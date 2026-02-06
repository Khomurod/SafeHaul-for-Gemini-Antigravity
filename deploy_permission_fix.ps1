# Deploy Permission Fix - Quick Deployment Script
# This deploys only the 3 functions that were updated to fix the Super Admin permission issue

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Permission Fix Deployment Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if user is authenticated
Write-Host "Checking Firebase authentication..." -ForegroundColor Yellow
$authCheck = cmd /c "node_modules\.bin\firebase.cmd login:list 2>&1"

if ($authCheck -match "No authorized accounts") {
    Write-Host "❌ Not authenticated with Firebase." -ForegroundColor Red
    Write-Host ""
    Write-Host "Please run this command first:" -ForegroundColor Yellow
    Write-Host "  node_modules\.bin\firebase.cmd login" -ForegroundColor White
    Write-Host ""
    Write-Host "This will open a browser window for authentication." -ForegroundColor Gray
    Write-Host ""
    
    # Offer to run it for them
    $response = Read-Host "Would you like me to run the login command now? (y/n)"
    if ($response -eq "y" -or $response -eq "Y") {
        Write-Host "Opening Firebase login..." -ForegroundColor Yellow
        & "node_modules\.bin\firebase.cmd" login
        Write-Host ""
        Write-Host "Please re-run this script after authentication completes." -ForegroundColor Yellow
    }
    exit 1
}

Write-Host "✅ Authenticated!" -ForegroundColor Green
Write-Host ""

# Deploy the 3 fixed functions
$functions = @(
    "saveIntegrationConfig",
    "verifyLineConnection", 
    "verifySmsConfig"
)

Write-Host "Deploying $($functions.Count) updated functions..." -ForegroundColor Cyan
Write-Host ""

foreach ($func in $functions) {
    Write-Host "📦 Deploying: $func" -ForegroundColor Yellow
    
    $result = cmd /c "node_modules\.bin\firebase.cmd deploy --only functions:$func 2>&1"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✅ Success!" -ForegroundColor Green
    } else {
        Write-Host "  ❌ Failed!" -ForegroundColor Red
        Write-Host "  Error: $result" -ForegroundColor Red
    }
    
    Write-Host ""
    
    # Small pause between deployments
    if ($func -ne $functions[-1]) {
        Write-Host "  Waiting 5 seconds before next deployment..." -ForegroundColor Gray
        Start-Sleep -Seconds 5
    }
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Refresh your browser" -ForegroundColor White
Write-Host "2. Try clicking 'Secure Save' again" -ForegroundColor White
Write-Host "3. The permission error should be resolved!" -ForegroundColor White
