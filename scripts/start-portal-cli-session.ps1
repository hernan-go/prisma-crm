param(
  [Parameter(Mandatory)][string]$SshDestination,
  [Parameter(Mandatory)][int]$SshPort,
  [Parameter(Mandatory)][string]$IdentityPublicFile,
  [Parameter(Mandatory)][string]$RemoteDirectory,
  [Parameter(Mandatory)][string]$ExpectedMysqlUuid,
  [string]$RecoveryFile
)

$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -ne 7) { throw 'PowerShell 7 required.' }
$PSNativeCommandArgumentPassing = 'Windows'
if ($SshDestination -notmatch '^[a-zA-Z0-9_.-]+@[a-zA-Z0-9.-]+$' -or
    $SshPort -lt 1 -or $SshPort -gt 65535 -or
    $RemoteDirectory -notmatch '^~/[a-zA-Z0-9_./-]+$' -or
    $ExpectedMysqlUuid -notmatch '^[a-f0-9-]{36}$') { throw 'Invalid explicit target.' }

# Persist only recovery metadata, encrypted for this Windows user. No session,
# Google subject, member ID, password, preparation key or environment is stored.
Add-Type -AssemblyName System.Security.Cryptography.ProtectedData
$operationId = [guid]::NewGuid().ToString()
$command = 'prepare'
$privateDir = Join-Path $env:LOCALAPPDATA 'PRISMA\PortalRecovery'
New-Item -ItemType Directory -Path $privateDir -Force | Out-Null
$receiptPath = Join-Path $privateDir (([guid]::NewGuid().ToString()) + '.dpapi')
$metadata = @{ operationId=$operationId; expectedRevision='0'; mysqlUuid=$ExpectedMysqlUuid;
  sshDestination=$SshDestination; sshPort=$SshPort; remoteDirectory=$RemoteDirectory } | ConvertTo-Json -Compress
$cipher = [Security.Cryptography.ProtectedData]::Protect(
  [Text.Encoding]::UTF8.GetBytes($metadata), $null,
  [Security.Cryptography.DataProtectionScope]::CurrentUser)
if ($RecoveryFile) {
  $old = [Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect(
    [IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $RecoveryFile).Path), $null,
    [Security.Cryptography.DataProtectionScope]::CurrentUser)) | ConvertFrom-Json
  if ($old.sshDestination -cne $SshDestination -or $old.sshPort -ne $SshPort -or
      $old.remoteDirectory -cne $RemoteDirectory -or $old.mysqlUuid -cne $ExpectedMysqlUuid -or
      $old.expectedRevision -cne '0') { throw 'Recovery destination mismatch.' }
  $operationId = $old.operationId
  $receiptPath = (Resolve-Path -LiteralPath $RecoveryFile).Path
  $command = 'seal-receipt'
} else {
  $file = [IO.File]::Open($receiptPath, [IO.FileMode]::CreateNew,
    [IO.FileAccess]::Write, [IO.FileShare]::None)
  try {
    $file.Write($cipher, 0, $cipher.Length)
    $file.Flush($true)
  } finally {
    $file.Dispose()
  }
}
Write-Host "Private encrypted recovery metadata: $receiptPath"

# Transpile the supervisor only; no application build or remote file writes.
$supervisorPath = Join-Path $PSScriptRoot 'portal-cli-session.ts'
$previousOutputEncoding = [Console]::OutputEncoding
try {
  # Node writes UTF-8 even when the visible Windows console uses OEM code page 850.
  [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
  $source = & node --input-type=module -e 'import ts from "typescript";import fs from "node:fs";console.log(ts.transpileModule(fs.readFileSync(process.argv[1],"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText)' $supervisorPath
  if ($LASTEXITCODE -ne 0) { throw 'Supervisor preparation failed.' }
} finally {
  [Console]::OutputEncoding = $previousOutputEncoding
}
$source64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($source -join "`n")))
$bootstrap = @"
let privateSession, safeDiagnostic;
const report = (error,stage) => console.error(JSON.stringify(safeDiagnostic
  ? safeDiagnostic(error,stage)
  : {stage,category:'launcher',
     class:['Error','TypeError','SyntaxError'].includes(error?.name) ? error.name : 'UnknownError',
     code:['MODULE_NOT_FOUND','ERR_MODULE_NOT_FOUND','ERR_UNSUPPORTED_RESOLVE_REQUEST']
       .includes(error?.code) ? error.code : undefined}));
process.on('uncaughtException',error => { report(error,'unhandled');process.exit(2); });
process.on('unhandledRejection',error => { report(error,'unhandled');process.exit(2); });
try {
  const require = (await import('node:module')).createRequire(process.cwd()+'/package.json');
  const dotenv = require('dotenv');
  dotenv.config({path:'../../.env-local',quiet:true});
  process.env.PORTAL_RECOVERY_OPERATION_ID='$operationId';
  ({privateSession,safeDiagnostic}=await import('data:text/javascript;base64,$source64'));
  await privateSession([process.env.DB_HOST,process.env.DB_PORT,process.env.DB_NAME,'$ExpectedMysqlUuid'],'$command');
} catch(error) { report(error,'launcher');process.exitCode=2; }
"@
$bootstrap64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($bootstrap))
$remote = "cd $RemoteDirectory && node --input-type=module -e `"await import('data:text/javascript;base64,$bootstrap64')`""
& ssh -tt -p $SshPort -o StrictHostKeyChecking=yes -o UpdateHostKeys=no -o BatchMode=yes -o IdentitiesOnly=yes -i $IdentityPublicFile $SshDestination $remote
$sshExit = $LASTEXITCODE
Write-Host "SSH_EXIT_CODE=$sshExit"
Write-Host 'Do not retry mutations. Keep the recovery metadata until the result is verified.'
exit $sshExit
