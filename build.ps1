param(
    [string]$SdkRoot = "",
    [string]$JavaHome = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Main = Join-Path $Root "app\src\main"
$Build = Join-Path $Root "build"
$Dist = Join-Path $Root "dist"

if ([string]::IsNullOrWhiteSpace($SdkRoot)) {
    $SdkRoot = Join-Path (Split-Path -Parent $Root) "android-sdk"
}
if ([string]::IsNullOrWhiteSpace($JavaHome)) {
    $candidate = Join-Path (Split-Path -Parent $Root) "jdk17"
    if (Test-Path $candidate) {
        $JavaHome = (Get-ChildItem $candidate -Directory | Select-Object -First 1).FullName
    } elseif ($env:JAVA_HOME) {
        $JavaHome = $env:JAVA_HOME
    }
}

$BuildTools = Get-ChildItem (Join-Path $SdkRoot "build-tools") -Directory | Sort-Object Name -Descending | Select-Object -First 1
$Platform = Get-ChildItem (Join-Path $SdkRoot "platforms") -Directory | Sort-Object Name -Descending | Select-Object -First 1
if (-not $BuildTools -or -not $Platform) {
    throw "Android SDK build-tools/platform not found under $SdkRoot"
}
if (-not $JavaHome -or -not (Test-Path (Join-Path $JavaHome "bin\javac.exe"))) {
    throw "JDK 17 not found. Pass -JavaHome <path>."
}

$Aapt2 = Join-Path $BuildTools.FullName "aapt2.exe"
$Zipalign = Join-Path $BuildTools.FullName "zipalign.exe"
$Apksigner = Join-Path $BuildTools.FullName "apksigner.bat"
$D8 = Join-Path $BuildTools.FullName "d8.bat"
$Javac = Join-Path $JavaHome "bin\javac.exe"
$Keytool = Join-Path $JavaHome "bin\keytool.exe"
$AndroidJar = Join-Path $Platform.FullName "android.jar"
$env:JAVA_HOME = $JavaHome
$env:PATH = (Join-Path $JavaHome "bin") + ";" + $env:PATH

Write-Host "SDK:        $SdkRoot"
Write-Host "Build tools: $($BuildTools.Name)"
Write-Host "Platform:   $($Platform.Name)"
Write-Host "JDK:        $JavaHome"

if (Test-Path $Build) { Remove-Item -Recurse -Force $Build }
New-Item -ItemType Directory -Force -Path $Build, (Join-Path $Build "gen"), (Join-Path $Build "classes"), (Join-Path $Build "dex"), $Dist | Out-Null

$resZip = Join-Path $Build "resources.zip"
Write-Host "`n[1/7] Compiling resources"
& $Aapt2 compile --dir (Join-Path $Main "res") -o $resZip
if ($LASTEXITCODE -ne 0) { throw "aapt2 compile failed" }

Write-Host "[2/7] Linking resources and assets"
$baseApk = Join-Path $Build "base.apk"
& $Aapt2 link -o $baseApk `
    -I $AndroidJar `
    --manifest (Join-Path $Main "AndroidManifest.xml") `
    -R $resZip `
    -A (Join-Path $Main "assets") `
    --java (Join-Path $Build "gen") `
    --min-sdk-version 23 `
    --target-sdk-version 34 `
    --auto-add-overlay
if ($LASTEXITCODE -ne 0) { throw "aapt2 link failed" }

Write-Host "[3/7] Compiling Java"
$javaFiles = @(Get-ChildItem (Join-Path $Main "java") -Recurse -Filter *.java | ForEach-Object { $_.FullName })
$rJava = Get-ChildItem (Join-Path $Build "gen") -Recurse -Filter "R.java" | Select-Object -First 1
if (-not $rJava) { throw "R.java was not generated" }
& $Javac -encoding UTF-8 -source 8 -target 8 -bootclasspath $AndroidJar -d (Join-Path $Build "classes") @javaFiles $rJava.FullName
if ($LASTEXITCODE -ne 0) { throw "javac failed" }

Write-Host "[4/7] Dexing"
$classFiles = @(Get-ChildItem (Join-Path $Build "classes") -Recurse -Filter *.class | ForEach-Object { $_.FullName })
& $D8 --lib $AndroidJar --min-api 23 --output (Join-Path $Build "dex") @classFiles
if ($LASTEXITCODE -ne 0) { throw "d8 failed" }

Write-Host "[5/7] Packaging classes.dex"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($baseApk, [System.IO.Compression.ZipArchiveMode]::Update)
try {
    $existing = $zip.GetEntry("classes.dex")
    if ($existing) { $existing.Delete() }
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $Build "dex\classes.dex"), "classes.dex", [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
} finally {
    $zip.Dispose()
}

Write-Host "[6/7] Aligning"
$aligned = Join-Path $Build "aligned.apk"
& $Zipalign -f -p 4 $baseApk $aligned
if ($LASTEXITCODE -ne 0) { throw "zipalign failed" }

Write-Host "[7/7] Signing"
$keystore = Join-Path $Root "debug.keystore"
if (-not (Test-Path $keystore)) {
    & $Keytool -genkeypair -v -keystore $keystore -alias riji -keyalg RSA -keysize 2048 -validity 10000 `
        -storepass riji2026 -keypass riji2026 -dname "CN=RiJi, OU=Personal, O=RiJi, L=Shanghai, ST=Shanghai, C=CN"
    if ($LASTEXITCODE -ne 0) { throw "keytool failed" }
}
$outApk = Join-Path $Dist "riji-v1.6.0.apk"
if (Test-Path $outApk) { Remove-Item -Force $outApk }
& $Apksigner sign --ks $keystore --ks-key-alias riji --ks-pass pass:riji2026 --key-pass pass:riji2026 --out $outApk $aligned
if ($LASTEXITCODE -ne 0) { throw "apksigner sign failed" }

& $Apksigner verify --print-certs $outApk
if ($LASTEXITCODE -ne 0) { throw "apksigner verify failed" }

$size = [math]::Round((Get-Item $outApk).Length / 1MB, 2)
Write-Host "`nAPK ready: $outApk ($size MB)"
