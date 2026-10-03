// Backend for the Persian RTL UI extension.
//
// Accurately detects text direction using the Unicode Bidirectional Algorithm (UAX #9):
// - Persian/Arabic paragraphs: direction: rtl, text-align: right
// - English/Latin paragraphs: direction: ltr, text-align: left
// - Never applies RTL to outer containers or structural DIVs so English layout remains 100% intact.

import { readFileSync, existsSync } from 'node:fs';
import { createServer }             from 'node:http';
import { createConnection }         from 'node:net';
import { request as httpGet }       from 'node:http';
import { randomBytes }              from 'node:crypto';
import { dirname, join, extname }   from 'node:path';
import { homedir }                  from 'node:os';
import { fileURLToPath }            from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.ANTIGRAVITY_SIDECAR_WEB_PORT || '3737', 10);

// ─── CSS ─────────────────────────────────────────────────────────────────────

function buildCss() {
  return `
@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@100..900&display=swap');

/* Apply Vazirmatn Persian font globally without changing layout direction */
*, *::before, *::after {
  font-family: 'Vazirmatn', system-ui, -apple-system, 'Segoe UI', Roboto,
               'Helvetica Neue', Arial, sans-serif !important;
}

/* Specific leaf text elements in RTL */
p[dir="rtl"],
li[dir="rtl"],
blockquote[dir="rtl"],
h1[dir="rtl"], h2[dir="rtl"], h3[dir="rtl"],
h4[dir="rtl"], h5[dir="rtl"], h6[dir="rtl"],
dt[dir="rtl"], dd[dir="rtl"] {
  direction: rtl !important;
  text-align: right !important;
  unicode-bidi: isolate !important;
}

/* Specific leaf text elements in LTR */
p[dir="ltr"],
li[dir="ltr"],
blockquote[dir="ltr"],
h1[dir="ltr"], h2[dir="ltr"], h3[dir="ltr"],
h4[dir="ltr"], h5[dir="ltr"], h6[dir="ltr"],
dt[dir="ltr"], dd[dir="ltr"] {
  direction: ltr !important;
  text-align: left !important;
  unicode-bidi: isolate !important;
}

/* Inputs and contenteditable when RTL */
[contenteditable][dir="rtl"],
textarea[dir="rtl"],
input[dir="rtl"] {
  direction: rtl !important;
  text-align: right !important;
  unicode-bidi: plaintext !important;
}

/* Inputs and contenteditable when LTR */
[contenteditable][dir="ltr"],
textarea[dir="ltr"],
input[dir="ltr"] {
  direction: ltr !important;
  text-align: left !important;
  unicode-bidi: plaintext !important;
}

/* Persian Lists in RTL: bullets & numbers on the right */
ul[dir="rtl"],
ol[dir="rtl"] {
  direction: rtl !important;
  padding-right: 1.75rem !important;
  padding-left: 0 !important;
  margin-right: 0 !important;
  text-align: right !important;
}

/* Code blocks, numbers, monospaced text ALWAYS STAY LTR */
pre, code, kbd, samp,
[class*="code" i],
[class*="terminal" i],
pre *, code *, kbd * {
  direction: ltr !important;
  text-align: left !important;
  unicode-bidi: isolate !important;
  font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas,
               'Courier New', monospace !important;
}

/* Tables */
table[dir="rtl"] {
  direction: rtl !important;
}
table[dir="rtl"] th, table[dir="rtl"] td {
  text-align: right !important;
}

table[dir="ltr"] {
  direction: ltr !important;
}
table[dir="ltr"] th, table[dir="ltr"] td {
  text-align: left !important;
}
`;
}

// ─── DevTools port ────────────────────────────────────────────────────────────

function readDevToolsPort() {
  const f = join(homedir(), 'AppData', 'Roaming', 'Antigravity', 'DevToolsActivePort');
  if (!existsSync(f)) return null;
  try {
    const port = parseInt(readFileSync(f, 'utf8').trim().split('\n')[0].trim(), 10);
    return isNaN(port) ? null : port;
  } catch { return null; }
}

// ─── CDP helpers ──────────────────────────────────────────────────────────────

function cdpList(port) {
  return new Promise((resolve, reject) => {
    const req = httpGet({ hostname: '127.0.0.1', port, path: '/json/list' }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve([]); } });
    });
    req.on('error', reject);
    req.setTimeout(3000, () => req.destroy());
    req.end();
  });
}

