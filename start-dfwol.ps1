param(
    [int]$Port = 8080,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http

$EdgeTtsCode = @'
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Net.Security;
using System.Net.Sockets;
using System.Security;
using System.Text;

public class DFWolEdgeTtsV2 {
    private static long ClockSkewSeconds = 0;
    private static readonly uint[] SHA256_INITIAL = {
        0x6A09E667u, 0xBB67AE85u, 0x3C6EF372u, 0xA54FF53Au,
        0x510E527Fu, 0x9B05688Cu, 0x1F83D9ABu, 0x5BE0CD19u
    };
    private static readonly uint[] SHA256_STATE = {
        0xFD9FBEA2u, 0x91243CE7u, 0xBE499094u, 0xCD2E1E0Au,
        0x6C006F49u, 0x04BD35ABu, 0xFEB0A7E4u, 0x03EFFBD2u
    };
    private static readonly uint[] SHA256_SCHEDULE = {
        0xEB24BF9Eu, 0x1558691Fu, 0xA0C09EE2u, 0x0CFA32BAu,
        0xA622EE8Cu, 0xD1DD9491u, 0xC0DD25A0u, 0xF9E70AB6u,
        0xF0C31573u, 0x7058CE4Eu, 0x7188E606u, 0x00E5AB33u,
        0xD258B060u, 0x72766564u
    };
    private static readonly uint[] K = {
        0x428A2F98u,0x71374491u,0xB5C0FBCFu,0xE9B5DBA5u,0x3956C25Bu,0x59F111F1u,0x923F82A4u,0xAB1C5ED5u,
        0xD807AA98u,0x12835B01u,0x243185BEu,0x550C7DC3u,0x72BE5D74u,0x80DEB1FEu,0x9BDC06A7u,0xC19BF174u,
        0xE49B69C1u,0xEFBE4786u,0x0FC19DC6u,0x240CA1CCu,0x2DE92C6Fu,0x4A7484AAu,0x5CB0A9DCu,0x76F988DAu,
        0x983E5152u,0xA831C66Du,0xB00327C8u,0xBF597FC7u,0xC6E00BF3u,0xD5A79147u,0x06CA6351u,0x14292967u,
        0x27B70A85u,0x2E1B2138u,0x4D2C6DFCu,0x53380D13u,0x650A7354u,0x766A0ABBu,0x81C2C92Eu,0x92722C85u,
        0xA2BFE8A1u,0xA81A664Bu,0xC24B8B70u,0xC76C51A3u,0xD192E819u,0xD6990624u,0xF40E3585u,0x106AA070u,
        0x19A4C116u,0x1E376C08u,0x2748774Cu,0x34B0BCB5u,0x391C0CB3u,0x4ED8AA4Au,0x5B9CCA4Fu,0x682E6FF3u,
        0x748F82EEu,0x78A5636Fu,0x84C87814u,0x8CC70208u,0x90BEFFFAu,0xA4506CEBu,0xBEF9A3F7u,0xC67178F2u
    };
    private static readonly uint[,] CS64_COEFFS = {
        {0xE82E91B1u, 0xB32700D0u}, {0x44DE24C6u, 0x88DFF51Du}, {0x3BEB65BCu, 0x29514038u}, {0xC89C5933u, 0xB328CBDFu},
        {0x8D1EC211u, 0xD405B4D5u}, {0x314EF5D5u, 0x26E55F3Cu}, {0xE92491B1u, 0x607801C6u}, {0xF0A5B9D5u, 0x82B2C1FBu},
        {0x06064CF3u, 0xFA51A3DAu}, {0xDA79FA60u, 0x207CC464u}, {0xBED20560u, 0x3C3C74F3u}, {0x89F9C9F8u, 0xD2D14B61u},
        {0x35FA38C6u, 0xBB04A2C1u}, {0xCB49E3C6u, 0xC5626167u}
    };

    private static uint Rotr(uint x, int n) { return (x >> n) | (x << (32 - n)); }
    private static uint Rol16(uint x) { return (x << 16) | (x >> 16); }
    private static uint Sigma0(uint x) { return Rotr(x, 7) ^ Rotr(x, 18) ^ (x >> 3); }
    private static uint Sigma1(uint x) { return Rotr(x, 17) ^ Rotr(x, 19) ^ (x >> 10); }

    private static uint[] Sha256Rounds(uint[] st, uint[] w, int firstRound) {
        uint a=st[0], b=st[1], c=st[2], d=st[3], e=st[4], f=st[5], g=st[6], h=st[7];
        for (int i = firstRound; i < 64; i++) {
            uint ki = (firstRound == 14 && i == 14) ? 0xC9DC06A7u : K[i];
            uint s1 = Rotr(e, 6) ^ Rotr(e, 11) ^ Rotr(e, 25);
            uint ch = g ^ (e & (f ^ g));
            uint t1 = unchecked(h + s1 + ch + ki + w[i]);
            uint s0 = Rotr(a, 2) ^ Rotr(a, 13) ^ Rotr(a, 22);
            uint maj = (a & b) | (c & (a | b));
            uint t2 = unchecked(s0 + maj);
            h = g; g = f; f = e; e = unchecked(d + t1);
            d = c; c = b; b = a; a = unchecked(t1 + t2);
        }
        return new uint[] { a, b, c, d, e, f, g, h };
    }

    private static byte[] CustomSha256(byte[] data) {
        uint[] w = new uint[64];
        w[14] = ((uint)data[0] << 16) | ((uint)data[1] << 8) | data[2];
        w[15] = ((uint)data[3] << 24) | ((uint)data[4] << 16) | ((uint)data[5] << 8) | data[6];
        for (int i = 16; i < 30; i++) {
            uint val = SHA256_SCHEDULE[i - 16];
            if (i - 2 >= 14) val = unchecked(val + (i == 16 ? (Sigma1(w[i-2]) ^ 0x000B92C0u) : Sigma1(w[i-2])));
            if (i - 7 >= 14) val = unchecked(val + w[i - 7]);
            if (i - 15 >= 14) val = unchecked(val + (i == 29 ? (Sigma0(w[i-15]) ^ 0x059C0B80u) : Sigma0(w[i-15])));
            w[i] = val;
        }
        w[30] = unchecked(Sigma1(w[28]) + w[23] + Sigma0(w[15]) + w[14] + 0xC9DC06A7u - K[14]);
        for (int i = 31; i < 64; i++) w[i] = unchecked(Sigma1(w[i-2]) + w[i-7] + Sigma0(w[i-15]) + w[i-16]);
        uint[] working = Sha256Rounds(SHA256_STATE, w, 14);
        uint[] state = new uint[8];
        for (int i = 0; i < 8; i++) state[i] = unchecked(SHA256_INITIAL[i] + working[i]);

        int rem = data.Length - 7;
        long totalLen = 57L + data.Length;
        int padZeros = (int)(((55 - totalLen) % 64 + 64) % 64);
        byte[] padded = new byte[rem + 1 + padZeros + 8];
        Array.Copy(data, 7, padded, 0, rem);
        padded[rem] = 0x80;
        ulong bits = (ulong)(totalLen * 8);
        for (int i = 0; i < 8; i++) padded[padded.Length - 1 - i] = (byte)((bits >> (i * 8)) & 0xFF);

        for (int off = 0; off < padded.Length; off += 64) {
            uint[] bw = new uint[64];
            for (int i = 0; i < 16; i++) {
                int p = off + i * 4;
                bw[i] = ((uint)padded[p] << 24) | ((uint)padded[p+1] << 16) | ((uint)padded[p+2] << 8) | padded[p+3];
            }
            for (int i = 16; i < 64; i++) bw[i] = unchecked(Sigma1(bw[i-2]) + bw[i-7] + Sigma0(bw[i-15]) + bw[i-16]);
            uint[] wk = Sha256Rounds(state, bw, 0);
            for (int i = 0; i < 8; i++) state[i] = unchecked(state[i] + wk[i]);
        }
        byte[] outBytes = new byte[32];
        for (int i = 0; i < 8; i++) {
            outBytes[i*4] = (byte)(state[i] >> 24); outBytes[i*4+1] = (byte)(state[i] >> 16);
            outBytes[i*4+2] = (byte)(state[i] >> 8); outBytes[i*4+3] = (byte)(state[i]);
        }
        return outBytes;
    }

    private static string GenerateSecMsGecV2() {
        long unixSecs = DateTimeOffset.UtcNow.ToUnixTimeSeconds() + ClockSkewSeconds;
        long ticks = unixSecs + 11644473600L;
        ticks -= ticks % 300L;
        ticks *= 10000000L;
        byte[] data = Encoding.ASCII.GetBytes(ticks.ToString() + "6A5AA1D4EAFF4E9FB37E23D68491D6F4");
        byte[] digest = CustomSha256(data);

        uint keyA = (uint)(digest[0] | (digest[1] << 8) | (digest[2] << 16) | (digest[3] << 24)) | 1u;
        uint keyB = (uint)(digest[4] | (digest[5] << 8) | (digest[6] << 16) | (digest[7] << 24)) | 1u;
        uint fac0 = unchecked(keyA * 0x82893933u);
        uint fac1 = unchecked(keyB * 0x82893933u);

        List<uint> terms = new List<uint>();
        List<uint> offsets = new List<uint>();
        for (int i = 0; i < 14; i++) {
            terms.Add(unchecked(CS64_COEFFS[i, 0] * ((i % 2 == 0) ? fac0 : fac1)));
            offsets.Add(CS64_COEFFS[i, 1]);
        }
        byte[] zdata = new byte[data.Length + 1];
        Array.Copy(data, 0, zdata, 1, data.Length);
        int padLen = zdata.Length + ((4 - (zdata.Length % 4)) % 4);
        byte[] zp = new byte[padLen];
        Array.Copy(zdata, zp, zdata.Length);
        List<uint> words = new List<uint>();
        for (int i = 0; i < zp.Length; i += 4)
            words.Add((uint)(zp[i] | (zp[i+1] << 8) | (zp[i+2] << 16) | (zp[i+3] << 24)));
        if (words.Count % 2 != 0) words.Add(0u);
        for (int i = 0; i < words.Count; i++) {
            uint word = words[i];
            uint term = unchecked(word * ((i % 2 == 0) ? keyA : keyB));
            uint off = unchecked(Rol16(word) * ((i % 2 == 0) ? 0xEF0569FBu : 0xC31713DBu));
            if (i == 0) { term = unchecked(term + 0xF2F90B1Au * fac0); off = unchecked(off + 0x0B1A0000u); }
            terms.Add(term); offsets.Add(off);
        }
        uint swapAcc = 0, swapLast = 0, st = 0, acc = 0;
        for (int i = 0; i < terms.Count; i += 2) {
            uint x = terms[i], y = terms[i+1];
            uint t = Rol16(unchecked(offsets[i] + x));
            uint q = unchecked(t * 0x76F50F34u);
            swapAcc = unchecked(swapAcc + Rol16(q) * 0xC3EFEA97u + q);
            t = Rol16(unchecked(offsets[i+1] + y));
            q = unchecked(t * 0x1881CE3Cu);
            swapLast = unchecked(Rol16(q) * 0x35BD1EC9u + q);
            swapAcc = unchecked(swapAcc + swapLast);

            st = unchecked(st * keyA + x);
            st = unchecked(Rol16(st) * 0xCF98B111u);
            st = unchecked(Rol16(st) * 0x87085B9Fu);
            st = unchecked(Rol16(st) * 0x12CEB96Du);
            st = unchecked(Rol16(st) * 0x257E1D83u);
            acc = unchecked(acc + st);
            t = unchecked(st * keyB + y);
            t = unchecked(Rol16(t) * 0xA27416F5u);
            t = unchecked(Rol16(t) * 0xD38396FFu);
            st = unchecked(Rol16(unchecked(Rol16(t) * 0x7C932B89u)) * 0xBFA49F69u);
            acc = unchecked(acc + st);
        }
        uint r0 = swapLast ^ st, r1 = swapAcc ^ acc;
        byte[] csBytes = new byte[] {
            (byte)r0, (byte)(r0>>8), (byte)(r0>>16), (byte)(r0>>24),
            (byte)r1, (byte)(r1>>8), (byte)(r1>>16), (byte)(r1>>24)
        };
        return BitConverter.ToString(csBytes).Replace("-", "") + "-" + BitConverter.ToString(digest).Replace("-", "");
    }

    public static byte[] Synthesize(string text, string voice, string lang, double rate, bool allowRetry) {
        string sec = GenerateSecMsGecV2();
        string muid = Guid.NewGuid().ToString("N").ToUpperInvariant();
        string connId = Guid.NewGuid().ToString("N");
        string path = "/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4&Sec-MS-GEC=" + sec + "&Sec-MS-GEC-Version=2-143.0.3650.75&ConnectionId=" + connId;
        using (var tcp = new TcpClient("speech.platform.bing.com", 443))
        using (var ssl = new SslStream(tcp.GetStream(), false)) {
            ssl.ReadTimeout = 12000;
            ssl.WriteTimeout = 12000;
            ssl.AuthenticateAsClient("speech.platform.bing.com");
            string wsKey = Convert.ToBase64String(Guid.NewGuid().ToByteArray());
            string req = "GET " + path + " HTTP/1.1\r\n" +
                "Host: speech.platform.bing.com\r\n" +
                "Upgrade: websocket\r\n" +
                "Connection: Upgrade\r\n" +
                "Sec-WebSocket-Key: " + wsKey + "\r\n" +
                "Sec-WebSocket-Version: 13\r\n" +
                "Pragma: no-cache\r\n" +
                "Cache-Control: no-cache\r\n" +
                "Origin: chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold\r\n" +
                "Cookie: muid=" + muid + ";\r\n" +
                "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0\r\n\r\n";
            byte[] rb = Encoding.ASCII.GetBytes(req);
            ssl.Write(rb, 0, rb.Length); ssl.Flush();
            var hdr = new List<byte>();
            while (true) {
                int b = ssl.ReadByte(); if (b < 0) break; hdr.Add((byte)b);
                int c = hdr.Count;
                if (c >= 4 && hdr[c-4]==13 && hdr[c-3]==10 && hdr[c-2]==13 && hdr[c-1]==10) break;
            }
            string hdrText = Encoding.ASCII.GetString(hdr.ToArray());
            string statusLine = hdrText.Split('\r')[0];
            if (!statusLine.Contains("101")) {
                if (allowRetry && statusLine.Contains("403")) {
                    foreach (string line in hdrText.Split('\n')) {
                        if (line.TrimStart().StartsWith("Date:", StringComparison.OrdinalIgnoreCase)) {
                            DateTimeOffset srv;
                            if (DateTimeOffset.TryParse(line.Substring(line.IndexOf(':') + 1).Trim(), CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out srv)) {
                                ClockSkewSeconds += srv.ToUnixTimeSeconds() - DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                                return Synthesize(text, voice, lang, rate, false);
                            }
                        }
                    }
                }
                throw new Exception("Edge TTS failed: " + statusLine);
            }

            Action<string> sendText = (msg) => {
                byte[] pl = Encoding.UTF8.GetBytes(msg);
                var ms = new MemoryStream();
                ms.WriteByte(0x81);
                if (pl.Length <= 125) ms.WriteByte((byte)(0x80 | pl.Length));
                else { ms.WriteByte(0x80 | 126); ms.WriteByte((byte)(pl.Length >> 8)); ms.WriteByte((byte)(pl.Length & 0xFF)); }
                byte[] mk = {0x31,0x41,0x59,0x26}; ms.Write(mk,0,4);
                for (int i=0;i<pl.Length;i++) ms.WriteByte((byte)(pl[i]^mk[i%4]));
                byte[] frame = ms.ToArray(); ssl.Write(frame,0,frame.Length); ssl.Flush();
            };
            Func<int, byte[]> readExact = (n) => {
                byte[] buf = new byte[n]; int off = 0;
                while (off < n) { int r = ssl.Read(buf, off, n - off); if (r <= 0) return null; off += r; }
                return buf;
            };

            string ts = DateTime.UtcNow.ToString("ddd MMM dd yyyy HH:mm:ss", CultureInfo.InvariantCulture) + " GMT+0000 (Coordinated Universal Time)";
            sendText("X-Timestamp:" + ts + "\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{\"context\":{\"synthesis\":{\"audio\":{\"metadataoptions\":{\"sentenceBoundaryEnabled\":\"false\",\"wordBoundaryEnabled\":\"false\"},\"outputFormat\":\"audio-24khz-48kbitrate-mono-mp3\"}}}}\r\n");

            string safeLang = (lang == "en") ? "en-US" : "fr-FR";
            string safeVoice = string.IsNullOrWhiteSpace(voice) ? ((lang == "en") ? "en-US-EmmaMultilingualNeural" : "fr-FR-VivienneMultilingualNeural") : voice;
            int ratePct = (int)Math.Round((rate - 1.0) * 100.0);
            string rateStr = (ratePct >= 0 ? "+" : "") + ratePct + "%";
            string reqId = Guid.NewGuid().ToString("N");
            string ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='" + safeLang + "'><voice name='" + SecurityElement.Escape(safeVoice) + "'><prosody rate='" + rateStr + "'>" + SecurityElement.Escape(text) + "</prosody></voice></speak>";
            sendText("X-RequestId:" + reqId + "\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:" + ts + "\r\nPath:ssml\r\n\r\n" + ssml);

            using (var mp3 = new MemoryStream(32768)) {
                while (true) {
                    byte[] h2 = readExact(2); if (h2 == null) break;
                    int op = h2[0] & 0x0F;
                    long plen = h2[1] & 0x7F;
                    if (plen == 126) { byte[] ex = readExact(2); plen = (ex[0] << 8) | ex[1]; }
                    else if (plen == 127) { byte[] ex = readExact(8); plen = 0; for (int i=0;i<8;i++) plen = (plen<<8)|ex[i]; }
                    byte[] pl = plen > 0 ? readExact((int)plen) : new byte[0];
                    if (op == 2 && pl.Length > 2) {
                        int hl = (pl[0] << 8) | pl[1];
                        if (pl.Length > 2 + hl) mp3.Write(pl, 2 + hl, pl.Length - (2 + hl));
                    } else if (op == 1) {
                        if (Encoding.UTF8.GetString(pl).Contains("Path:turn.end")) break;
                    } else if (op == 8) break;
                }
                return mp3.ToArray();
            }
        }
    }
}
'@

if (-not ("DFWolEdgeTtsV2" -as [type])) {
    Add-Type -TypeDefinition $EdgeTtsCode -Language CSharp
}

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
Write-Host "  Voix Neural Edge TTS          : ${prefix}api/tts?text=..." -ForegroundColor Green
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

function Parse-QueryDict {
    param([string]$QueryString)
    $dict = @{}
    $qStr = $QueryString.TrimStart('?')
    foreach ($pair in ($qStr -split '&')) {
        if ($pair -match '^([^=]+)=(.*)$') {
            $k = [System.Uri]::UnescapeDataString($Matches[1].Replace('+', ' '))
            $v = [System.Uri]::UnescapeDataString($Matches[2].Replace('+', ' '))
            $dict[$k] = $v
        }
    }
    return $dict
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

            # 1. Endpoint TTS Neuronal (/api/tts?text=...&voice=...&lang=...&rate=...)
            if ($rawPath -eq "/api/tts") {
                $qp = Parse-QueryDict $req.Url.Query
                $ttsText = if ($qp.ContainsKey("text")) { $qp["text"] } else { "" }
                $ttsVoice = if ($qp.ContainsKey("voice")) { $qp["voice"] } else { "fr-FR-VivienneMultilingualNeural" }
                $ttsLang = if ($qp.ContainsKey("lang")) { $qp["lang"] } else { "fr" }
                $ttsRate = 1.0
                if ($qp.ContainsKey("rate")) { [double]::TryParse($qp["rate"], [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$ttsRate) | Out-Null }

                if ([string]::IsNullOrWhiteSpace($ttsText)) {
                    $errBytes = [System.Text.Encoding]::UTF8.GetBytes("Missing text parameter")
                    Send-BytesResponse -Response $res -StatusCode 400 -Bytes $errBytes -ContentType "text/plain; charset=utf-8"
                    continue
                }
                if ($ttsText.Length -gt 1500) { $ttsText = $ttsText.Substring(0, 1500) }
                $mp3Bytes = [DFWolEdgeTtsV2]::Synthesize($ttsText, $ttsVoice, $ttsLang, $ttsRate, $true)
                Send-BytesResponse -Response $res -StatusCode 200 -Bytes $mp3Bytes -ContentType "audio/mpeg"
                continue
            }

            # 2. Endpoint Proxy Securise (/api/proxy?url=...)
            if ($rawPath -eq "/api/proxy") {
                $qp = Parse-QueryDict $req.Url.Query
                $targetUrl = if ($qp.ContainsKey("url")) { $qp["url"] } else { $null }
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

            # 3. Fichiers Statiques
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
