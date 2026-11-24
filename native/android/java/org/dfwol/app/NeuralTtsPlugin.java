package org.dfwol.app;

import android.content.Context;
import android.media.AudioAttributes;
import android.os.Build;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

/**
 * Plugin Capacitor Natif pour DFWol :
 * 1) Synthèse Vocale Neuronale Microsoft Edge v2 (MP3 haute fidélité sans dépendance Gradle)
 * 2) Synthèse Vocale Android Native Google Neural TTS (secours hors-ligne instantané)
 */
@CapacitorPlugin(name = "NeuralTts")
public class NeuralTtsPlugin extends Plugin {

    private static final String EDGE_HOST = "speech.platform.bing.com";
    private static final String TRUSTED_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
    private static final String SEC_MS_GEC_VERSION = "2-143.0.3650.75";
    private static final String EDGE_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0";
    private static final String EDGE_ORIGIN = "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold";

    private static volatile long clockSkewSeconds = 0L;
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final SecureRandom random = new SecureRandom();

    private TextToSpeech nativeTts = null;
    private volatile boolean nativeTtsReady = false;
    private final Object ttsLock = new Object();

    // ======================================================================
    // 1. Edge Neural TTS v2 (Raw TLS WebSocket -> MP3 Base64)
    // ======================================================================

    private static final int[] SHA256_INITIAL = {
        0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A,
        0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19
    };
    private static final int[] SHA256_STATE = {
        0xFD9FBEA2, 0x91243CE7, 0xBE499094, 0xCD2E1E0A,
        0x6C006F49, 0x04BD35AB, 0xFEB0A7E4, 0x03EFFBD2
    };
    private static final int[] SHA256_SCHEDULE = {
        0xEB24BF9E, 0x1558691F, 0xA0C09EE2, 0x0CFA32BA,
        0xA622EE8C, 0xD1DD9491, 0xC0DD25A0, 0xF9E70AB6,
        0xF0C31573, 0x7058CE4E, 0x7188E606, 0x00E5AB33,
        0xD258B060, 0x72766564
    };
    private static final int[] K = {
        0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5, 0x3956C25B, 0x59F111F1, 0x923F82A4, 0xAB1C5ED5,
        0xD807AA98, 0x12835B01, 0x243185BE, 0x550C7DC3, 0x72BE5D74, 0x80DEB1FE, 0x9BDC06A7, 0xC19BF174,
        0xE49B69C1, 0xEFBE4786, 0x0FC19DC6, 0x240CA1CC, 0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA,
        0x983E5152, 0xA831C66D, 0xB00327C8, 0xBF597FC7, 0xC6E00BF3, 0xD5A79147, 0x06CA6351, 0x14292967,
        0x27B70A85, 0x2E1B2138, 0x4D2C6DFC, 0x53380D13, 0x650A7354, 0x766A0ABB, 0x81C2C92E, 0x92722C85,
        0xA2BFE8A1, 0xA81A664B, 0xC24B8B70, 0xC76C51A3, 0xD192E819, 0xD6990624, 0xF40E3585, 0x106AA070,
        0x19A4C116, 0x1E376C08, 0x2748774C, 0x34B0BCB5, 0x391C0CB3, 0x4ED8AA4A, 0x5B9CCA4F, 0x682E6FF3,
        0x748F82EE, 0x78A5636F, 0x84C87814, 0x8CC70208, 0x90BEFFFA, 0xA4506CEB, 0xBEF9A3F7, 0xC67178F2
    };
    private static final int[][] CS64_COEFFS = {
        {0xE82E91B1, 0xB32700D0}, {0x44DE24C6, 0x88DFF51D}, {0x3BEB65BC, 0x29514038}, {0xC89C5933, 0xB328CBDF},
        {0x8D1EC211, 0xD405B4D5}, {0x314EF5D5, 0x26E55F3C}, {0xE92491B1, 0x607801C6}, {0xF0A5B9D5, 0x82B2C1FB},
        {0x06064CF3, 0xFA51A3DA}, {0xDA79FA60, 0x207CC464}, {0xBED20560, 0x3C3C74F3}, {0x89F9C9F8, 0xD2D14B61},
        {0x35FA38C6, 0xBB04A2C1}, {0xCB49E3C6, 0xC5626167}
    };

