param(
  [Parameter(Mandatory=$true)] [string]$UserPoolId,
  [Parameter(Mandatory=$true)] [string]$InputPath,        # .\assets\demo-data\doctors.json
  [Parameter(Mandatory=$true)] [string]$DefaultPassword,  # e.g., HealthPass!1
  [string]$GroupName = "DOCTORS",
  [string]$Region    = "eu-west-3",
  [switch]$SendCustomAttributes
)

# 0) Input check
if (-not (Test-Path -Path $InputPath)) {
  Write-Error "Input JSON not found: $InputPath"
  exit 1
}

# 1) Ensure group exists (ignore error if it already exists)
aws cognito-idp create-group `
  --user-pool-id $UserPoolId `
  --group-name $GroupName `
  --region $Region | Out-Null

# 2) Load doctors
$doctors = Get-Content -Raw -Path $InputPath | ConvertFrom-Json
if ($doctors -isnot [System.Collections.IEnumerable]) {
  Write-Error "Input JSON must be an array."
  exit 1
}

function Join-Langs([object]$langs) {
  if ($null -eq $langs) { return "" }
  if ($langs -is [System.Collections.IEnumerable] -and -not ($langs -is [string])) {
    return [string]::Join(",", $langs)
  }
  return [string]$langs
}

$processed = 0
foreach ($d in $doctors) {
  $email = [string]$d.email
  if ([string]::IsNullOrWhiteSpace($email)) {
    Write-Warning "Skipping record without 'email': $($d | ConvertTo-Json -Compress)"
    continue
  }

  $given  = if ([string]::IsNullOrWhiteSpace([string]$d.firstName)) {"Doctor"} else {[string]$d.firstName}
  $family = if ([string]::IsNullOrWhiteSpace([string]$d.lastName))  {"User"}   else {[string]$d.lastName}
  $spec   = [string]$d.specialty
  $city   = [string]$d.city
  $langs  = Join-Langs $d.languages

  Write-Host "→ Ensuring user: $email" -ForegroundColor Yellow

  # 3a) Create user (suppress email). If user exists, this will non-zero exit; ignore.
  $attrs = @(
    "Name=email,Value=$email",
    "Name=email_verified,Value=true",
    "Name=given_name,Value=$given",
    "Name=family_name,Value=$family"
  )

  if ($SendCustomAttributes.IsPresent) {
    $attrs += "Name=custom:role,Value=DOCTOR"
    if ($spec) { $attrs += "Name=custom:specialty,Value=$spec" }
    if ($langs) { $attrs += "Name=custom:languages,Value=$langs" }
    if ($city) { $attrs += "Name=custom:city,Value=$city" }
  }

  aws cognito-idp admin-create-user `
    --user-pool-id $UserPoolId `
    --username $email `
    --user-attributes $attrs `
    --message-action SUPPRESS `
    --region $Region | Out-Null
  # ignore $LASTEXITCODE here (user may already exist)

  # 3b) Set permanent password (idempotent)
  aws cognito-idp admin-set-user-password `
    --user-pool-id $UserPoolId `
    --username $email `
    --password $DefaultPassword `
    --permanent `
    --region $Region | Out-Null

  # 3c) Add to group (idempotent)
  aws cognito-idp admin-add-user-to-group `
    --user-pool-id $UserPoolId `
    --username $email `
    --group-name $GroupName `
    --region $Region | Out-Null

  $processed += 1
}

Write-Host ""
Write-Host ("Done. Ensured {0} doctor users in pool {1} (group: {2})." -f $processed,$UserPoolId,$GroupName) -ForegroundColor Green
Write-Host "Default password set to: $DefaultPassword"
