#!/usr/bin/env node
// CDP driver for stageclock (Tauri + WebView2 on Windows).
// Run from the project root: node .claude/skills/run-stageclock/driver.mjs <cmd> [...args]
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CDP_PORT = 9222;
const VITE_PORT = 1420;
const STATE_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), ".driver-state.json");
const PROJECT_ROOT = process.cwd();
const EXE_PATH = path.join(PROJECT_ROOT, "src-tauri", "target", "debug", "stageclock.exe");

function loadState() {
  return existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : {};
}
function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function waitFor(check, { timeoutMs = 20000, intervalMs = 300 } = {}) {
  const start = Date.now();
  for (;;) {
    try {
      const result = await check();
      if (result) return result;
    } catch {
      // not ready yet
    }
    if (Date.now() - start > timeoutMs) throw new Error("timed out waiting for condition");
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

async function listTargets() {
  const res = await fetch(`http://localhost:${CDP_PORT}/json/list`);
  return res.json();
}

/** which: "main" (default) or "popout" */
async function findTarget(which = "main") {
  const targets = (await listTargets()).filter((t) => t.type === "page");
  const target =
    which === "popout"
      ? targets.find((t) => t.url.includes("popout.html"))
      : targets.find((t) => !t.url.includes("popout.html"));
  if (!target) {
    throw new Error(
      `no "${which}" target. Open targets: ${targets.map((t) => `${t.title} <${t.url}>`).join(", ") || "(none)"}`
    );
  }
  return target;
}

function connectWs(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.addEventListener("open", () => resolve(ws));
    ws.addEventListener("error", reject);
  });
}

let msgId = 0;
function sendCdp(ws, method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve) => {
    const handler = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id === id) {
        ws.removeEventListener("message", handler);
        resolve(msg);
      }
    };
    ws.addEventListener("message", handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluateOn(which, expression) {
  const target = await findTarget(which);
  const ws = await connectWs(target.webSocketDebuggerUrl);
  const res = await sendCdp(ws, "Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  ws.close();
  if (res.result?.exceptionDetails) {
    throw new Error(`JS exception: ${JSON.stringify(res.result.exceptionDetails)}`);
  }
  return res.result?.result?.value;
}

async function screenshotOf(which, outPath) {
  const target = await findTarget(which);
  const ws = await connectWs(target.webSocketDebuggerUrl);
  const res = await sendCdp(ws, "Page.captureScreenshot", { format: "png" });
  ws.close();
  const buf = Buffer.from(res.result.data, "base64");
  writeFileSync(outPath, buf);
  return buf.length;
}

function killTree(pid) {
  return new Promise((resolve) => {
    if (!pid) return resolve();
    const p = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    p.on("close", () => resolve());
    p.on("error", () => resolve());
  });
}

async function cmdLaunch() {
  const state = loadState();

  let viteUp = false;
  try {
    viteUp = (await fetch(`http://localhost:${VITE_PORT}/`)).ok;
  } catch {
    viteUp = false;
  }

  if (!viteUp) {
    // Spawn Vite's JS entry point directly with `node`, not `npm run dev` —
    // npm on Windows resolves to npm.cmd, and spawning a .cmd file without
    // shell:true fails with EINVAL (and shell:true on npm triggers a Node
    // deprecation warning for unescaped args). node + a .js entry point
    // sidesteps both.
    const viteBin = path.join(PROJECT_ROOT, "node_modules", "vite", "bin", "vite.js");
    const vite = spawn(process.execPath, [viteBin], {
      cwd: PROJECT_ROOT,
      detached: true,
      stdio: "ignore",
    });
    vite.unref();
    state.vitePid = vite.pid;
    await waitFor(async () => (await fetch(`http://localhost:${VITE_PORT}/`)).ok);
    console.log(`vite dev server up (pid ${vite.pid})`);
  } else {
    console.log("vite dev server already running");
  }

  if (!existsSync(EXE_PATH)) {
    throw new Error(`${EXE_PATH} not found. Build it first: cd src-tauri && cargo build`);
  }

  const app = spawn(EXE_PATH, [], {
    cwd: PROJECT_ROOT,
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${CDP_PORT}`,
    },
  });
  app.unref();
  state.appPid = app.pid;
  saveState(state);

  await waitFor(async () => (await listTargets()).some((t) => t.type === "page"));
  console.log(`stageclock launched (pid ${app.pid}), CDP ready on :${CDP_PORT}`);
}

async function cmdQuit() {
  const state = loadState();
  await killTree(state.appPid);
  await killTree(state.vitePid);
  saveState({});
  console.log("stopped");
}

const [, , cmd, ...args] = process.argv;

switch (cmd) {
  case "launch":
    await cmdLaunch();
    break;
  case "targets": {
    const targets = await listTargets();
    console.log(targets.map((t) => `${t.title}\t${t.url}`).join("\n") || "(no targets)");
    break;
  }
  case "eval": {
    const [which, expr] = args;
    console.log(await evaluateOn(which, expr));
    break;
  }
  case "click": {
    const [which, selector] = args;
    console.log(await evaluateOn(which, `document.querySelector(${JSON.stringify(selector)}).click(); 'ok'`));
    break;
  }
  case "screenshot": {
    const [which, outPath] = args;
    const bytes = await screenshotOf(which, outPath);
    console.log(`wrote ${outPath} (${bytes} bytes)`);
    break;
  }
  case "quit":
    await cmdQuit();
    break;
  default:
    console.log("usage: node driver.mjs <launch|targets|eval|click|screenshot|quit> [...args]");
    console.log('  eval/click/screenshot take a target as first arg: "main" or "popout"');
    process.exit(1);
}
