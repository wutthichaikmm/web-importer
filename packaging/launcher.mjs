import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import sea from "node:sea";
import express from "express";

import { createApp } from "../server.js";
import { cleanupStaleFlare } from "./process-guard.mjs";

const FLARE_PORT = Number(process.env.WI_FLARE_PORT || 8191);
const WEB_PORT = Number(process.env.WI_WEB_PORT || 8787);
const FLARE_START_TIMEOUT_MS = 90000;
const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

const dataDirectory = join(process.env.LOCALAPPDATA || dirname(process.execPath), "Web Importer");
const pidFile = join(dataDirectory, "flaresolverr.pid");

const log = (message) => console.log(`[Web Importer] ${message}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function killTree(pid) {
  try {
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  } catch {
    // The process already exited.
  }
}

function isFlareProcess(pid) {
  try {
    const output = execFileSync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], {
      encoding: "utf8",
    });
    return output.toLowerCase().includes('"flaresolverr.exe"');
  } catch {
    return false;
  }
}

async function isFlareUp(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, {
      signal: AbortSignal.timeout(1500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = createServer().once("error", () => resolve(false));
    probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(true)));
  });
}

let flareProcess = null;

function stopFlare() {
  if (!flareProcess?.pid) return;
  killTree(flareProcess.pid);
  flareProcess = null;
  rmSync(pidFile, { force: true });
}

async function ensureFlare() {
  if (await isFlareUp(FLARE_PORT)) {
    log(`พบ FlareSolverr ที่เปิดอยู่แล้วที่พอร์ต ${FLARE_PORT} จะใช้ตัวนั้น`);
    return FLARE_PORT;
  }

  const executable = join(dirname(process.execPath), "flaresolverr", "flaresolverr.exe");
  if (!existsSync(executable)) throw new Error(`ไม่พบ FlareSolverr ที่ ${executable}`);

  const port = (await isPortFree(FLARE_PORT)) ? FLARE_PORT : FLARE_PORT + 1;
  log(`กำลังเปิด FlareSolverr (พอร์ต ${port}) ครั้งแรกอาจใช้เวลาสักครู่...`);
  flareProcess = spawn(executable, [], {
    cwd: dirname(executable),
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
    windowsHide: true,
  });
  flareProcess.once("exit", () => {
    flareProcess = null;
  });
  mkdirSync(dataDirectory, { recursive: true });
  writeFileSync(pidFile, String(flareProcess.pid));

  for (let waited = 0; waited < FLARE_START_TIMEOUT_MS; waited += 1000) {
    if (!flareProcess) throw new Error("FlareSolverr ปิดตัวเองก่อนพร้อมใช้งาน");
    if (await isFlareUp(port)) return port;
    await sleep(1000);
  }
  throw new Error("FlareSolverr เปิดไม่สำเร็จภายใน 90 วินาที");
}

function embeddedAssets() {
  const router = express.Router();
  router.use((request, response, next) => {
    if (request.method !== "GET" && request.method !== "HEAD") return next();
    const name = request.path === "/" ? "index.html" : request.path.slice(1);
    let body;
    try {
      body = Buffer.from(sea.getRawAsset(name));
    } catch {
      return next();
    }
    const extension = name.slice(name.lastIndexOf("."));
    response.type(CONTENT_TYPES[extension] ?? "application/octet-stream").send(body);
  });
  return router;
}

async function main() {
  cleanupStaleFlare({
    readPidFile: () => readFileSync(pidFile, "utf8"),
    removePidFile: () => rmSync(pidFile, { force: true }),
    isFlareProcess,
    killTree,
  });

  const flarePort = await ensureFlare();
  process.env.FLARESOLVERR_URL = `http://127.0.0.1:${flarePort}`;

  const app = express();
  app.use(embeddedAssets());
  app.use(createApp());

  let port = WEB_PORT;
  while (!(await isPortFree(port))) port += 1;
  await new Promise((resolve) => app.listen(port, "127.0.0.1", resolve));

  const url = `http://127.0.0.1:${port}`;
  log(`พร้อมใช้งานที่ ${url}  (ปิดหน้าต่างนี้เพื่อหยุดโปรแกรม)`);
  if (!process.env.WEB_IMPORTER_NO_BROWSER) {
    spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", windowsHide: true });
  }
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) {
  process.on(signal, () => {
    stopFlare();
    process.exit(0);
  });
}
process.on("exit", stopFlare);

main().catch((error) => {
  console.error(`[Web Importer] ${error.message}`);
  stopFlare();
  // Keep the window open long enough to read the message.
  setTimeout(() => process.exit(1), 20000);
});
