param(
    [int]$Port = 8080,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AllowedHosts = @("wol.jw.org", "www.jw.org", "b.jw-cdn.org", "cfp2.jw-cdn.org", "cms-imgp.jw-cdn.org")

$MimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".htm"  = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".svg"  = "image/svg+xml"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".webp" = "image/webp"
    ".ico"  = "image/x-icon"
    ".vtt"  = "text/vtt; charset=utf-8"
}

$handler = New-Object System.Net.Http.HttpClientHandler
$handler.AllowAutoRedirect = $true
$handler.AutomaticDecompression = [System.Net.DecompressionMethods]::GZip -bor [System.Net.DecompressionMethods]::Deflate
$httpClient = New-Object System.Net.Http.HttpClient($handler)
$httpClient.Timeout = [TimeSpan]::FromSeconds(25)
$httpClient.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) DFWolStudio/3.0")

$listener = New-Object System.Net.HttpListener
$prefix = "http://localhost:$Port/"
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
} catch {
    Write-Host "[DFWol] Port $Port occupe ou refuse, tentative sur 8181..." -ForegroundColor Yellow
    $Port = 8181
    $listener = New-Object System.Net.HttpListener
    $prefix = "http://localhost:$Port/"
    $listener.Prefixes.Add($prefix)
    $listener.Start()
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  DFWol Studio Server actif sur : $prefix" -ForegroundColor Green
Write-Host "  Proxy WOL/JW integre          : ${prefix}api/proxy?url=..." -ForegroundColor Green
Write-Host "  Appuyez sur Ctrl+C pour arreter le serveur." -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan

if (-not $NoBrowser) {
    Start-Process $prefix
}

function Send-BytesResponse {
    param(
        [System.Net.HttpListenerResponse]$Response,
        [int]$StatusCode,
        [byte[]]$Bytes,
        [string]$ContentType,
        [string]$FinalUrl = ""
    )
    $Response.StatusCode = $StatusCode
    $Response.ContentType = $ContentType
    $Response.Headers["Access-Control-Allow-Origin"] = "*"
    $Response.Headers["Access-Control-Expose-Headers"] = "X-Final-Url"
    if ($FinalUrl) {
        $Response.Headers["X-Final-Url"] = $FinalUrl
    }
    $Response.ContentLength64 = $Bytes.Length
    $Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
    $Response.OutputStream.Close()
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $req = $context.Request
        $res = $context.Response

        try {
            if ($req.HttpMethod -eq "OPTIONS") {
                $res.StatusCode = 204
                $res.Headers["Access-Control-Allow-Origin"] = "*"
                $res.Headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
                $res.Headers["Access-Control-Allow-Headers"] = "*"
                $res.OutputStream.Close()
                continue
            }

            $rawPath = $req.Url.AbsolutePath

            # 1. Endpoint Proxy Securise (/api/proxy?url=...)
            if ($rawPath -eq "/api/proxy") {
                $targetUrl = $null
                $qStr = $req.Url.Query.TrimStart('?')
                foreach ($pair in ($qStr -split '&')) {
                    if ($pair -match '^url=(.*)$') {
                        $targetUrl = [System.Uri]::UnescapeDataString($Matches[1].Replace('+', ' '))
                        break
                    }
                }
                if ([string]::IsNullOrWhiteSpace($targetUrl)) {
                    $errBytes = [System.Text.Encoding]::UTF8.GetBytes("Missing url parameter")
                    Send-BytesResponse -Response $res -StatusCode 400 -Bytes $errBytes -ContentType "text/plain; charset=utf-8"
                    continue
                }

                $targetUri = $null
                if (-not [Uri]::TryCreate($targetUrl, [UriKind]::Absolute, [ref]$targetUri)) {
                    $errBytes = [System.Text.Encoding]::UTF8.GetBytes("Invalid URL")
                    Send-BytesResponse -Response $res -StatusCode 400 -Bytes $errBytes -ContentType "text/plain; charset=utf-8"
                    continue
                }

                if (($targetUri.Scheme -ne "https") -or ($AllowedHosts -notcontains $targetUri.Host.ToLowerInvariant())) {
                    $errBytes = [System.Text.Encoding]::UTF8.GetBytes("Forbidden target host: $($targetUri.Host)")
                    Send-BytesResponse -Response $res -StatusCode 403 -Bytes $errBytes -ContentType "text/plain; charset=utf-8"
                    continue
                }

                $upstream = $httpClient.GetAsync($targetUri).GetAwaiter().GetResult()
                $bodyBytes = $upstream.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
                $finalUri = $upstream.RequestMessage.RequestUri.AbsoluteUri
                $ct = "text/html; charset=utf-8"
                if ($upstream.Content.Headers.ContentType) {
                    $ct = $upstream.Content.Headers.ContentType.ToString()
                }
                Send-BytesResponse -Response $res -StatusCode ([int]$upstream.StatusCode) -Bytes $bodyBytes -ContentType $ct -FinalUrl $finalUri
                continue
            }

            # 2. Fichiers Statiques
            $relPath = $rawPath.TrimStart('/')
            if ([string]::IsNullOrWhiteSpace($relPath)) { $relPath = "index.html" }
            $relPath = $relPath -replace '/', [IO.Path]::DirectorySeparatorChar
            $fullPath = [IO.Path]::GetFullPath((Join-Path $RootDir $relPath))

            if (-not $fullPath.StartsWith($RootDir, [System.StringComparison]::OrdinalIgnoreCase)) {
                $errBytes = [System.Text.Encoding]::UTF8.GetBytes("Forbidden")
                Send-BytesResponse -Response $res -StatusCode 403 -Bytes $errBytes -ContentType "text/plain; charset=utf-8"
                continue
            }

            if (Test-Path $fullPath -PathType Leaf) {
                $ext = [IO.Path]::GetExtension($fullPath).ToLowerInvariant()
                $mime = if ($MimeTypes.ContainsKey($ext)) { $MimeTypes[$ext] } else { "application/octet-stream" }
                $fileBytes = [IO.File]::ReadAllBytes($fullPath)
                Send-BytesResponse -Response $res -StatusCode 200 -Bytes $fileBytes -ContentType $mime
            } else {
                $errBytes = [System.Text.Encoding]::UTF8.GetBytes("Not Found: $relPath")
                Send-BytesResponse -Response $res -StatusCode 404 -Bytes $errBytes -ContentType "text/plain; charset=utf-8"
            }
        } catch {
            try {
                $errMsg = $_.Exception.Message
                $errBytes = [System.Text.Encoding]::UTF8.GetBytes("Server Error: $errMsg")
                Send-BytesResponse -Response $res -StatusCode 502 -Bytes $errBytes -ContentType "text/plain; charset=utf-8"
            } catch {}
        }
    }
} finally {
    if ($listener.IsListening) { $listener.Stop() }
    $listener.Close()
    $httpClient.Dispose()
}
