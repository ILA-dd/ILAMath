$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$htmlFiles = Get-ChildItem -Path $root -Recurse -Filter *.html
$issues = @()

foreach($file in $htmlFiles)
{
    $content = Get-Content -Path $file.FullName -Raw -Encoding utf8
    $matches = [regex]::Matches($content, '(?:href|src)="([^"]+)"')

    foreach($match in $matches)
    {
        $url = $match.Groups[1].Value

        if($url -match '^(https?:|mailto:|#|javascript:|data:)')
        {
            continue
        }

        $pathOnly = $url.Split('#')[0].Split('?')[0]
        if([string]::IsNullOrWhiteSpace($pathOnly))
        {
            continue
        }

        if($pathOnly.StartsWith('/'))
        {
            $rootRelativePath = $pathOnly.TrimStart('/').Replace('/', '\')
            $target = Join-Path $root $rootRelativePath
        }
        else
        {
            $target = [System.IO.Path]::GetFullPath((Join-Path (Split-Path $file.FullName -Parent) $pathOnly))
        }
        if(-not (Test-Path $target))
        {
            $issues += [PSCustomObject]@{
                File = $file.FullName.Replace($root + '\', '')
                Link = $url
                Missing = $target.Replace($root + '\', '')
            }
        }
    }
}

if($issues.Count -eq 0)
{
    Write-Output "OK: broken local links not found."
    exit 0
}

$issues | Sort-Object File, Link | Format-Table -AutoSize
exit 1
