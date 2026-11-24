/**
 * Serveur de développement Node.js sans dépendances externes pour DFWol Studio.
 * Sert les fichiers statiques + /api/proxy?url=... pour WOL.jw.org et JW.org.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT) || 8080;
const ROOT = path.resolve(__dirname, "..");
const ALLOWED_HOSTS = new Set([
  "wol.jw.org",
  "www.jw.org",
  "b.jw-cdn.org",
  "cfp2.jw-cdn.org",
  "cms-imgp.jw-cdn.org"
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
        headers: { "User-Agent": "Mozilla/5.0 DFWolStudio/3.0" },
        redirect: "follow"
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
    if (!fullPath.startsWith(ROOT)) {
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
    res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Proxy Error: " + err.message);
  }
});

server.listen(PORT, () => {
  console.log(`[DFWol] Serveur actif sur http://localhost:${PORT}`);
});
