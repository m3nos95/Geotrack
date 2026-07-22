# Download Delaware FirstMap / DNREC reference GeoJSON for Geo Report Center
# Run from Ultimate Geo Program folder:
#   powershell -ExecutionPolicy Bypass -File .\download-all-refs.ps1
#   powershell -ExecutionPolicy Bypass -File .\download-all-refs.ps1 -All
#   powershell -ExecutionPolicy Bypass -File .\download-all-refs.ps1 -Core
#
# Prefer the Python script if available (faster/safer for huge layers):
#   python download-all-refs.py
#   python download-all-refs.py --all

param(
  [switch]$All,
  [switch]$Core,
  [switch]$IncludeWells,
  [switch]$IncludeLULC,
  [switch]$IncludeDEN,
  [switch]$List
)

$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$py = Get-Command python -ErrorAction SilentlyContinue
if (-not $py) { $py = Get-Command py -ErrorAction SilentlyContinue }

if ($py) {
  $args = @("$here\download-all-refs.py", "--project", $here)
  if ($List) { $args += "--list" }
  elseif ($Core) { $args += "--core" }
  else {
    if ($All) { $args += "--all" }
    if ($IncludeWells) { $args += "--include-wells" }
    if ($IncludeLULC) { $args += "--include-lulc" }
    if ($IncludeDEN) { $args += "--include-den" }
  }
  Write-Host "Using Python downloader…"
  & $py.Source @args
  exit $LASTEXITCODE
}

Write-Host "Python not found — using PowerShell fallback (slower for large layers)."

$refs = Join-Path $here "refs"
New-Item -ItemType Directory -Force -Path $refs | Out-Null
$base = "https://enterprise.firstmap.delaware.gov/arcgis/rest/services"
$Page = 2000

function Get-PagedGeoJson {
  param([string]$ServicePath, [int]$LayerId, [string]$Prefix, [string]$Server = "FeatureServer")
  $offset = 0
  while ($true) {
    $url = "$base/$ServicePath/$Server/$LayerId/query?where=1%3D1&outFields=*&f=geojson&resultOffset=$offset&resultRecordCount=$Page"
    Write-Host "  $Prefix offset $offset ..."
    $out = Join-Path $refs ("{0}_{1}.json" -f $Prefix, $offset)
    try {
      Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing -TimeoutSec 180
    } catch {
      Write-Host "  ERROR $Prefix : $_"
      break
    }
    $raw = Get-Content -Raw -Path $out
    $resp = $raw | ConvertFrom-Json
    $count = @($resp.features).Count
    if ($count -eq 0) {
      Remove-Item $out -ErrorAction SilentlyContinue
      Write-Host "  Done ($Prefix) — empty page at $offset"
      break
    }
    $mb = [math]::Round((Get-Item $out).Length / 1MB, 2)
    Write-Host "  Saved $out ($count features, $mb MB)"
    if ($count -lt $Page) { break }
    $offset += $Page
  }
}

if ($List) {
  Write-Host "Install Python and run: python download-all-refs.py --list"
  exit 0
}

$jobs = @(
  @{p='geology_surficial'; s='Geology/DGS_Geology'; i=0},
  @{p='geology_offshore'; s='Geology/DGS_Geology'; i=1},
  @{p='geology_piedmont'; s='Geology/DGS_Geology'; i=2},
  @{p='recharge_ks'; s='Geology/DGS_GroundwaterRechargePotential'; i=0},
  @{p='quads_usgs'; s='Boundaries/DE_Index'; i=3},
  @{p='boundaries_counties'; s='Boundaries/DE_Boundaries'; i=4},
  @{p='boundaries_muni'; s='Boundaries/DE_Boundaries'; i=3}
)

