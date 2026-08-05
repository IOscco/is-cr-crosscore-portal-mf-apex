# Copia referencias livianas desde «Portal Sistemas - Guía de Estilo - Componentes» al repo.
$ErrorActionPreference = 'Stop'
function Find-GuideComponentsDir {
  $roots = @(
    [System.Environment]::GetFolderPath('MyDocuments'),
    "$env:USERPROFILE\Documents"
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique
  foreach ($r in $roots) {
    $hit = Get-ChildItem -LiteralPath $r -Directory -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -like 'Portal Sistemas - Gui* - Componentes' } |
      Select-Object -First 1
    if ($hit) {
      return $hit.FullName
    }
    $hit = Get-ChildItem -LiteralPath $r -Depth 3 -Directory -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -like 'Portal Sistemas - Gui* - Componentes' } |
      Select-Object -First 1
    if ($hit) {
      return $hit.FullName
    }
  }
  return $null
}
$base = Find-GuideComponentsDir
if (-not $base) {
  Write-Warning 'No se encontró «Portal Sistemas - Guía de Estilo - Componentes» bajo Documentos. Copia manual a src/assets/brand/style-guide-source/components/'
  exit 1
}
$dest = Join-Path $PSScriptRoot '..\src\assets\brand\style-guide-source\components'
New-Item -ItemType Directory -Force -Path $dest | Out-Null
foreach ($f in @('ps-button.svg', 'ps-input.svg', 'UIKit Portal Sistemas.svg')) {
  $src = Join-Path $base $f
  if (Test-Path -LiteralPath $src) {
    $outName = $f -replace '\s', '-'
    Copy-Item -LiteralPath $src -Destination (Join-Path $dest $outName) -Force
    Write-Host "OK $f -> $outName"
  }
  else {
    Write-Warning "No encontrado: $src"
  }
}
