# Download Phase 1 reference GeoJSON for Geo Report Center
# Run from Ultimate Geo Program folder:
#   powershell -ExecutionPolicy Bypass -File .\download-all-refs.ps1
#
# Keeps your existing geology_*.json / recharge_*.json — adds Piedmont, Offshore, quads, counties.
# Optional: also re-download soils / WRPA (Phase 2) with -IncludePhase2

param(
  [switch]$IncludePhase2,
  [switch]$RefreshSurficialAndRecharge
)

$ErrorActionPreference = "Stop"
$refs = Join-Path $PSScriptRoot "refs"
New-Item -ItemType Directory -Force -Path $refs | Out-Null

$base = "https://enterprise.firstmap.delaware.gov/arcgis/rest/services"

function Get-PagedGeoJson {
  param(
    [string]$QueryBaseUrl,  # already includes layer .../query?where=1=1&outFields=*&f=geojson
    [string]$Prefix,
    [int]$PageSize = 2000
  )
  $offset = 0
  while ($true) {
    $url = "${QueryBaseUrl}&resultOffset=$offset"
    Write-Host "  $Prefix offset $offset ..."
    $resp = Invoke-RestMethod -Uri $url -Method Get
    $count = @($resp.features).Count
    if ($count -eq 0) {
      Write-Host "  Done ($Prefix) — empty page at $offset"
      break
    }
    $out = Join-Path $refs ("{0}_{1}.json" -f $Prefix, $offset)
    ($resp | ConvertTo-Json -Depth 100 -Compress:$false) | Set-Content -Path $out -Encoding UTF8
    $mb = [math]::Round((Get-Item $out).Length / 1MB, 2)
    Write-Host "  Saved $out ($count features, $mb MB)"
    if ($count -lt $PageSize) { break }
    $offset += $PageSize
  }
}

function LayerQueryUrl([string]$servicePath, [int]$layerId) {
  return "$base/$servicePath/FeatureServer/$layerId/query?where=1%3D1&outFields=*&f=geojson"
}

Write-Host "`n=== PHASE 1: Geology (Piedmont + Offshore) ==="
Get-PagedGeoJson -QueryBaseUrl (LayerQueryUrl "Geology/DGS_Geology" 2) -Prefix "geology_piedmont"
Get-PagedGeoJson -QueryBaseUrl (LayerQueryUrl "Geology/DGS_Geology" 1) -Prefix "geology_offshore"

if ($RefreshSurficialAndRecharge) {
  Write-Host "`n=== Refresh Surficial + Recharge (optional) ==="
  Get-PagedGeoJson -QueryBaseUrl (LayerQueryUrl "Geology/DGS_Geology" 0) -Prefix "geology_surficial"
  Get-PagedGeoJson -QueryBaseUrl (LayerQueryUrl "Geology/DGS_GroundwaterRechargePotential" 0) -Prefix "recharge_ks"
} else {
  Write-Host "`nSkipping surficial/recharge refresh (you already have those)."
  Write-Host "Pass -RefreshSurficialAndRecharge to re-download."
}

Write-Host "`n=== PHASE 1: Quads + Counties ==="
Get-PagedGeoJson -QueryBaseUrl (LayerQueryUrl "Boundaries/DE_Index" 3) -Prefix "quads_usgs"
Get-PagedGeoJson -QueryBaseUrl (LayerQueryUrl "Boundaries/DE_Boundaries" 4) -Prefix "boundaries_counties"
Get-PagedGeoJson -QueryBaseUrl (LayerQueryUrl "Boundaries/DE_Boundaries" 3) -Prefix "boundaries_muni"

if ($IncludePhase2) {
  Write-Host "`n=== PHASE 2: Soils + NCC WRPA (selected) ==="
  Get-PagedGeoJson -QueryBaseUrl (LayerQueryUrl "Geology/DE_Soils" 0) -Prefix "soils_kent"
  Get-PagedGeoJson -QueryBaseUrl (LayerQueryUrl "Geology/DE_Soils" 1) -Prefix "soils_ncc"
  Get-PagedGeoJson -QueryBaseUrl (LayerQueryUrl "Geology/DE_Soils" 2) -Prefix "soils_sussex"
  Get-PagedGeoJson -QueryBaseUrl (LayerQueryUrl "Hydrology/DE_NCCO_WRPA" 7) -Prefix "wrpa_recharge"
  Get-PagedGeoJson -QueryBaseUrl (LayerQueryUrl "Hydrology/DE_NCCO_WRPA" 8) -Prefix "wrpa_cockeysville"
  Get-PagedGeoJson -QueryBaseUrl (LayerQueryUrl "Hydrology/DE_NCCO_WRPA" 4) -Prefix "wrpa_wellhead_300"
}

Write-Host "`nAll requested downloads finished."
Write-Host "Next: Open Geo_Report_Center.html → Open project folder → Reference data → drop new files from refs\"
Write-Host "Then Map → click Hockessin — expect Piedmont geology (e.g. Cockeysville Marble).`n"