    private static int rotr(int x, int n) {
        return (x >>> n) | (x << (32 - n));
    }

    private static int rol16(int x) {
        return (x << 16) | (x >>> 16);
    }

    private static int sigma0(int x) {
        return rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
    }

    private static int sigma1(int x) {
        return rotr(x, 17) ^ rotr(x, 19) ^ (x >>> 10);
    }

    private static int[] sha256Rounds(int[] st, int[] w, int firstRound) {
        int a = st[0], b = st[1], c = st[2], d = st[3], e = st[4], f = st[5], g = st[6], h = st[7];
        for (int i = firstRound; i < 64; i++) {
            int ki = (firstRound == 14 && i == 14) ? 0xC9DC06A7 : K[i];
            int s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            int ch = g ^ (e & (f ^ g));
            int t1 = h + s1 + ch + ki + w[i];
            int s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            int maj = (a & b) | (c & (a | b));
            int t2 = s0 + maj;
            h = g; g = f; f = e; e = d + t1;
            d = c; c = b; b = a; a = t1 + t2;
        }
        return new int[]{a, b, c, d, e, f, g, h};
    }

    private static byte[] customSha256(byte[] data) {
        int[] w = new int[64];
        w[14] = ((data[0] & 0xFF) << 16) | ((data[1] & 0xFF) << 8) | (data[2] & 0xFF);
        w[15] = ((data[3] & 0xFF) << 24) | ((data[4] & 0xFF) << 16) | ((data[5] & 0xFF) << 8) | (data[6] & 0xFF);
        for (int i = 16; i < 30; i++) {
            int val = SHA256_SCHEDULE[i - 16];
            if (i - 2 >= 14) val += (i == 16 ? (sigma1(w[i - 2]) ^ 0x000B92C0) : sigma1(w[i - 2]));
            if (i - 7 >= 14) val += w[i - 7];
            if (i - 15 >= 14) val += (i == 29 ? (sigma0(w[i - 15]) ^ 0x059C0B80) : sigma0(w[i - 15]));
            w[i] = val;
        }
        w[30] = sigma1(w[28]) + w[23] + sigma0(w[15]) + w[14] + 0xC9DC06A7 - K[14];
        for (int i = 31; i < 64; i++) {
            w[i] = sigma1(w[i - 2]) + w[i - 7] + sigma0(w[i - 15]) + w[i - 16];
        }
        int[] working = sha256Rounds(SHA256_STATE, w, 14);
        int[] state = new int[8];
        for (int i = 0; i < 8; i++) state[i] = SHA256_INITIAL[i] + working[i];

        int rem = data.length - 7;
        long totalLen = 57L + data.length;
        int padZeros = (int) (((55 - totalLen) % 64 + 64) % 64);
        byte[] padded = new byte[rem + 1 + padZeros + 8];
        System.arraycopy(data, 7, padded, 0, rem);
        padded[rem] = (byte) 0x80;
        long bits = totalLen * 8L;
        for (int i = 0; i < 8; i++) {
            padded[padded.length - 1 - i] = (byte) ((bits >>> (i * 8)) & 0xFF);
        }

        for (int off = 0; off < padded.length; off += 64) {
            int[] bw = new int[64];
            for (int i = 0; i < 16; i++) {
                int p = off + i * 4;
                bw[i] = ((padded[p] & 0xFF) << 24)
                    | ((padded[p + 1] & 0xFF) << 16)
                    | ((padded[p + 2] & 0xFF) << 8)
                    | (padded[p + 3] & 0xFF);
            }
            for (int i = 16; i < 64; i++) {
                bw[i] = sigma1(bw[i - 2]) + bw[i - 7] + sigma0(bw[i - 15]) + bw[i - 16];
            }
            int[] wk = sha256Rounds(state, bw, 0);
            for (int i = 0; i < 8; i++) state[i] += wk[i];
        }

        byte[] out = new byte[32];
        for (int i = 0; i < 8; i++) {
            out[i * 4] = (byte) (state[i] >>> 24);
            out[i * 4 + 1] = (byte) (state[i] >>> 16);
            out[i * 4 + 2] = (byte) (state[i] >>> 8);
            out[i * 4 + 3] = (byte) (state[i]);
        }
        return out;
    }

