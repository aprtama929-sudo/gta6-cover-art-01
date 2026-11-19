// Panel Pop screenshot driver.
//
// Serves app/ from a tiny built-in static server, drives the headless
// Chrome shell over the DevTools protocol (no libraries, just a
// WebSocket), waits for each scene in shots.json to paint and raise
// window.__shotReady, and saves JPEG captures into screenshots/.
// A capture that would exceed the 256 KiB dossier cap is retaken at a
// lower quality until it fits. The run fails if the page logs a console
// error, throws, or asks for anything beyond this machine.

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appDir = path.join(repoDir, 'app');
const shotsFile = path.join(repoDir, 'shots.json');
const outDir = path.join(repoDir, 'screenshots');
const MAX_BYTES = 262144;

const CHROME = process.env.CHROME_BIN || process.env.CHROME ||
  '/home/hatch/workspace/makefun/tools-chrome/chrome-headless-shell-linux64/chrome-headless-shell';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// A one-pixel PNG so the browser's automatic favicon request stays quiet.
const FAVICON = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

function serveApp() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/favicon.ico') {
      res.writeHead(200, { 'content-type': 'image/png' });
      res.end(FAVICON);
      return;
    }
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const file = path.join(appDir, rel);
    if (!file.startsWith(appDir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, method = 'GET') {
  const res = await fetch(url, { method });
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}`);
  return res.json();
}

// Minimal CDP client: request/response by id plus an event hook.
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.onEvent = () => {};
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message}`));
        else resolve(msg.result);
      } else if (msg.method) {
        this.onEvent(msg.method, msg.params ?? {});
      }
    });
  }
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function openPage(debugPort) {
  let target;
  try {
    target = await fetchJson(`http://127.0.0.1:${debugPort}/json/new?about:blank`, 'PUT');
  } catch {
    target = await fetchJson(`http://127.0.0.1:${debugPort}/json/new?about:blank`);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  return new Cdp(ws);
}

async function waitReady(cdp, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await cdp.send('Runtime.evaluate', {
      expression: 'window.__shotReady === true',
      returnByValue: true,
    });
    if (r.result && r.result.value === true) return;
    await sleep(150);
  }
  throw new Error('scene never raised window.__shotReady');
}

async function captureScene(cdp, origin, scene) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: scene.w, height: scene.h, deviceScaleFactor: 1, mobile: false,
  });
  await cdp.send('Page.navigate', { url: `${origin}/index.html${scene.query}` });
  await waitReady(cdp);
  await sleep(250);
  let quality = 85;
  for (;;) {
    const shot = await cdp.send('Page.captureScreenshot', {
      format: 'jpeg', quality, fromSurface: true,
    });
    const bytes = Buffer.from(shot.data, 'base64');
    if (bytes.length <= MAX_BYTES || quality <= 40) {
      fs.writeFileSync(path.join(outDir, scene.name), bytes);
      return { name: scene.name, bytes: bytes.length, quality };
    }
    quality -= 7;
  }
}

async function main() {
  const scenes = JSON.parse(fs.readFileSync(shotsFile, 'utf8'));
  fs.mkdirSync(outDir, { recursive: true });
  const server = await serveApp();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const debugPort = 19000 + (process.pid % 900);
  const profile = fs.mkdtempSync(path.join(repoDir, '.shots-profile-'));
  const chrome = spawn(CHROME, [
    '--headless',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let chromeErr = '';
  chrome.stderr.on('data', (d) => { chromeErr += d; });

  const problems = [];
  const requestedUrls = [];
  try {
    // Wait for the debugging endpoint to answer.
    const deadline = Date.now() + 20000;
    for (;;) {
      try {
        await fetchJson(`http://127.0.0.1:${debugPort}/json/version`);
        break;
      } catch {
        if (Date.now() > deadline) throw new Error(`chrome did not start: ${chromeErr.slice(-400)}`);
        await sleep(200);
      }
    }
    const cdp = await openPage(debugPort);
    cdp.onEvent = (method, params) => {
      if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
        problems.push(`console error: ${(params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ')}`);
      } else if (method === 'Runtime.exceptionThrown') {
        problems.push(`exception: ${params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text ?? 'unknown'}`);
      } else if (method === 'Network.requestWillBeSent') {
        requestedUrls.push(params.request.url);
      }
    };
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');

    const results = [];
    for (const scene of scenes) {
      results.push(await captureScene(cdp, origin, scene));
    }
    for (const r of results) {
      console.log(`shots: ${r.name} ${r.bytes} bytes (jpeg q${r.quality})`);
    }
    const external = requestedUrls.filter((u) => !u.startsWith(origin) && !u.startsWith('data:'));
    console.log(`shots: ${requestedUrls.length} requests, all local: ${external.length === 0}`);
    if (external.length) problems.push(`external requests: ${external.join(', ')}`);
    if (problems.length) {
      console.error(`shots: FAILED\n${problems.join('\n')}`);
      process.exitCode = 1;
    } else {
      console.log('shots: no console errors, no exceptions');
    }
    cdp.ws.close();
  } finally {
    chrome.kill('SIGKILL');
    server.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(`shots: ${err.message}`);
  process.exit(1);
});
