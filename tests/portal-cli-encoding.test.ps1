# Local regression only: no launcher invocation, SSH, environment loading or DB.
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -ne 7) { throw 'PowerShell 7 required.' }
$repository = Split-Path $PSScriptRoot -Parent
$previousLocation = Get-Location
$originalEncoding = [Console]::OutputEncoding
try {
  Set-Location -LiteralPath $repository
  $launcher = Get-Content -LiteralPath scripts/start-portal-cli-session.ps1 -Raw
  $start = $launcher.IndexOf('$previousOutputEncoding =')
  $end = $launcher.IndexOf('$source64 =', $start)
  if ($start -lt 0 -or $end -le $start) { throw 'Capture block missing.' }
  $capture = [scriptblock]::Create($launcher.Substring($start, $end - $start))
  $supervisorPath = Join-Path $repository 'scripts/portal-cli-session.ts'
  foreach ($codePage in @(850, 65001)) {
    [Console]::OutputEncoding = [Text.Encoding]::GetEncoding($codePage)
    . $capture
    $text = $source -join [Environment]::NewLine
    if (-not $text.Contains('Clave privada de preparación (hex) (sin eco) > ') -or
        -not $text.Contains('UUID operación seal > ') -or
        [Console]::OutputEncoding.CodePage -ne $codePage) {
      throw 'UTF-8 capture or console restoration failed.'
    }
    Write-Output "ENCODING_REGRESSION=$codePage PASS"
  }
} finally {
  [Console]::OutputEncoding = $originalEncoding
  Set-Location -LiteralPath $previousLocation
}
