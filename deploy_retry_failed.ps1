$func = "addPhoneLine"
Write-Host "Retrying deployment for $func..." -ForegroundColor Cyan

try {
    # Run firebase deploy for just this function
    # We use cmd /c to ensure it runs correctly
    firebase deploy --only functions:$func
}
catch {
    Write-Host "Error running deployment command: $_" -ForegroundColor Red
}
