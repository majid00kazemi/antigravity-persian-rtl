// Backend for the Persian RTL UI extension.
//
// Automatically detects Persian text across the entire Antigravity application,
// dynamically applying RTL direction, proper alignment, list styles, and Vazirmatn font.
// Connects via Chrome DevTools Protocol (CDP) to the Electron renderer targets and keeps
// an active observer running in the page so typing or streaming Persian flips to RTL instantly.

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

/* Apply Vazirmatn Persian font globally */
*, *::before, *::after {
  font-family: 'Vazirmatn', system-ui, -apple-system, 'Segoe UI', Roboto,
               'Helvetica Neue', Arial, sans-serif !important;
}

/* RTL Elements - Direction & Alignment */
[dir="rtl"],
[dir="rtl"] p,
[dir="rtl"] span,
[dir="rtl"] div,
[dir="rtl"] h1,
[dir="rtl"] h2,
[dir="rtl"] h3,
[dir="rtl"] h4,
[dir="rtl"] h5,
[dir="rtl"] h6,
[dir="rtl"] blockquote {
  direction: rtl !important;
  text-align: right !important;
  unicode-bidi: isolate !important;
}

/* Contenteditable and Inputs when RTL */
[contenteditable][dir="rtl"],
textarea[dir="rtl"],
input[dir="rtl"] {
  direction: rtl !important;
  text-align: right !important;
  unicode-bidi: plaintext !important;
}

/* Persian Lists: Bullets / Numbers on the right side */
[dir="rtl"] ul,
[dir="rtl"] ol,
ul[dir="rtl"],
ol[dir="rtl"] {
  direction: rtl !important;
  padding-right: 1.75rem !important;
  padding-left: 0 !important;
  margin-right: 0 !important;
  text-align: right !important;
}

[dir="rtl"] li,
li[dir="rtl"] {
  direction: rtl !important;
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

/* Tables in RTL */
table[dir="rtl"],
[dir="rtl"] table {
  direction: rtl !important;
}
table[dir="rtl"] th, table[dir="rtl"] td,
[dir="rtl"] table th, [dir="rtl"] table td {
  text-align: right !important;
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
  var styleId = '__persian_rtl_styles__';
  var styleEl = document.getElementById(styleId);
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    (document.head || document.documentElement).appendChild(styleEl);
  }
  styleEl.textContent = ${JSON.stringify(buildCss())};

  var FA_REGEX = /[\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF]/;

  function hasPersian(str) {
    return typeof str === 'string' && FA_REGEX.test(str);
  }

  function startsWithPersian(str) {
    if (typeof str !== 'string') return false;
    var clean = str.replace(/^[\\s#*\\->0-9.:!?;()\\[\\]{}'"_\\/\\\\@$%^&+=\`~]+/, '');
    return clean.length > 0 && FA_REGEX.test(clean[0]);
  }

  function processElement(el) {
    if (!el || el.nodeType !== 1) return;
    var tag = el.tagName;
    if (tag === 'PRE' || tag === 'CODE' || tag === 'KBD' || tag === 'SCRIPT' || tag === 'STYLE') return;
    if (el.closest('pre') || el.closest('code')) return;

    if (el.isContentEditable || tag === 'TEXTAREA' || tag === 'INPUT') {
      var val = el.innerText || el.value || '';
      if (startsWithPersian(val) || (val.length > 0 && hasPersian(val))) {
        if (el.getAttribute('dir') !== 'rtl') el.setAttribute('dir', 'rtl');
      } else if (val.trim().length > 0) {
        if (el.getAttribute('dir') !== 'ltr') el.setAttribute('dir', 'ltr');
      } else {
        if (el.getAttribute('dir') !== 'auto') el.setAttribute('dir', 'auto');
      }
      return;
    }

    var text = el.innerText || el.textContent || '';
    if (hasPersian(text)) {
      if (startsWithPersian(text) || (text.length > 3 && hasPersian(text))) {
        if (el.getAttribute('dir') !== 'rtl') el.setAttribute('dir', 'rtl');
      }
    }
  }

  function scanAll(root) {
    var container = root || document;
    var editables = container.querySelectorAll('textarea, input, [contenteditable]');
    for (var i = 0; i < editables.length; i++) processElement(editables[i]);
    var blocks = container.querySelectorAll('p, li, blockquote, h1, h2, h3, h4, h5, h6, [class*="markdown"], [class*="message"], [class*="bubble"], [class*="turn"], [class*="content"]');
    for (var j = 0; j < blocks.length; j++) processElement(blocks[j]);
  }

  scanAll(document);

  if (!window.__persian_rtl_active__) {
    window.__persian_rtl_active__ = true;

    document.addEventListener('input', function(e) {
      if (e.target) processElement(e.target);
    }, true);

    document.addEventListener('keyup', function(e) {
      if (e.target && (e.target.isContentEditable || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) {
        processElement(e.target);
      }
    }, true);

    var observer = new MutationObserver(function(mutations) {
      for (var m = 0; m < mutations.length; m++) {
        var mut = mutations[m];
        if (mut.addedNodes) {
          for (var a = 0; a < mut.addedNodes.length; a++) {
            var n = mut.addedNodes[a];
            if (n.nodeType === 1) {
              processElement(n);
              var children = n.querySelectorAll ? n.querySelectorAll('p, li, blockquote, h1, h2, h3, h4, h5, h6, textarea, input, [contenteditable]') : [];
              for (var c = 0; c < children.length; c++) processElement(children[c]);
            }
          }
        }
        if (mut.type === 'characterData' && mut.target && mut.target.parentElement) {
          processElement(mut.target.parentElement);
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
