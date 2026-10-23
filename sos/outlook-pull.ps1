# Pull SOS .xls / .xlsx / .pdf attachments from the signed-in Outlook profile.
# Does not use a password. Outlook desktop must be installed and logged in.
param(
  [string]$Staging = "",
  [string]$Config = "",
  [string]$FolderPath = "Inbox",
  [string]$Mailbox = "",
  [int]$DaysBack = 7,
  [switch]$UnreadOnly,
  [switch]$IncludeRead
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir

if (-not $Config) {
  $guess = Join-Path $scriptDir "SOS-watch.json"
  if (Test-Path $guess) { $Config = $guess }
}

$cfg = $null
if ($Config -and (Test-Path $Config)) {
  $cfg = Get-Content -Raw -Path $Config | ConvertFrom-Json
}

if (-not $Staging) {
  if ($cfg -and $cfg.stagingDir) { $Staging = [string]$cfg.stagingDir }
  else { $Staging = Join-Path $repoRoot "sos\inbox-staging" }
}
if ($cfg -and -not $PSBoundParameters.ContainsKey("FolderPath") -and $cfg.outlookFolder) {
  $FolderPath = [string]$cfg.outlookFolder
}
if ($cfg -and -not $PSBoundParameters.ContainsKey("Mailbox") -and $cfg.mailbox) {
  $Mailbox = [string]$cfg.mailbox
}
if ($cfg -and -not $PSBoundParameters.ContainsKey("DaysBack") -and $cfg.daysBack) {
  $DaysBack = [int]$cfg.daysBack
}
$wantUnread = $true
if ($IncludeRead) { $wantUnread = $false }
elseif ($UnreadOnly) { $wantUnread = $true }
elseif ($cfg -and $null -ne $cfg.unreadOnly) { $wantUnread = [bool]$cfg.unreadOnly }

New-Item -ItemType Directory -Force -Path $Staging | Out-Null

function Get-Inbox {
  param($namespace, [string]$mailbox, [string]$folderPath)
  $inbox = $null
  if ($mailbox) {
    $recip = $namespace.CreateRecipient($mailbox)
    $null = $recip.Resolve()
    if (-not $recip.Resolved) { throw "Could not open mailbox $mailbox in this Outlook profile." }
    $inbox = $namespace.GetSharedDefaultFolder($recip, 6)
  } else {
    $inbox = $namespace.GetDefaultFolder(6)
  }
  if (-not $folderPath -or $folderPath -eq "Inbox") { return $inbox }
  $cur = $inbox
  foreach ($part in ($folderPath -split '[\\/]') | Where-Object { $_ -and $_ -ne "Inbox" }) {
    $next = $null
    foreach ($f in $cur.Folders) {
      if ($f.Name -eq $part) { $next = $f; break }
    }
    if (-not $next) { throw "Outlook folder not found: $folderPath (missing $part)" }
    $cur = $next
  }
  return $cur
}

try {
  $outlook = [Runtime.InteropServices.Marshal]::GetActiveObject("Outlook.Application")
} catch {
  $outlook = New-Object -ComObject Outlook.Application
}
$ns = $outlook.GetNamespace("MAPI")
$folder = Get-Inbox -namespace $ns -mailbox $Mailbox -folderPath $FolderPath
$cutoff = (Get-Date).AddDays(-1 * [Math]::Max(1, $DaysBack))
$items = $folder.Items
$items.Sort("[ReceivedTime]", $true)

$saved = 0
$count = $items.Count
for ($i = 1; $i -le $count; $i++) {
  $mail = $null
  try { $mail = $items.Item($i) } catch { continue }
  if ($null -eq $mail) { continue }
  if ($mail.Class -ne 43) { continue }
  $received = $mail.ReceivedTime
  if ($received -lt $cutoff) { continue }
  if ($wantUnread -and -not $mail.UnRead) { continue }
  $cats = [string]$mail.Categories
  if ($cats -match "DelDOT SOS") { continue }
  if ($mail.Attachments.Count -lt 1) { continue }

  $keep = @()
  foreach ($att in $mail.Attachments) {
    $name = [string]$att.FileName
    if ($name -match '\.(xls|xlsx|pdf)$') { $keep += $att }
  }
  if ($keep.Count -eq 0) { continue }

  $stamp = Get-Date $received -Format "yyyyMMdd-HHmmss"
  $safeSub = ($mail.Subject -replace '[^\w.\-]+', '_').Trim('_')
  if (-not $safeSub) { $safeSub = "message" }
  $dir = Join-Path $Staging ($stamp + "_" + $safeSub.Substring(0, [Math]::Min(40, $safeSub.Length)))
  $n = 2
  while (Test-Path $dir) { $dir = $dir + "_" + $n; $n++ }
  New-Item -ItemType Directory -Force -Path $dir | Out-Null

  $meta = @{
    subject = [string]$mail.Subject
    from = [string]$mail.SenderName
    senderEmail = [string]$mail.SenderEmailAddress
    received = $received.ToString("o")
    entryId = [string]$mail.EntryID
  }
  $meta | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $dir "meta.json")

  foreach ($att in $keep) {
    $dest = Join-Path $dir $att.FileName
    $att.SaveAsFile($dest)
  }

  try {
    if ($cats) { $mail.Categories = $cats + "; DelDOT SOS" }
    else { $mail.Categories = "DelDOT SOS" }
    $mail.Save()
  } catch {}
  $saved++
  Write-Host "Saved $($keep.Count) attachment(s) from: $($mail.Subject)"
}

Write-Host "Outlook pull: $saved message(s) -> $Staging"
if ($saved -eq 0) {
  Write-Host "No new SOS attachments. Outlook must be signed in. Unread-only=$wantUnread folder=$FolderPath"
}
