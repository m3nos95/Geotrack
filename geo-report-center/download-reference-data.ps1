# DelDOT GeoTrak — download statewide reference GeoJSON (run once on your PC)
# Usage: right-click → Run with PowerShell, or:  .\download-reference-data.ps1
# Saves geology_*.json and recharge_*.json into .\refs\

$ErrorActionPreference = "Stop"
$refs = Join-Path $PSScriptRoot "refs"
New-Item -ItemType Directory -Force -Path $refs | Out-Null

function Get-PagedGeoJson {
    param(
        [string]$BaseUrl,
        [string]$Prefix,
        [int]$PageSize = 2000
    )
    $offset = 0
    $page = 0
    while ($true) {
        $url = "${BaseUrl}&resultOffset=$offset"
        Write-Host "  $Prefix page $page (offset $offset)..."
        $resp = Invoke-RestMethod -Uri $url -Method Get
        $count = @($resp.features).Count
        if ($count -eq 0) {
            Write-Host "  Done — empty page at offset $offset (nothing saved)."
            break
        }
        $out = Join-Path $refs "${Prefix}_${offset}.json"
        $resp | ConvertTo-Json -Depth 20 -Compress:$false | Set-Content -Path $out -Encoding UTF8
        $mb = [math]::Round((Get-Item $out).Length / 1MB, 1)
        Write-Host "  Saved $out ($count features, ${mb} MB)"
        if ($count -lt $PageSize) { break }
        $offset += $PageSize
        $page++
    }
}

Write-Host "`n=== Surficial geology ==="
Get-PagedGeoJson -BaseUrl "https://enterprise.firstmap.delaware.gov/arcgis/rest/services/Geology/DGS_Geology/FeatureServer/0/query?where=1%3D1&outFields=*&f=geojson" -Prefix "geology"

Write-Host "`n=== Groundwater recharge potential (Kent & Sussex) ==="
Get-PagedGeoJson -BaseUrl "https://enterprise.firstmap.delaware.gov/arcgis/rest/services/Geology/DGS_GroundwaterRechargePotential/FeatureServer/0/query?where=1%3D1&outFields=*&f=geojson" -Prefix "recharge"

Write-Host "`nFinished. Drop all files from refs\ into DelDOT GeoTrak → Reference data tab."
Write-Host "Or leave them in refs\ and use Open project folder on this same folder.`n"
