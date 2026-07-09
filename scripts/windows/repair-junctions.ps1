# Bulk-repair broken bun-on-Windows node_modules junctions by repointing each
# corrupt reparse point to its package in the top-level .bun store.
$ErrorActionPreference = "Stop"
$root = (Resolve-Path "$PSScriptRoot\..").Path
$store = Join-Path $root "node_modules\.bun"
if (-not (Test-Path $store)) { Write-Error "no .bun store at $store"; exit 1 }

# Map: bare package name -> hoisted version from bun.lock ("name": ["name@ver", ...])
$lock = ""
try { $lock = Get-Content (Join-Path $root "bun.lock") -Raw } catch {}
function Get-LockVersion([string]$name) {
  $esc = [regex]::Escape($name)
  $m = [regex]::Match($lock, "`"$esc`":\s*\[`"$esc@([^`"+]+)")
  if ($m.Success) { return $m.Groups[1].Value } else { return $null }
}

$storeDirs = Get-ChildItem $store -Directory -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name

function Get-StoreTarget([string]$name) {
  $prefix = ($name -replace "/", "+") + "@"
  $subPath = ($name -split "/") -join "\"
  $cands = @()
  foreach ($d in $storeDirs) {
    if ($d.StartsWith($prefix)) {
      $ver = ($d.Substring($prefix.Length) -split "\+")[0]
      $dir = Join-Path (Join-Path $store $d) "node_modules\$subPath"
      if (Test-Path (Join-Path $dir "package.json")) {
        $cands += [pscustomobject]@{ ver = $ver; dir = $dir }
      }
    }
  }
  if ($cands.Count -eq 0) { return $null }
  if ($cands.Count -eq 1) { return $cands[0].dir }
  $want = Get-LockVersion $name
  if ($want) { $f = $cands | Where-Object { $_.ver -eq $want }; if ($f) { return ($f | Select-Object -First 1).dir } }
  # else highest semver
  $best = $cands | Sort-Object -Property @{Expression={[version]($_.ver -replace '[^0-9.].*$','')}} -Descending | Select-Object -First 1
  return $best.dir
}

function Is-Broken([string]$p) {
  $item = Get-Item $p -Force -ErrorAction SilentlyContinue
  if (-not $item) { return $false }
  $isReparse = ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
  if (-not $isReparse) { return $false }
  # broken if the package.json can't be read through the link
  return -not (Test-Path (Join-Path $p "package.json"))
}

function Repair-One([string]$linkPath, [string]$name, [System.Collections.ArrayList]$fixed, [System.Collections.ArrayList]$failed) {
  $target = Get-StoreTarget $name
  if (-not $target) { [void]$failed.Add("$name (no store target)"); return }
  try {
    [System.IO.Directory]::Delete($linkPath, $false)
  } catch {
    try { (Get-Item $linkPath -Force).Delete() } catch { [void]$failed.Add("$name (delete failed)"); return }
  }
  try {
    New-Item -ItemType Junction -Path $linkPath -Target $target -ErrorAction Stop | Out-Null
    [void]$fixed.Add($name)
  } catch {
    [void]$failed.Add("$name (relink failed: $($_.Exception.Message))")
  }
}

$roots = @(Join-Path $root "node_modules")
foreach ($ws in @("packages\ui", "packages\client")) {
  $nm = Join-Path $root "$ws\node_modules"
  if (Test-Path $nm) { $roots += $nm }
}

$fixed = New-Object System.Collections.ArrayList
$failed = New-Object System.Collections.ArrayList

foreach ($nm in $roots) {
  if (-not (Test-Path $nm)) { continue }
  foreach ($entry in (Get-ChildItem $nm -Force -ErrorAction SilentlyContinue)) {
    if ($entry.Name -in @(".bin", ".bun", ".cache")) { continue }
    $p = $entry.FullName
    if ($entry.Name.StartsWith("@")) {
      foreach ($kid in (Get-ChildItem $p -Force -ErrorAction SilentlyContinue)) {
        if (Is-Broken $kid.FullName) { Repair-One $kid.FullName "$($entry.Name)/$($kid.Name)" $fixed $failed }
      }
    } elseif (Is-Broken $p) {
      Repair-One $p $entry.Name $fixed $failed
    }
  }
}

Write-Output "FIXED: $($fixed.Count)"
if ($fixed.Count) { Write-Output ($fixed -join ", ") }
Write-Output "FAILED: $($failed.Count)"
if ($failed.Count) { Write-Output ($failed -join "`n") }
