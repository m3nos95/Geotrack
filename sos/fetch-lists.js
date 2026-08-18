#!/usr/bin/env node
'use strict';
/**
 * Pull current DelDOT Approved Product List PDFs and (optionally) the office
 * aggregate chart, then write sos/lists/apl-snapshot.json.
 *
 *   node sos/fetch-lists.js
 *   node sos/fetch-lists.js --dir "C:\\...\\SOS Program"
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawnSync } = require('child_process');
const Lists = require('./sos-lists.js');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'lists', 'apl-snapshot.json');
const WANT_JSON = process.argv.includes('--json');

function argvDir() {
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === '--dir' && process.argv[i + 1]) return path.resolve(process.argv[++i]);
  }
  if (process.env.SOS_CORPUS_DIR) return path.resolve(process.env.SOS_CORPUS_DIR);
  if (process.env.SOS_PROGRAM_DIR) return path.resolve(process.env.SOS_PROGRAM_DIR);
  return '';
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
  const files = listFiles(dir).filter(p => /\.xlsx?$/i.test(p) && /aggregat|gabc.?chart|approved.?source|source.?chart/i.test(path.basename(p)));
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] || '';
}

function readXlsGrid(xlsPath) {
  const py = pythonCmd();
  const r = spawnSync(py[0], py.slice(1).concat(['-c', `
import json, sys
path = sys.argv[1]
rows = []
try:
    import xlrd
    wb = xlrd.open_workbook(path)
    sh = wb.sheet_by_index(0)
    for r in range(sh.nrows):
        rows.append([sh.cell_value(r, c) for c in range(sh.ncols)])
except Exception:
    raise SystemExit('xls read failed')
print(json.dumps(rows))
`, xlsPath]), { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || 'xls failed').slice(0, 400));
  return JSON.parse(r.stdout);
}

async function main() {
  fs.mkdirSync(path.join(__dirname, 'lists'), { recursive: true });
  const bundle = Lists.emptyBundle();
  bundle.fetchedAt = new Date().toISOString();
  const notes = [];

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

  const dir = argvDir();
  if (dir) {
    const chart = findAggregateChart(dir);
    if (chart) {
      try {
        const grid = readXlsGrid(chart);
        bundle.aggregate = Lists.parseAggregateChartGrid(grid, { filename: path.basename(chart) });
        notes.push('Aggregate chart: ' + path.basename(chart) + ' (' + bundle.aggregate.entries.length + ' rows)');
        const copy = path.join(dir, 'SOS-lists.json');
        fs.writeFileSync(copy, JSON.stringify(bundle, null, 2));
        notes.push('Wrote ' + copy);
      } catch (e) {
        notes.push('Aggregate chart: ' + e.message);
      }
    } else {
      notes.push('No aggregate chart xls/xlsx in ' + dir + ' (name should include Aggregate or Chart)');
    }
  }

  fs.writeFileSync(OUT, JSON.stringify(bundle, null, 2));
  const line = Lists.summary(bundle);
  if (WANT_JSON) console.log(JSON.stringify({ bundle, notes }, null, 2));
  else {
    console.log(line);
    notes.forEach(n => console.log('  ' + n));
    console.log('Snapshot: ' + path.relative(ROOT, OUT));
  }
}

if (require.main === module) {
  main().catch(e => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { findAggregateChart, argvDir };
