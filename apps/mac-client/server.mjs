#!/usr/bin/env node
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const defaultPort = 5188;
const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

function parsePort() {
  const rawValue = process.argv[2] ?? process.env.LAN_DUAL_MAC_CLIENT_PORT ?? "";
  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) ? parsed : defaultPort;
}

function safeResolve(requestUrl) {
  const url = new URL(requestUrl, "http://127.0.0.1");
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const resolved = path.resolve(appDir, `.${pathname}`);
  if (!resolved.startsWith(appDir)) {
    return null;
  }
  return resolved;
}

const server = createServer(async (request, response) => {
  const filePath = safeResolve(request.url ?? "/");
  if (!filePath) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden\n");
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      throw new Error("not a file");
    }
    const extension = path.extname(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes.get(extension) ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found\n");
  }
});

const port = parsePort();
server.listen(port, "127.0.0.1", () => {
  console.log(`Mac client prototype: http://127.0.0.1:${port}/`);
});
