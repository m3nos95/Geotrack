'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'deldot-sos.html'), 'utf8');
assert.ok(!/pdf\.min\.js/.test(html), 'pdf.js must not load on page open');
assert.ok(!/xlsx\.full\.min\.js/.test(html), 'SheetJS must not load on page open');
assert.ok(!/cdn\.jsdelivr\.net/.test(html), 'no jsDelivr scripts on page open');
assert.ok(/sos-app\.js\?v=20260828n/.test(html), 'cache-bust sos-app.js');
assert.ok(/id="letter-save-status"/.test(html), 'Save training pack status is next to the letter, not only on Import');

const app = fs.readFileSync(path.join(__dirname, 'sos-app.js'), 'utf8');
assert.ok(!/After you send the letter/.test(app), 'training copy is for already-issued letters, not a live send');
assert.ok(/function fetchWithTimeout\(/.test(app), 'do not wait forever for start-sos.bat');
assert.ok(/AbortController/.test(app), 'abort helper fetch if it hangs');
assert.ok(/setLetterActionStatus/.test(app));
assert.ok(/function trainingSaveUrls\(/.test(app));
assert.ok(/function loadPdfJs\(/.test(app));
assert.ok(/function loadXlsx\(/.test(app));
assert.ok(/xlsx@0\.18\.5\/dist\/xlsx\.full\.min\.js/.test(app));
assert.ok(/pdfjs-dist@3\.11\.174\/build\/pdf\.min\.js/.test(app));
assert.ok(!/renderSourceLib\(\);/.test(app.slice(app.indexOf('function initApp()'), app.indexOf('function initApp()') + 1800)));
const loadSpec = app.slice(app.indexOf('function loadSpecLib()'), app.indexOf('function saveSpecLib()'));
assert.ok(!/cleanSpecLibraryDesc/.test(loadSpec), 'do not clean every spec against every plant on open');
const pdfFn = app.slice(app.indexOf('async function handleImportPdf'), app.indexOf('window.handleImportFile'));
assert.ok(pdfFn.indexOf('copyFileBytes') < pdfFn.indexOf('parsePdf'), 'copy PDF bytes before pdf.js can detach them');

function copyFileBytes(buf) {
  const view = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const out = new Uint8Array(view.byteLength);
  out.set(view);
  return out;
}
const buf = new ArrayBuffer(8);
new Uint8Array(buf).fill(9);
const kept = copyFileBytes(buf);
structuredClone(buf, { transfer: [buf] });
assert.throws(() => { buf.slice(0); }, /detached|Cannot perform ArrayBuffer/i);
assert.strictEqual(kept[0], 9);
assert.strictEqual(kept.length, 8);

console.log('OK sos-boot: page open does not load pdf.js or SheetJS');
