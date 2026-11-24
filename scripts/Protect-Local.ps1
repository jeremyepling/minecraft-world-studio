# Keep bridge credentials, backups, and world data private on this shared Windows workspace.
$ErrorActionPreference = 'Stop'
$path = Join-Path (Split-Path $PSScriptRoot) 'local'
New-Item -ItemType Directory -Force -Path $path | Out-Null
$item = Get-Item -LiteralPath $path -Force
if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'The private runtime must be a project-local directory.' }
$current = [Security.Principal.WindowsIdentity]::GetCurrent().User
$ids = @($current, [Security.Principal.SecurityIdentifier]'S-1-5-18', [Security.Principal.SecurityIdentifier]'S-1-5-32-544')
$acl = Get-Acl -LiteralPath $path
$aclBackup = Join-Path $path 'original-access.sddl'
if (!(Test-Path -LiteralPath $aclBackup)) {
    [IO.File]::WriteAllText($aclBackup,$acl.GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::Access))
}
# On a repeat run, avoid traversing the dependency cache to reapply identical inheritance.
$rules = @($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
$expected = @($ids | ForEach-Object { $_.Value } | Sort-Object -Unique)
$matching = @($rules | Where-Object {
    $_.IdentityReference.Value -in $expected -and $_.AccessControlType -eq 'Allow' -and
    $_.FileSystemRights -eq 'FullControl' -and $_.InheritanceFlags -eq 'ContainerInherit, ObjectInherit'
})
if ($acl.AreAccessRulesProtected -and $matching.Count -eq $rules.Count -and
    !(Compare-Object $expected @($matching.IdentityReference.Value | Sort-Object -Unique))) { return }
$acl.SetAccessRuleProtection($true,$false)
foreach ($existing in $acl.GetAccessRules($true,$false,[Security.Principal.SecurityIdentifier])) {
    $acl.RemoveAccessRuleSpecific($existing)
}
foreach ($id in $ids) {
    $rule = [Security.AccessControl.FileSystemAccessRule]::new($id, 'FullControl',
        'ContainerInherit, ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
}
Set-Acl -LiteralPath $path -AclObject $acl
