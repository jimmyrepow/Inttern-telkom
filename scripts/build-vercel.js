const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist");

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
fs.copyFileSync(path.join(root, "index.html"), path.join(output, "index.html"));
if (fs.existsSync(path.join(root, "sw.js"))) {
  fs.copyFileSync(path.join(root, "sw.js"), path.join(output, "sw.js"));
}
fs.cpSync(path.join(root, "assets"), path.join(output, "assets"), {
  recursive: true
});