function wsFrame(payload) {
  const len = payload.length;
  const mask = randomBytes(4);
  const masked = Buffer.alloc(len);
  for (let i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i % 4];

  let hdr;
  if (len < 126) {
    hdr = Buffer.from([0x81, 0x80 | len]);
  } else if (len < 65536) {
    hdr = Buffer.alloc(4);
    hdr[0] = 0x81;
    hdr[1] = 0x80 | 126;
    hdr.writeUInt16BE(len, 2);
  } else {
    hdr = Buffer.alloc(10);
    hdr[0] = 0x81;
    hdr[1] = 0x80 | 127;
    hdr.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([hdr, mask, masked]);
}

function cdpEval(wsUrl, expression) {
  const url = new URL(wsUrl);
  return new Promise(resolve => {
    const sock = createConnection({ host: url.hostname, port: parseInt(url.port, 10) });
    const key = randomBytes(16).toString('base64');
    let done = false, buf = Buffer.alloc(0), upgraded = false;
    const finish = v => { if (!done) { done = true; try { sock.destroy(); } catch {} resolve(v); } };

    sock.on('connect', () => {
      sock.write(
        `GET ${url.pathname} HTTP/1.1\r\nHost: ${url.host}\r\n` +
        `Upgrade: websocket\r\nConnection: Upgrade\r\n` +
        `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`
      );
    });

    sock.on('data', chunk => {
      buf = Buffer.concat([buf, chunk]);
      if (!upgraded) {
        const i = buf.indexOf('\r\n\r\n');
        if (i === -1) return;
        upgraded = true;
        buf = buf.slice(i + 4);
        sock.write(wsFrame(Buffer.from(JSON.stringify({
          id: 1, method: 'Runtime.evaluate',
          params: { expression, includeCommandLineAPI: false }
        }))));
      }

      while (buf.length >= 2) {
        let pl = buf[1] & 0x7f, off = 2;
        if (pl === 126) { if (buf.length < 4) break; pl = buf.readUInt16BE(2); off = 4; }
        else if (pl === 127) { if (buf.length < 10) break; pl = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (buf.length < off + pl) break;
        const payload = buf.slice(off, off + pl);
        buf = buf.slice(off + pl);
        try { finish(JSON.parse(payload.toString('utf8'))); return; } catch {}
      }
    });

    sock.on('error', () => finish(null));
    sock.on('close',  () => finish(null));
    setTimeout(() => finish(null), 5000);
  });
}

// ─── Injection Payload ────────────────────────────────────────────────────────

const JS = `(function() {
  // 1. Inject or update CSS
  var styleId = '__persian_rtl_styles__';
  var styleEl = document.getElementById(styleId);
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    (document.head || document.documentElement).appendChild(styleEl);
  }
  styleEl.textContent = ${JSON.stringify(buildCss())};

  // 2. Clean up any accidental dir attributes on structural wrapper elements
  var wrongElements = document.querySelectorAll('div[dir="rtl"], span[dir="rtl"], section[dir="rtl"], main[dir="rtl"], nav[dir="rtl"], aside[dir="rtl"]');
  for (var w = 0; w < wrongElements.length; w++) {
    var elW = wrongElements[w];
    if (!elW.isContentEditable) {
      elW.removeAttribute('dir');
      elW.style.direction = '';
      elW.style.textAlign = '';
    }
  }

  // 3. Strict First Strong Character Detection (UAX #9)
  var RTL_REGEX = /[\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF]/;
  var LTR_REGEX = /[A-Za-z\\u00C0-\\u024F\\u0400-\\u04FF]/;

  function getDirection(text) {
    if (!text || typeof text !== 'string') return null;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (RTL_REGEX.test(ch)) return 'rtl';
      if (LTR_REGEX.test(ch)) return 'ltr';
    }
    return null;
  }

  // 4. Process only leaf text elements and inputs
  function processNode(el) {
    if (!el || el.nodeType !== 1) return;
    var tag = el.tagName;

    // Never alter code, scripts, styles, buttons, icons
    if (tag === 'PRE' || tag === 'CODE' || tag === 'KBD' || tag === 'SCRIPT' || tag === 'STYLE' || tag === 'BUTTON' || tag === 'SVG') return;
    if (el.closest('pre') || el.closest('code')) return;

    // Editable textareas, inputs, contenteditable
    if (el.isContentEditable || tag === 'TEXTAREA' || tag === 'INPUT') {
      var val = el.innerText || el.value || '';
      var dirVal = getDirection(val);
      if (dirVal === 'rtl') {
        if (el.getAttribute('dir') !== 'rtl') el.setAttribute('dir', 'rtl');
      } else if (dirVal === 'ltr') {
        if (el.getAttribute('dir') !== 'ltr') el.setAttribute('dir', 'ltr');
      } else {
        if (el.getAttribute('dir') !== 'auto') el.setAttribute('dir', 'auto');
      }
      return;
    }

    // ONLY leaf-level block text elements:
    if (tag === 'P' || tag === 'LI' || tag === 'BLOCKQUOTE' || tag === 'H1' || tag === 'H2' || tag === 'H3' || tag === 'H4' || tag === 'H5' || tag === 'H6' || tag === 'DT' || tag === 'DD') {
      var text = el.innerText || el.textContent || '';
      var dir = getDirection(text);
      if (dir === 'rtl') {
        if (el.getAttribute('dir') !== 'rtl') el.setAttribute('dir', 'rtl');
      } else if (dir === 'ltr') {
        if (el.getAttribute('dir') !== 'ltr') el.setAttribute('dir', 'ltr');
      } else {
        el.removeAttribute('dir');
      }
    }
  }

  function scanAll(root) {
    var container = root || document;
    var editables = container.querySelectorAll('textarea, input, [contenteditable]');
    for (var i = 0; i < editables.length; i++) processNode(editables[i]);
    var textNodes = container.querySelectorAll('p, li, blockquote, h1, h2, h3, h4, h5, h6, dt, dd');
    for (var j = 0; j < textNodes.length; j++) processNode(textNodes[j]);
  }

  scanAll(document);

  if (!window.__persian_rtl_active__) {
    window.__persian_rtl_active__ = true;

    document.addEventListener('input', function(e) {
      if (e.target) processNode(e.target);
    }, true);

    document.addEventListener('keyup', function(e) {
      if (e.target && (e.target.isContentEditable || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) {
        processNode(e.target);
      }
    }, true);

    var observer = new MutationObserver(function(mutations) {
      for (var m = 0; m < mutations.length; m++) {
        var mut = mutations[m];
        if (mut.addedNodes) {
          for (var a = 0; a < mut.addedNodes.length; a++) {
            var n = mut.addedNodes[a];
            if (n.nodeType === 1) {
              processNode(n);
              var children = n.querySelectorAll ? n.querySelectorAll('p, li, blockquote, h1, h2, h3, h4, h5, h6, textarea, input, [contenteditable]') : [];
              for (var c = 0; c < children.length; c++) processNode(children[c]);
            }
          }
        }
        if (mut.type === 'characterData' && mut.target && mut.target.parentElement) {
          processNode(mut.target.parentElement);
        }
      }
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }
})();`;

async function inject() {
  const port = readDevToolsPort();
  if (!port) return;
  let targets;
  try { targets = await cdpList(port); } catch { return; }
  if (!Array.isArray(targets)) return;
  let n = 0;
  for (const t of targets) {
    if (!t.webSocketDebuggerUrl) continue;
    try { await cdpEval(t.webSocketDebuggerUrl, JS); n++; } catch {}
  }
  if (n) console.log(`[persian-rtl] injected into ${n} target(s)`);
}

// Auto-inject on start and every 6 s.
inject().catch(() => {});
setInterval(() => inject().catch(() => {}), 6000);

// ─── Minimal HTTP server ──────────────────────────────────────────────────────

const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
               '.svg':'image/svg+xml', '.json':'application/json' };

const TOKEN = process.env.ANTIGRAVITY_SIDECAR_UI_TOKEN;

createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;

  if (path === '/preload.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    res.end(`
window.sidecar = {
  conversationId: null,
  fetch: (u, opts) => fetch(u, { ...opts, headers: { ...(opts && opts.headers), 'X-Sidecar-Token': '${TOKEN || ''}', 'Content-Type': 'application/json' } }),
  agent: { sendMessage: () => Promise.resolve(), startConversation: () => Promise.resolve() },
  ui: { toggleAuxPane: () => {} },
};
`);
    return;
  }

  if (path.startsWith('/_sidecar/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{}');
    return;
  }

  if (path === '/api/status') {
    inject().catch(() => {});
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, at: new Date().toISOString() }));
    return;
  }

  const fileMap = {
    '/':          'index.html',
    '/index.html':'index.html',
    '/app.js':    'app.js',
    '/styles.css':'styles.css',
    '/inject.css':'inject.css',
  };
  const fname = fileMap[path];
  if (fname) {
    try {
      const content = readFileSync(join(HERE, fname));
      const ext = extname(fname);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
      res.end(content);
    } catch {
      res.writeHead(500); res.end('Read error');
    }
    return;
  }

  res.writeHead(404); res.end('Not found');
}).listen(PORT, '127.0.0.1', () => {
  console.log(`[persian-rtl] server listening on port ${PORT}`);
});