if (-not $Core) {
  $jobs += @(
    @{p='soils_kent'; s='Geology/DE_Soils'; i=0},
    @{p='soils_ncc'; s='Geology/DE_Soils'; i=1},
    @{p='soils_sussex'; s='Geology/DE_Soils'; i=2},
    @{p='wrpa_hoops'; s='Hydrology/DE_NCCO_WRPA'; i=0},
    @{p='wrpa_erosion'; s='Hydrology/DE_NCCO_WRPA'; i=1},
    @{p='wrpa_floodplains'; s='Hydrology/DE_NCCO_WRPA'; i=2},
    @{p='wrpa_newark_res'; s='Hydrology/DE_NCCO_WRPA'; i=3},
    @{p='wrpa_wellhead_300'; s='Hydrology/DE_NCCO_WRPA'; i=4},
    @{p='wrpa_class_b'; s='Hydrology/DE_NCCO_WRPA'; i=5},
    @{p='wrpa_class_c'; s='Hydrology/DE_NCCO_WRPA'; i=6},
    @{p='wrpa_recharge'; s='Hydrology/DE_NCCO_WRPA'; i=7},
    @{p='wrpa_cockeysville'; s='Hydrology/DE_NCCO_WRPA'; i=8},
    @{p='wrpa_wellhead_150'; s='Hydrology/DE_NCCO_WRPA'; i=9},
    @{p='watersheds_huc12'; s='Hydrology/DE_Watersheds'; i=5},
    @{p='wetlands_2017'; s='Hydrology/DE_Wetlands'; i=6},
    @{p='taxditch_segments'; s='Hydrology/DE_TaxDitch'; i=0},
    @{p='taxditch_areas'; s='Hydrology/DE_TaxDitch'; i=2},
    @{p='hydro_rivers'; s='Hydrology/DE_Water'; i=0},
    @{p='hydro_lakes'; s='Hydrology/DE_Water'; i=2},
    @{p='flood_fema'; s='Hydrology/DE_DFIRM'; i=7; srv='MapServer'},
    @{p='tidal_buffer'; s='Hydrology/DE_Saltwater_Tidal_Buffer'; i=0},
    @{p='dnrec_septic_site_evals'; s='PlanningCadastre/DE_DNREC_Planning_and_Engineering'; i=0},
    @{p='dnrec_septic_soil_borings'; s='PlanningCadastre/DE_DNREC_Planning_and_Engineering'; i=1},
    @{p='dnrec_wellhead_protection'; s='PlanningCadastre/DE_DNREC_Planning_and_Engineering'; i=2},
    @{p='dnrec_soil_feasibility'; s='PlanningCadastre/DE_DNREC_Planning_and_Engineering'; i=3},
    @{p='dnrec_gmz'; s='PlanningCadastre/DE_DNREC_Planning_and_Engineering'; i=4},
    @{p='dnrec_sussex_landfills'; s='PlanningCadastre/DE_DNREC_Planning_and_Engineering'; i=5},
    @{p='dnrec_septic_permits'; s='Environmental/DE_DNREC_Permits'; i=2},
    @{p='dnrec_biosolids'; s='Environmental/DE_DNREC_Permits'; i=3},
    @{p='dnrec_large_systems'; s='Environmental/DE_DNREC_Permits'; i=4},
    @{p='dnrec_ust'; s='Environmental/DE_DNREC_Permits'; i=0},
    @{p='dnrec_lust'; s='Environmental/DE_DNREC_Permits'; i=1},
    @{p='dnrec_industrial_stormwater'; s='Environmental/DE_DNREC_Facilities'; i=5},
    @{p='dnrec_landfills'; s='Environmental/DE_DNREC_Facilities'; i=6},
    @{p='dnrec_rcra'; s='Environmental/DE_DNREC_Facilities'; i=3},
    @{p='dnrec_rs_sites'; s='Environmental/DE_DNREC_Facilities'; i=4},
    @{p='dda_gw_monitoring'; s='Society/DE_Agriculture'; i=4},
    @{p='ag_irrigated_areas'; s='Society/DE_Agriculture'; i=2},
    @{p='coastal_zone'; s='Environmental/DE_Coastal_Zone'; i=1},
    @{p='coastal_inundation_1ft'; s='Environmental/DE_Coastal_Inundation_2017'; i=1},
    @{p='coastal_inundation_3ft'; s='Environmental/DE_Coastal_Inundation_2017'; i=3},
    @{p='coastal_inundation_7ft'; s='Environmental/DE_Coastal_Inundation_2017'; i=7},
    @{p='roads_centerline'; s='Transportation/DE_Roadways_Main'; i=1},
    @{p='roads_bridges'; s='Transportation/DE_Roadways_Main'; i=0},
    @{p='assets_lightposts'; s='Transportation/DE_Assets'; i=4},
    @{p='assets_overhead_signs'; s='Transportation/DE_Assets'; i=7}
  )
}

if ($All -or $IncludeWells) { $jobs += @{p='dnrec_nonpublic_wells'; s='Environmental/DE_DNREC_Monitoring_Network'; i=0} }
if ($All -or $IncludeLULC) { $jobs += @{p='lulc_2022'; s='PlanningCadastre/DE_LULC'; i=4} }
if ($All -or $IncludeDEN) { $jobs += @{p='dnrec_den_locations'; s='Environmental/DE_DNREC_Facilities'; i=0} }

Write-Host "`nDownloading $($jobs.Count) layers into $refs`n"
foreach ($j in $jobs) {
  $srv = if ($j.srv) { $j.srv } else { "FeatureServer" }
  Write-Host "=== $($j.p) ==="
  Get-PagedGeoJson -ServicePath $j.s -LayerId $j.i -Prefix $j.p -Server $srv
}

Write-Host "`nDone. Open Geo Report Center → Open project folder (refs auto-load)."
Write-Host "Rasters (DTW/WTE/unconfined aquifer) sample online — no download needed.`n"
