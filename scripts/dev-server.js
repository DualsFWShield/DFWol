/**
 * Serveur de développement Node.js sans dépendances externes pour DFWol Studio.
 * Sert les fichiers statiques, /api/proxy?url=... (WOL/JW) et /api/tts (Edge Neural TTS v2).
 */
const http = require("http");
const tls = require("tls");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT) || 8080;
const ROOT = path.resolve(__dirname, "..");
const ALLOWED_HOSTS = new Set([
  "wol.jw.org",
  "www.jw.org",
  "b.jw-cdn.org",
  "cfp.jw-cdn.org",
  "cfp2.jw-cdn.org",
  "cms-imgp.jw-cdn.org",
  "pubmedia.jw-cdn.org",
  "download-a.akamaihd.net",
  "d34ji3l0qn3w2t.cloudfront.net",
  "assetsnffrgf-a.akamaihd.net"
]);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".vtt": "text/vtt; charset=utf-8"
};

// Edge Neural TTS v2 DRM
const TRUSTED_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const SEC_MS_GEC_VERSION = "2-143.0.3650.75";
const SHA256_INITIAL = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
const SHA256_STATE = [0xfd9fbea2, 0x91243ce7, 0xbe499094, 0xcd2e1e0a, 0x6c006f49, 0x04bd35ab, 0xfeb0a7e4, 0x03effbd2];
const SHA256_SCHEDULE = [0xeb24bf9e, 0x1558691f, 0xa0c09ee2, 0x0cfa32ba, 0xa622ee8c, 0xd1dd9491, 0xc0dd25a0, 0xf9e70ab6, 0xf0c31573, 0x7058ce4e, 0x7188e606, 0x00e5ab33, 0xd258b060, 0x72766564];
const K_CONST = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];
const CS64_COEFFS = [
  [0xe82e91b1, 0xb32700d0], [0x44de24c6, 0x88dff51d], [0x3beb65bc, 0x29514038], [0xc89c5933, 0xb328cbdf],
  [0x8d1ec211, 0xd405b4d5], [0x314ef5d5, 0x26e55f3c], [0xe92491b1, 0x607801c6], [0xf0a5b9d5, 0x82b2c1fb],
  [0x06064cf3, 0xfa51a3da], [0xda79fa60, 0x207cc464], [0xbed20560, 0x3c3c74f3], [0x89f9c9f8, 0xd2d14b61],
  [0x35fa38c6, 0xbb04a2c1], [0xcb49e3c6, 0xc5626167]
];
const rotr = (x, n) => ((x >>> n) | (x << (32 - n))) >>> 0;
const rol16 = (x) => ((x << 16) | (x >>> 16)) >>> 0;
const sigma0 = (x) => (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) >>> 0;
const sigma1 = (x) => (rotr(x, 17) ^ rotr(x, 19) ^ (x >>> 10)) >>> 0;

function sha256Rounds(st, w, firstRound) {
  let [a, b, c, d, e, f, g, h] = st;
  for (let i = firstRound; i < 64; i++) {
    const ki = firstRound === 14 && i === 14 ? 0xc9dc06a7 : K_CONST[i];
    const s1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
    const ch = (g ^ (e & (f ^ g))) >>> 0;
    const t1 = (h + s1 + ch + ki + w[i]) >>> 0;
    const s0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
    const maj = ((a & b) | (c & (a | b))) >>> 0;
    const t2 = (s0 + maj) >>> 0;
    h = g; g = f; f = e; e = (d + t1) >>> 0;
    d = c; c = b; b = a; a = (t1 + t2) >>> 0;
  }
  return [a, b, c, d, e, f, g, h];
}

