// Frontend logic for the Persian RTL extension.
//
// The key job of this script is to inject the Persian font + RTL CSS into the
// Antigravity HOST window. Since Electron renders the main window and the
// sidecar iframe shares the same origin (localhost), window.parent gives us
// direct DOM access to inject a <style> or <link> element.
//
// If cross-origin restrictions block window.parent, we fall back gracefully
// and show an info message in the panel.

const sidecar = window.sidecar;
const $ = (id) => document.getElementById(id);

// ─────────────────────────────────────────────────────────────────────────────
// CSS injection into the host window
// ─────────────────────────────────────────────────────────────────────────────

const INJECT_ID = 'persian-rtl-injected-styles';

/**
 * Builds the full CSS text to inject into the host window.
 * We inline everything rather than creating a <link> so it works offline.
 */
function buildCss() {
  return `
/* ── Persian RTL Plugin: injected by persian-rtl/panel ── */

/* 1. Load Vazirmatn from Google Fonts */
@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@100..900&display=swap');

/* 2. Apply Vazirmatn as first font in the stack — Latin falls through to the next font */
*,
*::before,
*::after {
  font-family: 'Vazirmatn', system-ui, -apple-system, 'Segoe UI', Roboto,
               'Helvetica Neue', Arial, sans-serif !important;
}

/* 3. Auto-detect direction in all text inputs */
textarea,
input[type="text"],
input[type="search"],
input:not([type]),
[contenteditable],
[role="textbox"] {
  unicode-bidi: plaintext !important;
  text-align: start !important;
}

/* 4. Chat message content — paragraph-level auto direction */
p,
li,
[class*="message" i],
[class*="bubble" i],
[class*="markdown" i],
[class*="response" i] {
  unicode-bidi: plaintext;
}

/* 5. Code blocks always stay LTR */
pre,
code,
kbd,
samp,
[class*="code" i] {
  direction: ltr !important;
  unicode-bidi: embed !important;
  text-align: left !important;
  font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas,
               'Courier New', monospace !important;
}
`;
}

/**
 * Injects the Persian RTL stylesheet into a given document.
 * Removes any previously injected version first (idempotent).
 */
function injectIntoDocument(doc) {
  // Remove old version if present.
  const existing = doc.getElementById(INJECT_ID);
  if (existing) existing.remove();

  const style = doc.createElement('style');
  style.id = INJECT_ID;
  style.textContent = buildCss();
  (doc.head || doc.documentElement).appendChild(style);
}

/**
 * Attempts to inject styles into the host (parent) window.
 * Returns { success, message }.
 */
function injectIntoHost() {
  // Same-document injection (the panel itself already has RTL via its own styles.css).
  injectIntoDocument(document);

  // Try parent window injection.
  try {
    const parentDoc = window.parent.document;
    if (!parentDoc) return { success: false, message: 'پنجره والد در دسترس نیست.' };
    injectIntoDocument(parentDoc);

    // Also try to reach grandparent if nested inside a shell frame.
    try {
      if (window.parent !== window.top) {
        injectIntoDocument(window.top.document);
      }
    } catch (_) {
      // Cross-origin grandparent — ignore.
    }

    return { success: true, message: 'فونت وزیرمتن و RTL با موفقیت در پنجره اصلی تزریق شدند! ✅' };
  } catch (err) {
    // Cross-origin or sandboxed — we cannot reach the parent DOM.
    return {
      success: false,
      message: `دسترسی به پنجره اصلی ممکن نبود (${err.message}). استایل‌ها فقط در این پنل اعمال شدند.`,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Toast helper
// ─────────────────────────────────────────────────────────────────────────────

let toastTimer;
function toast(message, isError = false) {
  const el = $('toast');
  el.textContent = message;
  el.classList.toggle('error', isError);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 4000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Preview sync
// ─────────────────────────────────────────────────────────────────────────────

function syncPreview() {
  const text = $('preview-text').value;
  $('preview-output').textContent = text || 'سلام! این یک متن نمونه فارسی است. Hello! This is mixed English text.';
}

// ─────────────────────────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────────────────────────

function init() {
  // Run injection immediately.
  const result = injectIntoHost();

  const badge = $('inject-badge');
  const info  = $('inject-info');

  if (result.success) {
    badge.textContent = 'فعال ✅';
    badge.className   = 'badge ok';
  } else {
    badge.textContent = 'محدود ⚠️';
    badge.className   = 'badge warn';
  }
  info.textContent = result.message;

  // Re-inject button.
  $('btn-reinject').addEventListener('click', () => {
    const r = injectIntoHost();
    toast(r.message, !r.success);
  });

  // Live preview.
  $('preview-text').addEventListener('input', syncPreview);
}

init();
