param(
  [switch]$Install,
  [string]$DriveLetter = 'R',
  [ValidateSet('x86_64', 'arm64-v8a')]
  [string]$Architecture = 'x86_64'
)

$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
$driveName = $DriveLetter.TrimEnd(':').ToUpperInvariant()
if ($driveName -notmatch '^[A-Z]$') { throw 'DriveLetter must be one letter.' }

$node = Get-Command node.exe -ErrorAction Stop
$pnpm = Get-Command pnpm.cmd -ErrorAction Stop
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules\expo'))) {
  throw 'Project dependencies are missing. Run pnpm.cmd install in the project directory.'
}

if (-not $env:JAVA_HOME) {
  $java = Get-Command java.exe -ErrorAction Stop
  $env:JAVA_HOME = Split-Path (Split-Path $java.Source -Parent) -Parent
}
if (-not (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin\javac.exe'))) {
  throw "JDK is missing from JAVA_HOME: $env:JAVA_HOME"
}

if (-not $env:ANDROID_HOME) {
  $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
}
$requiredSdkFiles = @(
  'platform-tools\adb.exe',
  'cmake\3.22.1\bin\ninja.exe',
  'ndk\27.1.12297006\toolchains\llvm\prebuilt\windows-x86_64\bin\clang.exe',
  'build-tools\37.0.0\aapt2.exe'
)
foreach ($relative in $requiredSdkFiles) {
  $required = Join-Path $env:ANDROID_HOME $relative
  if (-not (Test-Path -LiteralPath $required)) { throw "Android SDK component is missing: $required" }
}

$existingMapping = & "$env:SystemRoot\System32\subst.exe" |
  Where-Object { $_ -match "^$driveName`:\\: => (.+)$" } |
  Select-Object -First 1
if ($existingMapping) {
  $mappedRoot = $Matches[1].TrimEnd('\')
  if (-not $mappedRoot.Equals($projectRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "$driveName`: is mapped to $mappedRoot. Use -DriveLetter with an unused letter."
  }
} else {
  & "$env:SystemRoot\System32\subst.exe" "$driveName`:" $projectRoot
  if ($LASTEXITCODE -ne 0) { throw "Could not map $driveName`: to $projectRoot" }
}

$env:AI_SENSEI_PHYSICAL_ROOT = $projectRoot
$env:GRADLE_USER_HOME = if ($env:GRADLE_USER_HOME) { $env:GRADLE_USER_HOME } else { Join-Path $env:USERPROFILE '.gradle' }
$env:ANDROID_USER_HOME = if ($env:ANDROID_USER_HOME) { $env:ANDROID_USER_HOME } else { Join-Path $env:USERPROFILE '.android' }
$env:Path = "$(Split-Path $node.Source -Parent);$(Split-Path $pnpm.Source -Parent);$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"

$shortAndroidDir = "$driveName`:\android"
Push-Location $shortAndroidDir
try {
  & '.\gradlew.bat' app:assembleDebug -x lint -x test --configure-on-demand --build-cache -PreactNativeDevServerPort=8081 "-PreactNativeArchitectures=$Architecture" --console=plain
  if ($LASTEXITCODE -ne 0) { throw 'Android build failed.' }
} finally {
  Pop-Location
}

$apk = Join-Path $projectRoot 'android\app\build\outputs\apk\debug\app-debug.apk'
if (-not (Test-Path -LiteralPath $apk)) { throw "Build finished without APK: $apk" }
Write-Host "Built $apk"

if ($Install) {
  & (Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe') install -r $apk
  if ($LASTEXITCODE -ne 0) { throw 'APK installation failed. Check adb devices.' }
}