function customSha256(data) {
  const w = new Array(64).fill(0);
  w[14] = ((data[0] << 16) | (data[1] << 8) | data[2]) >>> 0;
  w[15] = ((data[3] << 24) | (data[4] << 16) | (data[5] << 8) | data[6]) >>> 0;
  for (let i = 16; i < 30; i++) {
    let val = SHA256_SCHEDULE[i - 16];
    if (i - 2 >= 14) val = (val + (i === 16 ? (sigma1(w[i - 2]) ^ 0x000b92c0) >>> 0 : sigma1(w[i - 2]))) >>> 0;
    if (i - 7 >= 14) val = (val + w[i - 7]) >>> 0;
    if (i - 15 >= 14) val = (val + (i === 29 ? (sigma0(w[i - 15]) ^ 0x059c0b80) >>> 0 : sigma0(w[i - 15]))) >>> 0;
    w[i] = val;
  }
  w[30] = (sigma1(w[28]) + w[23] + sigma0(w[15]) + w[14] + 0xc9dc06a7 - K_CONST[14]) >>> 0;
  for (let i = 31; i < 64; i++) w[i] = (sigma1(w[i - 2]) + w[i - 7] + sigma0(w[i - 15]) + w[i - 16]) >>> 0;
  const working = sha256Rounds(SHA256_STATE, w, 14);
  const state = SHA256_INITIAL.map((v, i) => (v + working[i]) >>> 0);
  const rem = data.length - 7;
  const totalLen = 57 + data.length;
  const padZeros = (((55 - totalLen) % 64) + 64) % 64;
  const padded = Buffer.alloc(rem + 1 + padZeros + 8);
  data.copy(padded, 0, 7);
  padded[rem] = 0x80;
  padded.writeBigUInt64BE(BigInt(totalLen) * 8n, padded.length - 8);
  for (let off = 0; off < padded.length; off += 64) {
    const bw = new Array(64).fill(0);
    for (let i = 0; i < 16; i++) bw[i] = padded.readUInt32BE(off + i * 4);
    for (let i = 16; i < 64; i++) bw[i] = (sigma1(bw[i - 2]) + bw[i - 7] + sigma0(bw[i - 15]) + bw[i - 16]) >>> 0;
    const wk = sha256Rounds(state, bw, 0);
    for (let i = 0; i < 8; i++) state[i] = (state[i] + wk[i]) >>> 0;
  }
  const out = Buffer.alloc(32);
  for (let i = 0; i < 8; i++) out.writeUInt32BE(state[i], i * 4);
  return out;
}

function generateSecMsGecV2() {
  let ticks = Math.floor(Date.now() / 1000) + 11644473600;
  ticks -= ticks % 300;
  const data = Buffer.from((BigInt(ticks) * 10000000n).toString() + TRUSTED_TOKEN, "ascii");
  const digest = customSha256(data);
  const keyA = (digest.readUInt32LE(0) | 1) >>> 0;
  const keyB = (digest.readUInt32LE(4) | 1) >>> 0;
  const fac0 = Math.imul(keyA, 0x82893933) >>> 0;
  const fac1 = Math.imul(keyB, 0x82893933) >>> 0;
  const terms = [];
  const offsets = [];
  for (let i = 0; i < 14; i++) {
    terms.push(Math.imul(CS64_COEFFS[i][0], i % 2 === 0 ? fac0 : fac1) >>> 0);
    offsets.push(CS64_COEFFS[i][1]);
  }
  const zdata = Buffer.concat([Buffer.from([0]), data]);
  const zp = Buffer.concat([zdata, Buffer.alloc((4 - (zdata.length % 4)) % 4)]);
  const words = [];
  for (let i = 0; i < zp.length; i += 4) words.push(zp.readUInt32LE(i));
  if (words.length % 2 !== 0) words.push(0);
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    let term = Math.imul(word, i % 2 === 0 ? keyA : keyB) >>> 0;
    let off = Math.imul(rol16(word), i % 2 === 0 ? 0xef0569fb : 0xc31713db) >>> 0;
    if (i === 0) {
      term = (term + Math.imul(0xf2f90b1a, fac0)) >>> 0;
      off = (off + 0x0b1a0000) >>> 0;
    }
    terms.push(term);
    offsets.push(off);
  }
  let swapAcc = 0, swapLast = 0, st = 0, acc = 0;
  for (let i = 0; i < terms.length; i += 2) {
    const x = terms[i], y = terms[i + 1];
    let t = rol16((offsets[i] + x) >>> 0);
    let q = Math.imul(t, 0x76f50f34) >>> 0;
    swapAcc = (swapAcc + Math.imul(rol16(q), 0xc3efea97) + q) >>> 0;
    t = rol16((offsets[i + 1] + y) >>> 0);
    q = Math.imul(t, 0x1881ce3c) >>> 0;
    swapLast = (Math.imul(rol16(q), 0x35bd1ec9) + q) >>> 0;
    swapAcc = (swapAcc + swapLast) >>> 0;
    st = (Math.imul(st, keyA) + x) >>> 0;
    st = Math.imul(rol16(st), 0xcf98b111) >>> 0;
    st = Math.imul(rol16(st), 0x87085b9f) >>> 0;
    st = Math.imul(rol16(st), 0x12ceb96d) >>> 0;
    st = Math.imul(rol16(st), 0x257e1d83) >>> 0;
    acc = (acc + st) >>> 0;
    t = (Math.imul(st, keyB) + y) >>> 0;
    t = Math.imul(rol16(t), 0xa27416f5) >>> 0;
    t = Math.imul(rol16(t), 0xd38396ff) >>> 0;
    st = Math.imul(rol16(Math.imul(rol16(t), 0x7c932b89) >>> 0), 0xbfa49f69) >>> 0;
    acc = (acc + st) >>> 0;
  }
  const cs = Buffer.alloc(8);
  cs.writeUInt32LE((swapLast ^ st) >>> 0, 0);
  cs.writeUInt32LE((swapAcc ^ acc) >>> 0, 4);
  return `${cs.toString("hex").toUpperCase()}-${digest.toString("hex").toUpperCase()}`;
}

