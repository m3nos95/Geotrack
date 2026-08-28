'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'deldot-sos.html'), 'utf8');
assert.ok(!/pdf\.min\.js/.test(html), 'pdf.js must not load on page open');
assert.ok(!/xlsx\.full\.min\.js/.test(html), 'SheetJS must not load on page open');
assert.ok(!/cdn\.jsdelivr\.net/.test(html), 'no jsDelivr scripts on page open');
assert.ok(/sos-app\.js\?v=20260828h/.test(html), 'cache-bust sos-app.js');

const app = fs.readFileSync(path.join(__dirname, 'sos-app.js'), 'utf8');
assert.ok(/function loadPdfJs\(/.test(app));
assert.ok(/function loadXlsx\(/.test(app));
assert.ok(/xlsx@0\.18\.5\/dist\/xlsx\.full\.min\.js/.test(app));
assert.ok(/pdfjs-dist@3\.11\.174\/build\/pdf\.min\.js/.test(app));
assert.ok(!/renderSourceLib\(\);/.test(app.slice(app.indexOf('function initApp()'), app.indexOf('function initApp()') + 1200)));

console.log('OK sos-boot: page open does not load pdf.js or SheetJS');
