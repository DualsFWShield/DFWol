/**
 * Cloudflare Worker optionnel pour héberger un proxy CORS dédié à votre PWA DFWol.
 * Déployez ce fichier sur Cloudflare Workers, puis collez son URL dans DFWol -> Atelier -> Proxy personnalisé.
 */
const ALLOWED_HOSTS = new Set([
  "wol.jw.org",
  "www.jw.org",
  "b.jw-cdn.org",
  "cfp2.jw-cdn.org",
  "cms-imgp.jw-cdn.org"
]);

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
      headers: { "User-Agent": "Mozilla/5.0 DFWolStudio/3.0" },
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