const escapeXml = (s) =>
  String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const MAX_TTS_CACHE = 60;
const ttsServerCache = new Map();

function buildWsTextFrame(msg) {
  const pl = Buffer.from(msg, "utf8");
  const mask = crypto.randomBytes(4);
  let hdr;
  if (pl.length <= 125) hdr = Buffer.from([0x81, 0x80 | pl.length]);
  else {
    hdr = Buffer.alloc(4);
    hdr[0] = 0x81;
    hdr[1] = 0x80 | 126;
    hdr.writeUInt16BE(pl.length, 2);
  }
  const masked = Buffer.alloc(pl.length);
  for (let i = 0; i < pl.length; i++) masked[i] = pl[i] ^ mask[i % 4];
  return Buffer.concat([hdr, mask, masked]);
}

function synthesizeEdgeTtsNode(text, voice, lang, rate) {
  return new Promise((resolve, reject) => {
    const sec = generateSecMsGecV2();
    const muid = crypto.randomBytes(16).toString("hex").toUpperCase();
    const connId = crypto.randomUUID().replace(/-/g, "");
    const wsPath = `/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_TOKEN}&Sec-MS-GEC=${sec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}&ConnectionId=${connId}`;
    const sock = tls.connect(443, "speech.platform.bing.com", { servername: "speech.platform.bing.com", family: 4 }, () => {
      sock.setNoDelay(true);
      const req =
        `GET ${wsPath} HTTP/1.1\r\n` +
        `Host: speech.platform.bing.com\r\n` +
        `Upgrade: websocket\r\n` +
        `Connection: Upgrade\r\n` +
        `Sec-WebSocket-Key: ${crypto.randomBytes(16).toString("base64")}\r\n` +
        `Sec-WebSocket-Version: 13\r\n` +
        `Origin: chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold\r\n` +
        `Cookie: muid=${muid};\r\n` +
        `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0\r\n\r\n`;
      sock.write(req);
    });

    let handshakeDone = false;
    let buf = Buffer.alloc(0);
    const mp3Chunks = [];
    const timer = setTimeout(() => { sock.destroy(); reject(new Error("TTS timeout")); }, 20000);

    sock.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!handshakeDone) {
        const idx = buf.indexOf("\r\n\r\n");
        if (idx === -1) return;
        const statusLine = buf.subarray(0, idx).toString("ascii").split("\r\n")[0];
        if (!statusLine.includes("101")) {
          clearTimeout(timer);
          sock.destroy();
          return reject(new Error(`Edge TTS handshake failed: ${statusLine}`));
        }
        handshakeDone = true;
        buf = buf.subarray(idx + 4);
        const ts = new Date().toUTCString().replace("GMT", "GMT+0000 (Coordinated Universal Time)");
        const cfgFrame = buildWsTextFrame(`X-Timestamp:${ts}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n`);
        const safeLang = lang === "en" ? "en-US" : "fr-FR";
        const safeVoice = voice || (lang === "en" ? "en-US-AriaNeural" : "fr-FR-DeniseNeural");
        const pct = Math.round((Number(rate || 1) - 1) * 100);
        const rateStr = `${pct >= 0 ? "+" : ""}${pct}%`;
        const reqId = crypto.randomUUID().replace(/-/g, "");
        const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${safeLang}'><voice name='${escapeXml(safeVoice)}'><prosody rate='${rateStr}'>${escapeXml(text)}</prosody></voice></speak>`;
        const ssmlFrame = buildWsTextFrame(`X-RequestId:${reqId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${ts}\r\nPath:ssml\r\n\r\n${ssml}`);
        sock.write(Buffer.concat([cfgFrame, ssmlFrame]));
      }

      while (handshakeDone && buf.length >= 2) {
        const op = buf[0] & 0x0f;
        let plen = buf[1] & 0x7f;
        let off = 2;
        if (plen === 126) {
          if (buf.length < 4) break;
          plen = buf.readUInt16BE(2);
          off = 4;
        } else if (plen === 127) {
          if (buf.length < 10) break;
          plen = Number(buf.readBigUInt64BE(2));
          off = 10;
        }
        if (buf.length < off + plen) break;
        const payload = buf.subarray(off, off + plen);
        buf = buf.subarray(off + plen);
        if (op === 2 && payload.length > 2) {
          const hl = payload.readUInt16BE(0);
          if (payload.length > 2 + hl) mp3Chunks.push(payload.subarray(2 + hl));
        } else if (op === 1) {
          if (payload.toString("utf8").includes("Path:turn.end")) {
            clearTimeout(timer);
            sock.end();
            return resolve(Buffer.concat(mp3Chunks));
          }
        } else if (op === 8) {
          clearTimeout(timer);
          sock.end();
          return resolve(Buffer.concat(mp3Chunks));
        }
      }
    });

    sock.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "*"
      });
      return res.end();
    }

    if (reqUrl.pathname === "/api/tts") {
      const text = (reqUrl.searchParams.get("text") || "").slice(0, 1500);
      if (!text.trim()) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end("Missing text parameter");
      }
      const voice = reqUrl.searchParams.get("voice") || "";
      const lang = reqUrl.searchParams.get("lang") || "fr";
      const rate = reqUrl.searchParams.get("rate") || "1";
      const cacheKey = `${voice}|${lang}|${rate}|${text}`;
      let mp3 = ttsServerCache.get(cacheKey);
      if (mp3) {
        ttsServerCache.delete(cacheKey);
        ttsServerCache.set(cacheKey, mp3);
      } else {
        mp3 = await synthesizeEdgeTtsNode(text, voice, lang, rate);
        if (mp3 && mp3.length > 0) {
          ttsServerCache.set(cacheKey, mp3);
          if (ttsServerCache.size > MAX_TTS_CACHE) {
            const oldestKey = ttsServerCache.keys().next().value;
            if (oldestKey !== undefined) ttsServerCache.delete(oldestKey);
          }
        }
      }
      res.writeHead(200, {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*"
      });
      return res.end(mp3);
    }

    if (reqUrl.pathname === "/api/proxy") {
      const targetStr = reqUrl.searchParams.get("url");
      if (!targetStr) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end("Missing url parameter");
      }
      const target = new URL(targetStr);
      if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname.toLowerCase())) {
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end(`Forbidden host: ${target.hostname}`);
      }

      const upstream = await fetch(target.toString(), {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) DFWolStudio/3.0" },
        redirect: "follow",
        signal: AbortSignal.timeout(12000)
      });
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.writeHead(upstream.status, {
        "Content-Type": upstream.headers.get("content-type") || "text/html; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "X-Final-Url",
        "X-Final-Url": upstream.url || target.toString()
      });
      return res.end(buf);
    }

    let relPath = reqUrl.pathname === "/" ? "/index.html" : reqUrl.pathname;
    const fullPath = path.resolve(ROOT, "." + relPath);
    if (fullPath !== ROOT && !fullPath.startsWith(ROOT + path.sep)) {
      res.writeHead(403);
      return res.end("Forbidden");
    }

    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      const ext = path.extname(fullPath).toLowerCase();
      res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
      return fs.createReadStream(fullPath).pipe(res);
    }

    res.writeHead(404);
    res.end("Not Found");
  } catch (err) {
    const isTimeout = err && (err.name === "TimeoutError" || err.name === "AbortError");
    res.writeHead(isTimeout ? 504 : 502, { "Content-Type": "text/plain; charset=utf-8" });
    res.end((isTimeout ? "Upstream Proxy Timeout: " : "Proxy Error: ") + err.message);
  }
});

server.listen(PORT, () => {
  console.log(`[DFWol] Serveur actif sur http://localhost:${PORT}`);
});
