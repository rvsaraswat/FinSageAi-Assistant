# FinSageAi Assistant - Distribution Preparation Script
# This script creates a clean copy ready for public distribution

param(
    [string]$DestinationPath = "E:\FinSageAi-Assistant-Public",
    [switch]$DryRun
)

Write-Host "[FinSageAi Assistant - Distribution Preparation]" -ForegroundColor Cyan
Write-Host ("=" * 60) -ForegroundColor Gray
Write-Host ""

# Get current directory - use script location or current directory
$SourcePath = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }

# Files to include in distribution
$FilesToInclude = @(
    ".dockerignore",
    ".env.example",
    ".gitignore",
    "CHARTS_GUIDE.md",
    "CONTRIBUTING.md",
    "DOCKER_DEPLOYMENT.md",
    "docker-compose.yml",
    "Dockerfile",
    "DISTRIBUTION_SUMMARY.md",
    "INSTALLATION.md",
    "kiteClient.js",
    "KITE_AUTH_GUIDE.md",
    "LICENSE",
    "mcpClient.js",
    "package.json",
    "README.md",
    "RELEASE_CHECKLIST.md",
    "server.js",
    "SETUP_ZERODHA_DATA.md",
    "verify-setup.js"
)

# Directories to include (will copy all contents)
$DirsToInclude = @(
    ".github",
    "public"
)

# Files to EXCLUDE (security critical)
$FilesToExclude = @(
    ".env",
    "node_modules",
    "package-lock.json",
    "zerodha_ai_prompt.txt",
    "prepare-distribution.ps1"
)

Write-Host "[Source]: $SourcePath" -ForegroundColor Yellow
Write-Host "[Destination]: $DestinationPath" -ForegroundColor Yellow
Write-Host ""

if ($DryRun) {
    Write-Host "[DRY RUN MODE] - No files will be copied" -ForegroundColor Magenta
    Write-Host ""
}

# Check if destination exists
if (Test-Path $DestinationPath) {
    if (-not $DryRun) {
        $response = Read-Host "[WARNING] Destination already exists. Overwrite? (yes/no)"
        if ($response -ne "yes") {
            Write-Host "[ABORTED] by user" -ForegroundColor Red
            exit 1
        }
        Remove-Item -Path $DestinationPath -Recurse -Force
    }
}

# Create destination directory
if (-not $DryRun) {
    New-Item -ItemType Directory -Path $DestinationPath -Force | Out-Null
    Write-Host "[OK] Created destination directory" -ForegroundColor Green
} else {
    Write-Host "Would create: $DestinationPath" -ForegroundColor Gray
}

Write-Host ""
Write-Host "[Copying files]..." -ForegroundColor Cyan

# Copy individual files
foreach ($file in $FilesToInclude) {
    $sourceFile = Join-Path $SourcePath $file
    $destFile = Join-Path $DestinationPath $file
    
    if (Test-Path $sourceFile) {
        if (-not $DryRun) {
            Copy-Item -Path $sourceFile -Destination $destFile -Force
            Write-Host "  [OK] $file" -ForegroundColor Green
        } else {
            Write-Host "  Would copy: $file" -ForegroundColor Gray
        }
    } else {
        Write-Host "  [WARN] Not found: $file" -ForegroundColor Yellow
    }
}

# Copy directories
foreach ($dir in $DirsToInclude) {
    $sourceDir = Join-Path $SourcePath $dir
    $destDir = Join-Path $DestinationPath $dir
    
    if (Test-Path $sourceDir) {
        if (-not $DryRun) {
            Copy-Item -Path $sourceDir -Destination $destDir -Recurse -Force
            $fileCount = (Get-ChildItem -Path $sourceDir -Recurse -File).Count
            Write-Host "  [OK] $dir ($fileCount files)" -ForegroundColor Green
        } else {
            $fileCount = (Get-ChildItem -Path $sourceDir -Recurse -File).Count
            Write-Host "  Would copy: $dir ($fileCount files)" -ForegroundColor Gray
        }
    } else {
        Write-Host "  [WARN] Not found: $dir" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "[Security Check]..." -ForegroundColor Cyan

# Verify excluded files are NOT in destination
foreach ($file in $FilesToExclude) {
    $destPath = Join-Path $DestinationPath $file
    
    if (-not $DryRun) {
        if (Test-Path $destPath) {
            Write-Host "  [ERROR] SECURITY RISK: $file found in destination!" -ForegroundColor Red
            Remove-Item -Path $destPath -Recurse -Force
            Write-Host "     Removed $file" -ForegroundColor Yellow
        } else {
            Write-Host "  [OK] $file not present (good)" -ForegroundColor Green
        }
    } else {
        Write-Host "  Would check: $file" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "[Summary]" -ForegroundColor Cyan
Write-Host ("=" * 60) -ForegroundColor Gray

if (-not $DryRun) {
    $totalFiles = (Get-ChildItem -Path $DestinationPath -Recurse -File).Count
    $totalSize = ((Get-ChildItem -Path $DestinationPath -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB)
    
    Write-Host "[SUCCESS] Distribution package created successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "   Location: $DestinationPath" -ForegroundColor White
    Write-Host "   Files: $totalFiles" -ForegroundColor White
    Write-Host "   Size: $([math]::Round($totalSize, 2)) MB" -ForegroundColor White
    Write-Host ""
    Write-Host "[Next Steps]:" -ForegroundColor Cyan
    Write-Host "   1. cd $DestinationPath" -ForegroundColor White
    Write-Host "   2. Review files (especially .env.example)" -ForegroundColor White
    Write-Host "   3. git init && git add . && git commit -m 'Initial commit'" -ForegroundColor White
    Write-Host "   4. Update package.json with your GitHub username" -ForegroundColor White
    Write-Host "   5. git remote add origin https://github.com/rvsaraswat/FinSageAi-Assistant.git" -ForegroundColor White
    Write-Host "   6. git push -u origin main" -ForegroundColor White
    Write-Host ""
    Write-Host "[INFO] See RELEASE_CHECKLIST.md for complete publishing guide" -ForegroundColor Yellow
} else {
    Write-Host "[SUCCESS] Dry run complete - no files were copied" -ForegroundColor Green
    Write-Host ""
    Write-Host "Run without -DryRun to actually create the distribution package" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[DONE]" -ForegroundColor Cyan
