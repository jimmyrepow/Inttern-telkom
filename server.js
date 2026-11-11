const http = require("http");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const root = __dirname;
const port = Number(process.env.PORT || 5500);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

function send(res, status, body, type) {
  res.writeHead(status, {
    "Content-Type": type || "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin"
  });
  res.end(body);
}

function isPublicPath(urlPath) {
  return urlPath === "/" || urlPath === "/index.html" || urlPath.startsWith("/assets/");
}

const server = http.createServer((request, response) => {
  const rawPath = (request.url || "/").split("?")[0];
  let urlPath;

  try {
    urlPath = decodeURIComponent(rawPath);
  } catch (error) {
    send(response, 400, "Permintaan tidak valid.");
    return;
  }

  if (!isPublicPath(urlPath)) {
    send(response, 404, "Tidak ditemukan.");
    return;
  }

  const filePath = path.resolve(root, "." + (urlPath === "/" ? "/index.html" : urlPath));
  if (!filePath.startsWith(root + path.sep)) {
    send(response, 403, "Akses ditolak.");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      send(response, 404, "Tidak ditemukan.");
      return;
    }
    const extension = path.extname(filePath).toLowerCase();
    send(response, 200, data, mimeTypes[extension] || "application/octet-stream");
  });
});

function openBrowser(url) {
  const command =
    process.platform === "win32"
      ? 'start "" "' + url + '"'
      : process.platform === "darwin"
        ? 'open "' + url + '"'
        : 'xdg-open "' + url + '"';
  exec(command, () => {});
}

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error("Port " + port + " sudah dipakai aplikasi lain.");
    console.error("Ubah PORT di .env ke angka lain, misalnya 5501, lalu jalankan ulang.");
    process.exit(1);
  }
  console.error(error.message);
  process.exit(1);
});

server.listen(port, () => {
  const url = "http://localhost:" + port;
  console.log("Website berjalan di " + url);
  console.log("Tekan Ctrl+C untuk menghentikan server.");
  if (process.argv.includes("--open")) {
    openBrowser(url);
  }
});
