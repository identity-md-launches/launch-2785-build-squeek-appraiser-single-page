import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
/** Start a static export under /preview/ for relative-URL verification. */
export function serve(root = resolve(import.meta.dirname, "../dist")) {
  const mime = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
    ".png": "image/png",
    ".json": "application/json",
  };
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (!url.pathname.startsWith("/preview/")) {
        res.writeHead(404).end("Use /preview/");
        return;
      }
      const rel = decodeURIComponent(url.pathname.slice("/preview/".length));
      let path = resolve(root, rel);
      if (path !== root && !path.startsWith(root + sep)) {
        res.writeHead(403).end();
        return;
      }
      if ((await stat(path)).isDirectory()) path = resolve(path, "index.html");
      const body = await readFile(path);
      res
        .writeHead(200, {
          "content-type": mime[extname(path)] ?? "application/octet-stream",
          "cache-control": "no-store",
        })
        .end(body);
    } catch {
      res.writeHead(404).end("Not found");
    }
  });
}
