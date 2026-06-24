# Repair broken node_modules junctions (Windows).
#
# Bun on Windows links each top-level node_modules pkg as a junction into the
# isolated store at node_modules/.bun/STOREKEY/node_modules/PKG. These junctions
# can become broken reparse points (invalid target) while the .bun store stays
# intact -- symptom: bunx vitest / drizzle-kit fail to resolve.
#
# This scans node_modules + packages/ui/node_modules for broken junctions and
# recreates each one pointing back into the (single, top-level) .bun store.
# Non-destructive: only the dead junction links are touched, never the store.
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts/fix-junctions.ps1

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$store = Join-Path $repoRoot "node_modules\.bun"
if (-not (Test-Path $store)) { Write-Error "No .bun store at $store. Run 'bun install' first."; exit 1 }

# Root-hoisted version per package, parsed from bun.lock. Lines look like:
#   "vitest": ["vitest@3.2.4", ...]   or   "@vitest/ui": ["@vitest/ui@3.2.4", ...]
$hoisted = @{}
$lockPath = Join-Path $repoRoot "bun.lock"
if (Test-Path $lockPath) {
  foreach ($line in Get-Content $lockPath) {
    $m = [regex]::Match($line, '^\s*"(?<name>@?[^"]+)":\s*\["(?<spec>@?[^"]+)"')
    if ($m.Success) {
      $name = $m.Groups['name'].Value
      $spec = $m.Groups['spec'].Value
      if ($spec.StartsWith("$name@")) { $hoisted[$name] = $spec.Substring($name.Length + 1) }
    }
  }
}

function Get-StoreKeyPrefix([string]$pkgName) {
  # bare 'vitest' becomes 'vitest@' ; scoped '@vitest/ui' becomes '@vitest+ui@'
  if ($pkgName.StartsWith("@")) { return ($pkgName -replace "/", "+") + "@" }
  return "$pkgName@"
}

function Resolve-Target([string]$pkgName) {
  $prefix = Get-StoreKeyPrefix $pkgName
  $candidates = Get-ChildItem $store -Directory -Filter "$prefix*" -ErrorAction SilentlyContinue
  if (-not $candidates) { return $null }
  $chosen = $null
  if ($candidates.Count -eq 1) {
    $chosen = $candidates[0]
  } elseif ($hoisted.ContainsKey($pkgName)) {
    $ver = $hoisted[$pkgName]
    $chosen = $candidates | Where-Object { $_.Name -eq "$prefix$ver" -or $_.Name -like "$prefix$ver+*" } | Select-Object -First 1
  }
  if (-not $chosen) { $chosen = $candidates | Sort-Object Name | Select-Object -Last 1 }
  $inner = Join-Path $chosen.FullName ("node_modules\" + ($pkgName -replace "/", "\"))
  if (Test-Path $inner) { return $inner }
  return $null
}

function Repair-Root([string]$root) {
  if (-not (Test-Path $root)) { return [pscustomobject]@{ Fixed = 0; Broken = 0; Unresolved = @() } }
  $fixed = 0; $broken = 0; $unresolved = @()

  $links = @()
  Get-ChildItem $root -Directory -Force -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.Name -eq ".bun") { return }
    if ($_.Name -like "@*") {
      Get-ChildItem $_.FullName -Directory -Force -ErrorAction SilentlyContinue | ForEach-Object {
        $links += [pscustomobject]@{ Path = $_.FullName; Name = "$($_.Parent.Name)/$($_.Name)"; Item = $_ }
      }
    } else {
      $links += [pscustomobject]@{ Path = $_.FullName; Name = $_.Name; Item = $_ }
    }
  }

  foreach ($l in $links) {
    $isReparse = ($l.Item.Attributes -band [IO.FileAttributes]::ReparsePoint)
    if (-not $isReparse) { continue }
    if (Test-Path (Join-Path $l.Path "package.json")) { continue }
    $broken++
    $target = Resolve-Target $l.Name
    if (-not $target) { $unresolved += $l.Name; continue }
    [System.IO.Directory]::Delete($l.Path, $false)
    New-Item -ItemType Junction -Path $l.Path -Target $target | Out-Null
    $fixed++
  }
  return [pscustomobject]@{ Fixed = $fixed; Broken = $broken; Unresolved = $unresolved }
}

# Ensure every DIRECT dependency from a package.json is linked at top level.
# Bun's isolated install can leave a direct dep with no top-level junction at
# all (not just broken) -- e.g. vitest / drizzle-kit. Transitive deps resolve
# inside the store, so we only need the direct ones linked here.
function Ensure-DirectDeps([string]$pkgJsonPath, [string]$nodeModulesRoot) {
  if (-not (Test-Path $pkgJsonPath)) { return [pscustomobject]@{ Created = 0; Missing = @() } }
  $pkg = Get-Content $pkgJsonPath -Raw | ConvertFrom-Json
  $names = @()
  foreach ($sect in @("dependencies", "devDependencies", "optionalDependencies")) {
    if ($pkg.$sect) { $names += $pkg.$sect.PSObject.Properties.Name }
  }
  $names = $names | Where-Object { $_ -and $_ -notlike "@zerotrust/*" } | Sort-Object -Unique

  $created = 0; $missing = @()
  foreach ($name in $names) {
    $linkPath = Join-Path $nodeModulesRoot ($name -replace "/", "\")
    if (Test-Path (Join-Path $linkPath "package.json")) { continue } # already linked & healthy
    $target = Resolve-Target $name
    if (-not $target) { $missing += $name; continue }
    if (Test-Path $linkPath) { [System.IO.Directory]::Delete($linkPath, $false) }
    $parent = Split-Path $linkPath -Parent
    if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    New-Item -ItemType Junction -Path $linkPath -Target $target | Out-Null
    $created++
  }
  return [pscustomobject]@{ Created = $created; Missing = $missing }
}

$totalFixed = 0; $totalBroken = 0; $totalCreated = 0; $allUnresolved = @()
$roots = @(
  @{ Nm = (Join-Path $repoRoot "node_modules"); Pkg = (Join-Path $repoRoot "package.json") },
  @{ Nm = (Join-Path $repoRoot "packages\ui\node_modules"); Pkg = (Join-Path $repoRoot "packages\ui\package.json") }
)
foreach ($r in $roots) {
  $res = Repair-Root $r.Nm
  $totalFixed += $res.Fixed; $totalBroken += $res.Broken; $allUnresolved += $res.Unresolved
  $ens = Ensure-DirectDeps $r.Pkg $r.Nm
  $totalCreated += $ens.Created; $allUnresolved += $ens.Missing
  Write-Host ("{0}: repaired {1}/{2} broken, created {3} missing" -f $r.Nm, $res.Fixed, $res.Broken, $ens.Created)
}
Write-Host ("Done. Repaired {0}, created {1}." -f $totalFixed, $totalCreated)
if ($allUnresolved.Count -gt 0) {
  Write-Host "No store target found for (likely transitive, resolves inside store):" -ForegroundColor Yellow
  $allUnresolved | Sort-Object -Unique | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
}
