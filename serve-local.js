// Temporary local dev static server for the Corridor Maintenance website.
// Run:  node serve-local.js   (from the repo root)
// Then open: http://localhost:8080
// Requires the backend API to be running on http://localhost:4000 (npm run dev in server/).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const PORT = 8080;
const ROOT = process.cwd();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
};

const server = http.createServer((req, res) => {
  let urlPath = new URL(req.url, `http://${req.headers.host}`).pathname;
  // Normalise: directory -> index.html
  let filePath = path.join(ROOT, urlPath === "/" ? "/index.html" : urlPath);
  // Security: prevent path traversal outside ROOT
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(ROOT) + path.sep) && resolved !== path.resolve(ROOT)) {
    res.writeHead(403); res.end("Forbidden"); return;
  }
  fs.readFile(resolved, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 Not Found");
      return;
    }
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`[serve-local] Frontend: http://localhost:${PORT}`);
  console.log(`[serve-local] Make sure backend is running: http://localhost:4000`);
});

server.on("error", (err) => {
  console.error("[serve-local] failed to start:", err.message);
  process.exit(1);
});
