/**
 * Cloudflare Worker optionnel pour héberger un proxy CORS dédié (+ Edge Neural TTS /api/tts)
 * pour votre PWA DFWol.
 * Déployez ce fichier sur Cloudflare Workers, puis collez son URL dans DFWol -> Widget & Atelier.
 */
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
  const padded = new Uint8Array(rem + 1 + padZeros + 8);
  padded.set(data.subarray(7), 0);
  padded[rem] = 0x80;
  const bits = BigInt(totalLen) * 8n;
  for (let i = 0; i < 8; i++) padded[padded.length - 1 - i] = Number((bits >> BigInt(i * 8)) & 0xffn);

  for (let off = 0; off < padded.length; off += 64) {
    const bw = new Array(64).fill(0);
    for (let i = 0; i < 16; i++) {
      const p = off + i * 4;
      bw[i] = ((padded[p] << 24) | (padded[p + 1] << 16) | (padded[p + 2] << 8) | padded[p + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i++) bw[i] = (sigma1(bw[i - 2]) + bw[i - 7] + sigma0(bw[i - 15]) + bw[i - 16]) >>> 0;
    const wk = sha256Rounds(state, bw, 0);
    for (let i = 0; i < 8; i++) state[i] = (state[i] + wk[i]) >>> 0;
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    out[i * 4] = (state[i] >>> 24) & 0xff;
    out[i * 4 + 1] = (state[i] >>> 16) & 0xff;
    out[i * 4 + 2] = (state[i] >>> 8) & 0xff;
    out[i * 4 + 3] = state[i] & 0xff;
  }
  return out;
}

function generateSecMsGecV2() {
  let ticks = Math.floor(Date.now() / 1000) + 11644473600;
  ticks -= ticks % 300;
  const ticksStr = (BigInt(ticks) * 10000000n).toString() + TRUSTED_TOKEN;
  const data = new TextEncoder().encode(ticksStr);
  const digest = customSha256(data);

  const keyA = ((digest[0] | (digest[1] << 8) | (digest[2] << 16) | (digest[3] << 24)) | 1) >>> 0;
  const keyB = ((digest[4] | (digest[5] << 8) | (digest[6] << 16) | (digest[7] << 24)) | 1) >>> 0;
  const fac0 = Math.imul(keyA, 0x82893933) >>> 0;
  const fac1 = Math.imul(keyB, 0x82893933) >>> 0;

  const terms = [];
  const offsets = [];
  for (let i = 0; i < 14; i++) {
    terms.push(Math.imul(CS64_COEFFS[i][0], i % 2 === 0 ? fac0 : fac1) >>> 0);
    offsets.push(CS64_COEFFS[i][1]);
  }
  const zdata = new Uint8Array(data.length + 1);
  zdata.set(data, 1);
  const padLen = zdata.length + ((4 - (zdata.length % 4)) % 4);
  const zp = new Uint8Array(padLen);
  zp.set(zdata, 0);
  const words = [];
  for (let i = 0; i < zp.length; i += 4) {
    words.push((zp[i] | (zp[i + 1] << 8) | (zp[i + 2] << 16) | (zp[i + 3] << 24)) >>> 0);
  }
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
  const r0 = (swapLast ^ st) >>> 0;
  const r1 = (swapAcc ^ acc) >>> 0;
  const csBytes = new Uint8Array([
    r0 & 0xff, (r0 >>> 8) & 0xff, (r0 >>> 16) & 0xff, (r0 >>> 24) & 0xff,
    r1 & 0xff, (r1 >>> 8) & 0xff, (r1 >>> 16) & 0xff, (r1 >>> 24) & 0xff
  ]);
  const toHex = (arr) => Array.from(arr, (b) => b.toString(16).padStart(2, "0").toUpperCase()).join("");
  return `${toHex(csBytes)}-${toHex(digest)}`;
}

const escapeXml = (s) =>
  String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

async function synthesizeEdgeTtsWorker(text, voice, lang, rate) {
  const sec = generateSecMsGecV2();
  const connId = crypto.randomUUID().replace(/-/g, "");
  const muid = crypto.randomUUID().replace(/-/g, "").toUpperCase();
  const url = `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_TOKEN}&Sec-MS-GEC=${sec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}&ConnectionId=${connId}`;

  const resp = await fetch(url, {
    headers: {
      Upgrade: "websocket",
      Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
      Cookie: `muid=${muid};`,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0"
    }
  });
  const ws = resp.webSocket;
  if (!ws) throw new Error(`Edge WebSocket refused (${resp.status})`);
  ws.accept();

  const ts = new Date().toUTCString().replace("GMT", "GMT+0000 (Coordinated Universal Time)");
  ws.send(
    `X-Timestamp:${ts}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
      `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n`
  );

  const safeLang = lang === "en" ? "en-US" : "fr-FR";
  const safeVoice = voice || (lang === "en" ? "en-US-EmmaMultilingualNeural" : "fr-FR-VivienneMultilingualNeural");
  const ratePct = Math.round((Number(rate || 1) - 1) * 100);
  const rateStr = `${ratePct >= 0 ? "+" : ""}${ratePct}%`;
  const reqId = crypto.randomUUID().replace(/-/g, "");
  const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${safeLang}'><voice name='${escapeXml(safeVoice)}'><prosody rate='${rateStr}'>${escapeXml(text)}</prosody></voice></speak>`;
  ws.send(`X-RequestId:${reqId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${ts}\r\nPath:ssml\r\n\r\n${ssml}`);

  return await new Promise((resolve, reject) => {
    const chunks = [];
    ws.addEventListener("message", (evt) => {
      if (typeof evt.data === "string") {
        if (evt.data.includes("Path:turn.end")) {
          try { ws.close(); } catch {}
          const total = chunks.reduce((s, c) => s + c.length, 0);
          const merged = new Uint8Array(total);
          let off = 0;
          chunks.forEach((c) => { merged.set(c, off); off += c.length; });
          resolve(merged);
        }
      } else if (evt.data instanceof ArrayBuffer) {
        const u8 = new Uint8Array(evt.data);
        if (u8.length > 2) {
          const hl = (u8[0] << 8) | u8[1];
          if (u8.length > 2 + hl) chunks.push(u8.subarray(2 + hl));
        }
      }
    });
    ws.addEventListener("error", () => reject(new Error("WebSocket error")));
  });
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "*"
        }
      });
    }

    const reqUrl = new URL(request.url);

    // Endpoint /api/tts?text=...&voice=...&lang=...&rate=...
    if (reqUrl.pathname === "/api/tts") {
      const text = (reqUrl.searchParams.get("text") || "").slice(0, 1500);
      if (!text.trim()) return new Response("Missing text parameter", { status: 400 });
      try {
        const mp3 = await synthesizeEdgeTtsWorker(
          text,
          reqUrl.searchParams.get("voice"),
          reqUrl.searchParams.get("lang") || "fr",
          reqUrl.searchParams.get("rate") || "1"
        );
        return new Response(mp3, {
          status: 200,
          headers: {
            "Content-Type": "audio/mpeg",
            "Access-Control-Allow-Origin": "*"
          }
        });
      } catch (err) {
        return new Response(`TTS Error: ${err.message}`, {
          status: 502,
          headers: { "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    const targetStr = reqUrl.searchParams.get("url");
    if (!targetStr) {
      return new Response("Missing url parameter", { status: 400 });
    }

    let target;
    try {
      target = new URL(targetStr);
    } catch {
      return new Response("Invalid URL", { status: 400 });
    }

    if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname.toLowerCase())) {
      return new Response(`Forbidden host: ${target.hostname}`, { status: 403 });
    }

    const upstream = await fetch(target.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) DFWolStudio/3.0" },
      redirect: "follow"
    });

    const headers = new Headers(upstream.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Expose-Headers", "X-Final-Url");
    headers.set("X-Final-Url", upstream.url || target.toString());

    return new Response(upstream.body, {
      status: upstream.status,
      headers
    });
  }
};
