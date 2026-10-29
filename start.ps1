$ErrorActionPreference = "Stop"
$previousPassword = $env:STAFF_PASSWORD
$securePassword = Read-Host "Set the staff console password for this run" -AsSecureString
$passwordPointer = [IntPtr]::Zero

try {
    $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    $env:STAFF_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    Write-Host "Starting the local website at http://127.0.0.1:3000"
    Write-Host "Keep this window open while using the website. Press Ctrl+C to stop."
    npm start
    if ($LASTEXITCODE -ne 0) {
        throw "The website server stopped with exit code $LASTEXITCODE."
    }
}
finally {
    if ($passwordPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    }
    $securePassword.Dispose()
    if ($null -eq $previousPassword) {
        Remove-Item Env:\STAFF_PASSWORD -ErrorAction SilentlyContinue
    }
    else {
        $env:STAFF_PASSWORD = $previousPassword
    }
}
