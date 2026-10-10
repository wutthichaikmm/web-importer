// Builds dist/installer/WebImporter-Setup.exe: bundles the app into a Node
// single-executable, adds the official FlareSolverr build, and runs Inno Setup.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FLARESOLVERR = {
  version: "v3.5.2",
  sha256: "309abd7c821546325ae6c509b40d969c5e39034be2314d21b3f5e0517feda7a7",
};
const SEA_FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const cache = join(dist, ".cache");
const stage = join(dist, "app");
const work = join(dist, "build");
const zipPath = join(cache, `flaresolverr_${FLARESOLVERR.version}_windows_x64.zip`);

const step = (message) => console.log(`\n== ${message}`);

function sha256(path) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash("sha256");
    createReadStream(path).on("data", (chunk) => hash.update(chunk)).on("error", reject)
      .on("end", () => resolveHash(hash.digest("hex")));
  });
}

async function fetchFlareSolverr() {
  mkdirSync(cache, { recursive: true });
  if (!existsSync(zipPath) || (await sha256(zipPath)) !== FLARESOLVERR.sha256) {
    step(`Downloading FlareSolverr ${FLARESOLVERR.version} (about 360 MB)`);
    const url = `https://github.com/FlareSolverr/FlareSolverr/releases/download/${FLARESOLVERR.version}/flaresolverr_windows_x64.zip`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
    writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()));
  }
  const actual = await sha256(zipPath);
  if (actual !== FLARESOLVERR.sha256) {
    rmSync(zipPath, { force: true });
    throw new Error(`FlareSolverr checksum mismatch (got ${actual}); the download was discarded`);
  }
}

function bundleApp() {
  step("Bundling the app into a single executable");
  const publicDirectory = join(root, "public");
  return build({
    entryPoints: [join(root, "packaging", "launcher.mjs")],
    bundle: true, platform: "node", format: "cjs", target: "node24", logLevel: "warning",
    outfile: join(work, "app.cjs"), external: ["node:sea"],
    define: { "import.meta.url": JSON.stringify("file:///C:/app/server.js") },
  }).then(() => {
    const assets = Object.fromEntries(
      readdirSync(publicDirectory).map((name) => [name, join(publicDirectory, name)]),
    );
    const config = join(work, "sea-config.json");
    writeFileSync(config, JSON.stringify({
      main: join(work, "app.cjs"), output: join(work, "sea-prep.blob"),
      disableExperimentalSEAWarning: true, assets,
    }));
    execFileSync(process.execPath, ["--experimental-sea-config", config], { stdio: "inherit" });

    const exe = join(stage, "WebImporter.exe");
    copyFileSync(process.execPath, exe);
    execFileSync(process.execPath, [
      join(root, "node_modules", "postject", "dist", "cli.js"), exe, "NODE_SEA_BLOB",
      join(work, "sea-prep.blob"), "--sentinel-fuse", SEA_FUSE,
    ], { stdio: "inherit" });
  });
}

function findInnoSetup() {
  const candidates = [
    process.env.INNO_SETUP_COMPILER,
    join(process.env.LOCALAPPDATA ?? "", "Programs", "Inno Setup 7", "ISCC.exe"),
    join(process.env.LOCALAPPDATA ?? "", "Programs", "Inno Setup 6", "ISCC.exe"),
    "C:\Program Files (x86)\Inno Setup 7\ISCC.exe",
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
  ];
  const found = candidates.find((path) => path && existsSync(path));
  if (!found) {
    throw new Error("Inno Setup compiler not found. Install Inno Setup or set INNO_SETUP_COMPILER to ISCC.exe");
  }
  return found;
}

const innoSetup = findInnoSetup();
await fetchFlareSolverr();

rmSync(stage, { recursive: true, force: true });
rmSync(work, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
mkdirSync(work, { recursive: true });

step("Extracting FlareSolverr");
// Windows bsdtar reads zip files; GNU tar (Git Bash) misreads "E:" as a remote host.
execFileSync(join(process.env.SystemRoot ?? "C:\Windows", "System32", "tar.exe"), ["-xf", zipPath, "-C", stage], { stdio: "inherit" });
if (!existsSync(join(stage, "flaresolverr", "flaresolverr.exe"))) {
  throw new Error("Unexpected FlareSolverr archive layout: flaresolverr/flaresolverr.exe not found");
}

await bundleApp();

step("Building the installer (this compresses about 900 MB and takes a few minutes)");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
execFileSync(innoSetup, [
  `/DAppVersion=${version}`, `/DSourceDir=${stage}`, join(root, "packaging", "installer.iss"),
], { stdio: "inherit" });

console.log(`\nDone: ${join(dist, "installer", "WebImporter-Setup.exe")}`);
