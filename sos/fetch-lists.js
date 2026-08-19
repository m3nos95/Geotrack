#!/usr/bin/env node
'use strict';
/**
 * Pull current DelDOT Approved Product List PDFs and the office Approved Source List
 * (\\\\DOTFS01\\Groups\\Geo Construction Test Report\\Reference Samples\\Approved Source List.xlsx).
 *
 *   node sos/fetch-lists.js
 *   node sos/fetch-lists.js --dir "C:\\...\\SOS Program"
 *   node sos/fetch-lists.js --chart-only
 *   node sos/fetch-lists.js --chart "\\\\DOTFS01\\Groups\\Geo Construction Test Report\\Reference Samples\\Approved Source List.xlsx"
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawnSync } = require('child_process');
const Lists = require('./sos-lists.js');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'lists', 'apl-snapshot.json');
const AGG_OUT = path.join(__dirname, 'lists', 'aggregate-snapshot.json');
const WANT_JSON = process.argv.includes('--json');
const CHART_ONLY = process.argv.includes('--chart-only');
const SERVE = process.argv.includes('--serve');
const SOS_HELPER_PORT = Number(process.env.SOS_HELPER_PORT) || 18765;

const DEFAULT_AGGREGATE_CHART =
  '\\\\DOTFS01\\Groups\\Geo Construction Test Report\\Reference Samples\\Approved Source List.xlsx';

function argvFlag(name) {
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === name && process.argv[i + 1]) {
      const v = process.argv[++i];
      if (/^\\\\/.test(v) || /^[A-Za-z]:[\\/]/.test(v)) return v;
      return path.resolve(v);
    }
  }
  return '';
}

function argvDir() {
  return argvFlag('--dir')
    || (process.env.SOS_CORPUS_DIR ? path.resolve(process.env.SOS_CORPUS_DIR) : '')
    || (process.env.SOS_PROGRAM_DIR ? path.resolve(process.env.SOS_PROGRAM_DIR) : '');
}

function loadChartConfig() {
  const named = argvFlag('--config');
  const candidates = [
    named,
    process.env.SOS_WATCH_CONFIG,
    path.join(ROOT, 'sos', 'SOS-watch.json'),
    path.join(process.cwd(), 'SOS-watch.json'),
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
      catch (e) {}
    }
  }
  return {};
}

function pythonCmd() {
  const candidates = [['python3'], ['python'], ['py', '-3']];
  for (const cmd of candidates) {
    const r = spawnSync(cmd[0], cmd.slice(1).concat(['-c', 'print(1)']), { encoding: 'utf8' });
    if (r.status === 0) return cmd;
  }
  return ['python3'];
}

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'DelDOT-SOS-lists/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchBuffer(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(url + ' HTTP ' + res.statusCode));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

function pdfText(buf) {
  const tmp = path.join(__dirname, 'lists', '._tmp-apl.pdf');
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, buf);
  const py = pythonCmd();
  const r = spawnSync(py[0], py.slice(1).concat(['-c', `
from pypdf import PdfReader
import sys
reader = PdfReader(sys.argv[1])
print('\\n'.join((p.extract_text() or '') for p in reader.pages))
`, tmp]), { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  try { fs.unlinkSync(tmp); } catch (e) {}
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || 'pypdf failed').slice(0, 500));
  return r.stdout;
}

function listFiles(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  let names;
  try { names = fs.readdirSync(dir); } catch (e) { return []; }
  const out = [];
  for (const name of names) {
    if (name.startsWith('.')) continue;
    const full = path.join(dir, name);
    let st;
    try { st = fs.statSync(full); } catch (e) { continue; }
    if (st.isDirectory()) continue;
    out.push(full);
  }
  return out;
}

function findAggregateChart(dir) {
  const files = listFiles(dir).filter(p => /\.xlsx?$/i.test(p) && /aggregat|gabc.?chart|approved.?source|source.?chart|approved source list/i.test(path.basename(p)));
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] || '';
}

function resolveAggregateChart(dir, cfg) {
  const candidates = [
    argvFlag('--chart'),
    process.env.SOS_AGGREGATE_CHART,
    cfg && cfg.aggregateChartPath,
    DEFAULT_AGGREGATE_CHART,
    dir ? path.join(dir, 'Approved Source List.xlsx') : '',
    dir ? path.join(dir, 'Approved Source List.xls') : '',
  ].filter(Boolean);
  for (const p of candidates) {
    try { if (p && fs.existsSync(p)) return p; } catch (e) {}
  }
  return findAggregateChart(dir);
}

function readSpreadsheetGrid(xlsPath, opts) {
  const prefer = (opts && opts.preferSheet) || '';
  const py = pythonCmd();
  const r = spawnSync(py[0], py.slice(1).concat(['-c', `
import json, sys, datetime
path = sys.argv[1]
prefer = sys.argv[2] if len(sys.argv) > 2 else ''

def norm(c):
    if c is None or c == '':
        return ''
    if isinstance(c, datetime.datetime):
        return c.strftime('%Y-%m-%d')
    if isinstance(c, datetime.date):
        return c.isoformat()
    return c

rows = []
ext = path.lower()
if ext.endswith('.xlsx') or ext.endswith('.xlsm'):
    from openpyxl import load_workbook
    wb = load_workbook(path, data_only=True, read_only=True)
    names = list(wb.sheetnames)
    pick = prefer if prefer in names else names[0]
    sh = wb[pick]
    for row in sh.iter_rows(values_only=True):
        rows.append([norm(c) for c in row])
else:
    import xlrd
    wb = xlrd.open_workbook(path)
    sh = wb.sheet_by_index(0)
    for r in range(sh.nrows):
        vals = []
        for c in range(sh.ncols):
            v = sh.cell_value(r, c)
            if sh.cell_type(r, c) == xlrd.XL_CELL_DATE:
                t = xlrd.xldate_as_tuple(v, wb.datemode)
                vals.append('%04d-%02d-%02d' % t[:3])
            else:
                vals.append(norm(v))
        rows.append(vals)
print(json.dumps(rows))
`, xlsPath, prefer]), { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || 'spreadsheet read failed').slice(0, 400));
  return JSON.parse(r.stdout);
}

function readXlsGrid(xlsPath) {
  return readSpreadsheetGrid(xlsPath);
}

function loadAggregateChart(chartPath) {
  if (!chartPath) return null;
  const prefer = /approved.?source.?list/i.test(path.basename(chartPath)) ? 'Reference Summary' : '';
  const grid = readSpreadsheetGrid(chartPath, { preferSheet: prefer });
  return Lists.parseAggregateChartGrid(grid, { filename: path.basename(chartPath), path: chartPath });
}

function pullOfficeAggregateChart() {
  const cfg = loadChartConfig();
  const dir = argvDir() || cfg.programDir || '';
  const chartPath = resolveAggregateChart(dir, cfg);
  if (!chartPath) {
    return {
      ok: false,
      error: 'Approved Source List.xlsx was not found at ' + DEFAULT_AGGREGATE_CHART + (dir ? ' or in ' + dir : '') + '. Map the Geo Construction share or drop the file on APL / Chart.',
      path: DEFAULT_AGGREGATE_CHART,
    };
  }
  const aggregate = loadAggregateChart(chartPath);
  const n = (aggregate && aggregate.entries || []).length;
  if (!n) {
    return { ok: false, error: 'Opened ' + chartPath + ' but found no chart rows.', path: chartPath, aggregate };
  }
  const notes = [];
  writeChartOutputs({ aggregate, fetchedAt: new Date().toISOString() }, dir, notes);
  return { ok: true, path: chartPath, aggregate, notes, rows: n };
}

function mimeFor(file) {
  const ext = path.extname(file).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  })[ext] || 'application/octet-stream';
}

function safePublicFile(urlPath) {
  const decoded = decodeURIComponent(String(urlPath || '/').split('?')[0]);
  const rel = decoded.replace(/^\/+/, '') || 'deldot-sos.html';
  const full = path.normalize(path.join(ROOT, rel));
  const inside = path.relative(ROOT, full);
  if (!inside || inside.startsWith('..') || path.isAbsolute(inside)) return null;
  return full;
}

function sendJson(res, status, body) {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': buf.length,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'no-store',
  });
  res.end(buf);
}

function handleHelperRequest(req, res) {
  const url = (req.url || '/').split('?')[0];
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    });
    res.end();
    return;
  }
  if (url === '/api/pull-chart') {
    try {
      sendJson(res, 200, pullOfficeAggregateChart());
    } catch (e) {
      sendJson(res, 200, { ok: false, error: e.message || String(e), path: DEFAULT_AGGREGATE_CHART });
    }
    return;
  }
  if (url === '/api/chart-status') {
    const cfg = loadChartConfig();
    const dir = argvDir() || cfg.programDir || '';
    const chartPath = resolveAggregateChart(dir, cfg) || DEFAULT_AGGREGATE_CHART;
    let reachable = false;
    try { reachable = !!(chartPath && fs.existsSync(chartPath)); } catch (e) {}
    sendJson(res, 200, { helper: true, path: chartPath, reachable });
    return;
  }
  const file = safePublicFile(url === '/' ? '/deldot-sos.html' : url);
  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
    res.end('Not found');
    return;
  }
  const buf = fs.readFileSync(file);
  res.writeHead(200, {
    'Content-Type': mimeFor(file),
    'Content-Length': buf.length,
    'Access-Control-Allow-Origin': '*',
  });
  res.end(buf);
}

function startHelperServer(opts) {
  const http = require('http');
  const port = (opts && opts.port) || SOS_HELPER_PORT;
  const server = http.createServer(handleHelperRequest);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function writeChartOutputs(bundle, dir, notes) {
  if (bundle.aggregate && bundle.aggregate.entries && bundle.aggregate.entries.length) {
    fs.writeFileSync(AGG_OUT, JSON.stringify(bundle.aggregate, null, 2));
    notes.push('Wrote ' + path.relative(ROOT, AGG_OUT));
  }
  if (dir && fs.existsSync(dir)) {
    const copy = path.join(dir, 'SOS-lists.json');
    fs.writeFileSync(copy, JSON.stringify(bundle, null, 2));
    notes.push('Wrote ' + copy);
  }
}

async function main() {
  if (SERVE) {
    const server = await startHelperServer();
    const addr = server.address();
    const port = addr && addr.port ? addr.port : SOS_HELPER_PORT;
    console.log('DelDOT SOS helper http://127.0.0.1:' + port + '/deldot-sos.html');
    console.log('Pull chart: http://127.0.0.1:' + port + '/api/pull-chart');
    console.log('Reads ' + DEFAULT_AGGREGATE_CHART);
    console.log('Leave this window open while you use the SOS page. Click Pull chart from office share on APL / Chart.');
    return;
  }
  fs.mkdirSync(path.join(__dirname, 'lists'), { recursive: true });
  const bundle = Lists.emptyBundle();
  bundle.fetchedAt = new Date().toISOString();
  const notes = [];
  const cfg = loadChartConfig();
  const dir = argvDir() || cfg.programDir || '';

  if (!CHART_ONLY) {
    for (const [key, info] of Object.entries(Lists.APL_PDFS)) {
      try {
        process.stderr.write('Fetching ' + info.label + '…\n');
        const buf = await fetchBuffer(info.url);
        const text = pdfText(buf);
        if (key === 'tack') bundle.tack = Lists.parseTackAplText(text);
        else if (key === 'crack') bundle.crack = Lists.parseManufacturerProductText(text, 'crack');
        else if (key === 'striping') bundle.striping = Lists.parseManufacturerProductText(text, 'striping');
        else if (key === 'curing') bundle.curing = Lists.parseManufacturerProductText(text, 'curing');
        notes.push(info.label + ': ok');
      } catch (e) {
        notes.push(info.label + ': ' + e.message);
        process.stderr.write('  ' + e.message + '\n');
      }
    }
  } else if (fs.existsSync(OUT)) {
    try {
      Object.assign(bundle, Lists.mergeBundle(JSON.parse(fs.readFileSync(OUT, 'utf8')), bundle));
    } catch (e) {}
  }

  const chart = resolveAggregateChart(dir, cfg);
  if (chart) {
    try {
      bundle.aggregate = loadAggregateChart(chart);
      notes.push('Approved Source List: ' + chart + ' (' + bundle.aggregate.entries.length + ' rows)');
    } catch (e) {
      notes.push('Approved Source List: ' + e.message);
      process.stderr.write('  ' + e.message + '\n');
    }
  } else {
    notes.push('No Approved Source List at ' + DEFAULT_AGGREGATE_CHART + (dir ? ' or in ' + dir : ''));
  }

  writeChartOutputs(bundle, dir, notes);

  if (!CHART_ONLY) {
    const aplOnly = Object.assign({}, bundle, {
      aggregate: { kind: 'aggregate', file: '', entries: [] },
    });
    fs.writeFileSync(OUT, JSON.stringify(aplOnly, null, 2));
    notes.push('Snapshot: ' + path.relative(ROOT, OUT));
  }

  const line = Lists.summary(bundle);
  if (WANT_JSON) console.log(JSON.stringify({ bundle, notes }, null, 2));
  else {
    console.log(line);
    notes.forEach(n => console.log('  ' + n));
  }
}

if (require.main === module) {
  main().catch(e => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = {
  findAggregateChart,
  resolveAggregateChart,
  loadAggregateChart,
  pullOfficeAggregateChart,
  startHelperServer,
  handleHelperRequest,
  readSpreadsheetGrid,
  argvDir,
  DEFAULT_AGGREGATE_CHART,
  SOS_HELPER_PORT,
};