    private static String toHexUpper(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(String.format(Locale.US, "%02X", b & 0xFF));
        }
        return sb.toString();
    }

    private static String generateSecMsGecV2() {
        long unixSecs = (System.currentTimeMillis() / 1000L) + clockSkewSeconds;
        long ticks = unixSecs + 11644473600L;
        ticks -= ticks % 300L;
        ticks *= 10000000L;
        byte[] data = (ticks + TRUSTED_TOKEN).getBytes(StandardCharsets.US_ASCII);
        byte[] digest = customSha256(data);

        int keyA = ((digest[0] & 0xFF) | ((digest[1] & 0xFF) << 8) | ((digest[2] & 0xFF) << 16) | ((digest[3] & 0xFF) << 24)) | 1;
        int keyB = ((digest[4] & 0xFF) | ((digest[5] & 0xFF) << 8) | ((digest[6] & 0xFF) << 16) | ((digest[7] & 0xFF) << 24)) | 1;
        int fac0 = keyA * 0x82893933;
        int fac1 = keyB * 0x82893933;

        List<Integer> terms = new ArrayList<>();
        List<Integer> offsets = new ArrayList<>();
        for (int i = 0; i < 14; i++) {
            terms.add(CS64_COEFFS[i][0] * ((i % 2 == 0) ? fac0 : fac1));
            offsets.add(CS64_COEFFS[i][1]);
        }

        byte[] zdata = new byte[data.length + 1];
        System.arraycopy(data, 0, zdata, 1, data.length);
        int padLen = zdata.length + ((4 - (zdata.length % 4)) % 4);
        byte[] zp = new byte[padLen];
        System.arraycopy(zdata, 0, zp, 0, zdata.length);

        List<Integer> words = new ArrayList<>();
        for (int i = 0; i < zp.length; i += 4) {
            words.add((zp[i] & 0xFF) | ((zp[i + 1] & 0xFF) << 8) | ((zp[i + 2] & 0xFF) << 16) | ((zp[i + 3] & 0xFF) << 24));
        }
        if (words.size() % 2 != 0) words.add(0);

        for (int i = 0; i < words.size(); i++) {
            int word = words.get(i);
            int term = word * ((i % 2 == 0) ? keyA : keyB);
            int off = rol16(word) * ((i % 2 == 0) ? 0xEF0569FB : 0xC31713DB);
            if (i == 0) {
                term += 0xF2F90B1A * fac0;
                off += 0x0B1A0000;
            }
            terms.add(term);
            offsets.add(off);
        }

        int swapAcc = 0, swapLast = 0, st = 0, acc = 0;
        for (int i = 0; i < terms.size(); i += 2) {
            int x = terms.get(i);
            int y = terms.get(i + 1);
            int t = rol16(offsets.get(i) + x);
            int q = t * 0x76F50F34;
            swapAcc += rol16(q) * 0xC3EFEA97 + q;
            t = rol16(offsets.get(i + 1) + y);
            q = t * 0x1881CE3C;
            swapLast = rol16(q) * 0x35BD1EC9 + q;
            swapAcc += swapLast;

            st = st * keyA + x;
            st = rol16(st) * 0xCF98B111;
            st = rol16(st) * 0x87085B9F;
            st = rol16(st) * 0x12CEB96D;
            st = rol16(st) * 0x257E1D83;
            acc += st;
            t = st * keyB + y;
            t = rol16(t) * 0xA27416F5;
            t = rol16(t) * 0xD38396FF;
            st = rol16(rol16(t) * 0x7C932B89) * 0xBFA49F69;
            acc += st;
        }

        int r0 = swapLast ^ st;
        int r1 = swapAcc ^ acc;
        byte[] csBytes = new byte[]{
            (byte) r0, (byte) (r0 >>> 8), (byte) (r0 >>> 16), (byte) (r0 >>> 24),
            (byte) r1, (byte) (r1 >>> 8), (byte) (r1 >>> 16), (byte) (r1 >>> 24)
        };
        return toHexUpper(csBytes) + "-" + toHexUpper(digest);
    }

    private String randomHex32() {
        byte[] b = new byte[16];
        random.nextBytes(b);
        return toHexUpper(b);
    }

    private static String escapeXml(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&apos;");
    }

    private static void sendWsText(OutputStream out, SecureRandom rng, String msg) throws IOException {
        byte[] pl = msg.getBytes(StandardCharsets.UTF_8);
        ByteArrayOutputStream frame = new ByteArrayOutputStream(pl.length + 16);
        frame.write(0x81);
        if (pl.length <= 125) {
            frame.write(0x80 | pl.length);
        } else if (pl.length <= 65535) {
            frame.write(0x80 | 126);
            frame.write((pl.length >>> 8) & 0xFF);
            frame.write(pl.length & 0xFF);
        } else {
            throw new IOException("SSML frame too large");
        }
        byte[] mask = new byte[4];
        rng.nextBytes(mask);
        frame.write(mask);
        for (int i = 0; i < pl.length; i++) {
            frame.write(pl[i] ^ mask[i % 4]);
        }
        out.write(frame.toByteArray());
        out.flush();
    }

    private static byte[] readExact(InputStream in, int len) throws IOException {
        byte[] buf = new byte[len];
        int off = 0;
        while (off < len) {
            int r = in.read(buf, off, len - off);
            if (r < 0) return null;
            off += r;
        }
        return buf;
    }

    private byte[] fetchEdgeNeuralMp3(String text, String voice, String lang, double rate, boolean allowRetry) throws Exception {
        String sec = generateSecMsGecV2();
        String muid = randomHex32();
        String connId = UUID.randomUUID().toString().replace("-", "");
        String path = "/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken="
            + TRUSTED_TOKEN + "&Sec-MS-GEC=" + sec
            + "&Sec-MS-GEC-Version=" + SEC_MS_GEC_VERSION + "&ConnectionId=" + connId;

        SSLSocketFactory factory = (SSLSocketFactory) SSLSocketFactory.getDefault();
        try (SSLSocket socket = (SSLSocket) factory.createSocket(EDGE_HOST, 443)) {
            socket.setSoTimeout(12000);
            socket.startHandshake();

            byte[] keyBytes = new byte[16];
            random.nextBytes(keyBytes);
            String wsKey = Base64.encodeToString(keyBytes, Base64.NO_WRAP);

            String req = "GET " + path + " HTTP/1.1\r\n"
                + "Host: " + EDGE_HOST + "\r\n"
                + "Upgrade: websocket\r\n"
                + "Connection: Upgrade\r\n"
                + "Sec-WebSocket-Key: " + wsKey + "\r\n"
                + "Sec-WebSocket-Version: 13\r\n"
                + "Pragma: no-cache\r\n"
                + "Cache-Control: no-cache\r\n"
                + "Origin: " + EDGE_ORIGIN + "\r\n"
                + "Cookie: muid=" + muid + ";\r\n"
                + "User-Agent: " + EDGE_UA + "\r\n\r\n";

            OutputStream out = socket.getOutputStream();
            InputStream in = socket.getInputStream();
            out.write(req.getBytes(StandardCharsets.US_ASCII));
            out.flush();

            ByteArrayOutputStream hdrBuf = new ByteArrayOutputStream();
            int b;
            byte[] last4 = new byte[4];
            while ((b = in.read()) >= 0) {
                hdrBuf.write(b);
                last4[0] = last4[1];
                last4[1] = last4[2];
                last4[2] = last4[3];
                last4[3] = (byte) b;
                if (last4[0] == 13 && last4[1] == 10 && last4[2] == 13 && last4[3] == 10) break;
                if (hdrBuf.size() > 8192) break;
            }
            String headersText = hdrBuf.toString(StandardCharsets.US_ASCII.name());
            String statusLine = headersText.split("\r\n")[0];
            if (!statusLine.contains("101")) {
                if (allowRetry && statusLine.contains("403")) {
                    for (String line : headersText.split("\r\n")) {
                        if (line.toLowerCase(Locale.US).startsWith("date:")) {
                            String dateVal = line.substring(5).trim();
                            SimpleDateFormat sdf = new SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss z", Locale.US);
                            sdf.setTimeZone(TimeZone.getTimeZone("GMT"));
                            Date serverDate = sdf.parse(dateVal);
                            if (serverDate != null) {
                                clockSkewSeconds += (serverDate.getTime() / 1000L) - (System.currentTimeMillis() / 1000L);
                                return fetchEdgeNeuralMp3(text, voice, lang, rate, false);
                            }
                        }
                    }
                }
                throw new IOException("Edge TTS handshake failed: " + statusLine);
            }

            SimpleDateFormat tsFmt = new SimpleDateFormat("EEE MMM dd yyyy HH:mm:ss 'GMT+0000 (Coordinated Universal Time)'", Locale.US);
            tsFmt.setTimeZone(TimeZone.getTimeZone("UTC"));
            String ts = tsFmt.format(new Date());

            String cfgMsg = "X-Timestamp:" + ts + "\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n"
                + "{\"context\":{\"synthesis\":{\"audio\":{\"metadataoptions\":{\"sentenceBoundaryEnabled\":\"false\",\"wordBoundaryEnabled\":\"false\"},\"outputFormat\":\"audio-24khz-48kbitrate-mono-mp3\"}}}}\r\n";
            sendWsText(out, random, cfgMsg);

            String xmlLang = "en".equalsIgnoreCase(lang) ? "en-US" : "fr-FR";
            int ratePct = (int) Math.round((rate - 1.0) * 100.0);
            String rateStr = (ratePct >= 0 ? "+" : "") + ratePct + "%";
            String safeVoice = (voice == null || voice.isEmpty()) ? ("en".equalsIgnoreCase(lang) ? "en-US-EmmaMultilingualNeural" : "fr-FR-VivienneMultilingualNeural") : voice;
            String reqId = UUID.randomUUID().toString().replace("-", "");
            String ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='" + xmlLang + "'>"
                + "<voice name='" + escapeXml(safeVoice) + "'><prosody rate='" + rateStr + "'>"
                + escapeXml(text) + "</prosody></voice></speak>";
            String ssmlMsg = "X-RequestId:" + reqId + "\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:" + ts + "\r\nPath:ssml\r\n\r\n" + ssml;
            sendWsText(out, random, ssmlMsg);

            ByteArrayOutputStream mp3Out = new ByteArrayOutputStream(32768);
            while (true) {
                byte[] h2 = readExact(in, 2);
                if (h2 == null) break;
                int op = h2[0] & 0x0F;
                boolean masked = (h2[1] & 0x80) != 0;
                long plen = h2[1] & 0x7F;
                if (plen == 126) {
                    byte[] ex = readExact(in, 2);
                    if (ex == null) break;
                    plen = ((ex[0] & 0xFF) << 8) | (ex[1] & 0xFF);
                } else if (plen == 127) {
                    byte[] ex = readExact(in, 8);
                    if (ex == null) break;
                    plen = 0;
                    for (int i = 0; i < 8; i++) plen = (plen << 8) | (ex[i] & 0xFF);
                }
                byte[] maskKey = masked ? readExact(in, 4) : null;
                byte[] pl = plen > 0 ? readExact(in, (int) plen) : new byte[0];
                if (pl == null) break;
                if (masked && maskKey != null) {
                    for (int i = 0; i < pl.length; i++) pl[i] ^= maskKey[i % 4];
                }
                if (op == 2 && pl.length > 2) {
                    int hl = ((pl[0] & 0xFF) << 8) | (pl[1] & 0xFF);
                    if (pl.length > 2 + hl) {
                        mp3Out.write(pl, 2 + hl, pl.length - (2 + hl));
                    }
                } else if (op == 1) {
                    String txt = new String(pl, StandardCharsets.UTF_8);
                    if (txt.contains("Path:turn.end")) break;
                } else if (op == 8) {
                    break;
                }
            }
            return mp3Out.toByteArray();
        }
    }

    @PluginMethod
    public void synthesizeEdgeNeural(PluginCall call) {
        String text = call.getString("text", "");
        String voice = call.getString("voice", "fr-FR-VivienneMultilingualNeural");
        String lang = call.getString("lang", "fr");
        Double rateVal = call.getDouble("rate", 1.0);
        double rate = rateVal != null ? rateVal : 1.0;

        if (text == null || text.trim().isEmpty()) {
            call.reject("Text is empty");
            return;
        }

        executor.execute(() -> {
            try {
                byte[] mp3 = fetchEdgeNeuralMp3(text, voice, lang, rate, true);
                if (mp3 == null || mp3.length < 100) {
                    call.reject("Empty audio from Edge Neural TTS");
                    return;
                }
                JSObject ret = new JSObject();
                ret.put("audioBase64", Base64.encodeToString(mp3, Base64.NO_WRAP));
                ret.put("mimeType", "audio/mpeg");
                ret.put("engine", "edge-neural");
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Edge Neural TTS error: " + e.getMessage());
            }
        });
    }

    // ======================================================================
    // 2. Android Native TextToSpeech (Google Neural Voices Offline/Online)
    // ======================================================================

    private void ensureNativeTts(Runnable onReady, Runnable onFailed) {
        synchronized (ttsLock) {
            if (nativeTts != null && nativeTtsReady) {
                onReady.run();
                return;
            }
        }
        Context ctx = getContext();
        TextToSpeech.OnInitListener listener = status -> {
            if (status == TextToSpeech.SUCCESS) {
                synchronized (ttsLock) {
                    nativeTtsReady = true;
                    if (nativeTts != null) {
                        nativeTts.setAudioAttributes(new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build());
                        nativeTts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                            @Override
                            public void onStart(String utteranceId) {
                                JSObject data = new JSObject();
                                data.put("utteranceId", utteranceId);
                                notifyListeners("nativeTtsStart", data);
                            }

                            @Override
                            public void onDone(String utteranceId) {
                                JSObject data = new JSObject();
                                data.put("utteranceId", utteranceId);
                                notifyListeners("nativeTtsDone", data);
                            }

                            @Override
                            @Deprecated
                            public void onError(String utteranceId) {
                                JSObject data = new JSObject();
                                data.put("utteranceId", utteranceId);
                                notifyListeners("nativeTtsError", data);
                            }

                            @Override
                            public void onError(String utteranceId, int errorCode) {
                                JSObject data = new JSObject();
                                data.put("utteranceId", utteranceId);
                                data.put("errorCode", errorCode);
                                notifyListeners("nativeTtsError", data);
                            }
                        });
                    }
                }
                onReady.run();
            } else {
                onFailed.run();
            }
        };

        try {
            nativeTts = new TextToSpeech(ctx, listener, "com.google.android.tts");
        } catch (Throwable t) {
            nativeTts = new TextToSpeech(ctx, listener);
        }
    }

    private Voice pickBestAndroidVoice(TextToSpeech tts, String langCode, String requestedVoiceName) {
        if (tts == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) return null;
        try {
            Set<Voice> voices = tts.getVoices();
            if (voices == null || voices.isEmpty()) return null;
            String prefix = "en".equalsIgnoreCase(langCode) ? "en" : "fr";
            Voice best = null;
            int bestScore = Integer.MIN_VALUE;

            for (Voice v : voices) {
                if (v == null || v.getLocale() == null) continue;
                String vLang = v.getLocale().getLanguage().toLowerCase(Locale.US);
                if (!vLang.startsWith(prefix)) continue;

                int score = 0;
                if (requestedVoiceName != null && !requestedVoiceName.isEmpty() && v.getName().equalsIgnoreCase(requestedVoiceName)) {
                    score += 1000;
                }
                if (v.getQuality() >= Voice.QUALITY_VERY_HIGH) score += 100;
                else if (v.getQuality() >= Voice.QUALITY_HIGH) score += 60;
                else if (v.getQuality() >= Voice.QUALITY_NORMAL) score += 20;

                String nameLower = v.getName().toLowerCase(Locale.US);
                if (nameLower.contains("neural") || nameLower.contains("wavenet") || nameLower.contains("studio")) score += 55;
                if (nameLower.contains("network")) score += 35;
                if (nameLower.contains("legacy") || nameLower.contains("compact")) score -= 50;
                if ("fr".equals(prefix) && "FR".equalsIgnoreCase(v.getLocale().getCountry())) score += 25;
                if ("en".equals(prefix) && "US".equalsIgnoreCase(v.getLocale().getCountry())) score += 25;

                if (score > bestScore) {
                    bestScore = score;
                    best = v;
                }
            }
            return best;
        } catch (Throwable ignored) {
            return null;
        }
    }

    @PluginMethod
    public void speakNative(PluginCall call) {
        String text = call.getString("text", "");
        String lang = call.getString("lang", "fr");
        String voiceName = call.getString("voiceName", "");
        Double rateVal = call.getDouble("rate", 1.0);
        String utteranceId = call.getString("utteranceId", "utt-" + System.currentTimeMillis());

        if (text == null || text.trim().isEmpty()) {
            call.reject("Text is empty");
            return;
        }

        ensureNativeTts(() -> {
            try {
                Locale locale = "en".equalsIgnoreCase(lang) ? Locale.US : Locale.FRANCE;
                nativeTts.setLanguage(locale);
                Voice bestVoice = pickBestAndroidVoice(nativeTts, lang, voiceName);
                if (bestVoice != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    nativeTts.setVoice(bestVoice);
                }
                nativeTts.setSpeechRate(rateVal != null ? rateVal.floatValue() : 1.0f);
                Bundle params = new Bundle();
                params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId);
                int res = nativeTts.speak(text, TextToSpeech.QUEUE_FLUSH, params, utteranceId);
                JSObject ret = new JSObject();
                ret.put("started", res == TextToSpeech.SUCCESS);
                ret.put("utteranceId", utteranceId);
                ret.put("voice", bestVoice != null ? bestVoice.getName() : "default");
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Native TTS speak error: " + e.getMessage());
            }
        }, () -> call.reject("Native Android TextToSpeech initialization failed"));
    }

    @PluginMethod
    public void stopNative(PluginCall call) {
        try {
            if (nativeTts != null) {
                nativeTts.stop();
            }
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void getNativeVoices(PluginCall call) {
        String lang = call.getString("lang", "fr");
        ensureNativeTts(() -> {
            JSArray arr = new JSArray();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP && nativeTts.getVoices() != null) {
                String prefix = "en".equalsIgnoreCase(lang) ? "en" : "fr";
                for (Voice v : nativeTts.getVoices()) {
                    if (v != null && v.getLocale() != null && v.getLocale().getLanguage().toLowerCase(Locale.US).startsWith(prefix)) {
                        JSObject obj = new JSObject();
                        obj.put("name", v.getName());
                        obj.put("locale", v.getLocale().toLanguageTag());
                        obj.put("quality", v.getQuality());
                        obj.put("network", v.isNetworkConnectionRequired());
                        arr.put(obj);
                    }
                }
            }
            JSObject ret = new JSObject();
            ret.put("voices", arr);
            call.resolve(ret);
        }, () -> {
            JSObject ret = new JSObject();
            ret.put("voices", new JSArray());
            call.resolve(ret);
        });
    }

    @Override
    protected void handleOnDestroy() {
        try {
            if (nativeTts != null) {
                nativeTts.stop();
                nativeTts.shutdown();
                nativeTts = null;
                nativeTtsReady = false;
            }
            executor.shutdownNow();
        } catch (Throwable ignored) {}
        super.handleOnDestroy();
    }
}
