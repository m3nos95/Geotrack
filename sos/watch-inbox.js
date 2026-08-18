#!/usr/bin/env node
'use strict';
/**
 * Turn contractor SOS .xls / .xlsx / form PDFs into completed letter folders.
 * Outlook pull is a separate PowerShell step (sos/outlook-pull.ps1).
 *
 *   node sos/watch-inbox.js --file "form.xls" --out "C:\\...\\completed"
 *   node sos/watch-inbox.js --staging "C:\\...\\inbox-staging" --out "C:\\...\\completed" --dir "C:\\...\\SOS Program"
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const Engine = require('./sos-engine.js');
const Learn = require('./corpus-learn.js');
const { renderLetterHtml } = require('./letter-render.js');

const ROOT = path.join(__dirname, '..');

function argVal(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : '';
}

function loadWatchConfig() {
  const named = argVal('--config');
  const candidates = [
    named,
    process.env.SOS_WATCH_CONFIG,
    path.join(ROOT, 'sos', 'SOS-watch.json'),
    path.join(process.cwd(), 'SOS-watch.json'),
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try { return Object.assign(defaultConfig(), JSON.parse(fs.readFileSync(p, 'utf8')), { _configPath: p }); }
      catch (e) { console.error('Could not read ' + p + ': ' + e.message); }
    }
  }
  return defaultConfig();
}

function defaultConfig() {
  const program = process.env.SOS_PROGRAM_DIR
    || 'C:\\Users\\Aaron.Wieczorek\\OneDrive - STATE OF DELAWARE\\Desktop\\SOS Program';
  return {
    programDir: program,
    outputDir: path.join(program, 'completed'),
    stagingDir: path.join(program, 'inbox-staging'),
    pollMinutes: 30,
    unreadOnly: true,
    daysBack: 7,
    outlookFolder: 'Inbox',
    mailbox: '',
  };
}

function safeSlug(s, fallback) {
  const t = String(s || '').replace(/[^\w.\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  return t || fallback || 'sos';
}

function jobSlug(project, filename) {
  const day = (project && project.date) || new Date().toISOString().slice(0, 10);
  const who = safeSlug((project && (project.contract || project.contractor || project.title)) || filename, 'job');
  return day + '_' + who;
}

function looksLikeSosGrid(rows) {
  const blob = (rows || []).slice(0, 40).map(r => (r || []).join(' ')).join(' ').toLowerCase();
  if (/the following material sources have been reviewed/.test(blob)) return false;
  return /source of supply/.test(blob) && /spec/.test(blob);
}

function fileHash(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
}

function loadSeen(outDir) {
  const p = path.join(outDir, '.processed.json');
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { return { hashes: {} }; }
}

function saveSeen(outDir, seen) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, '.processed.json'), JSON.stringify(seen, null, 2));
}

function needsReview(result) {
  const warns = result.warnings || [];
  if (!(result.project && result.project.contract)) return true;
  if (warns.some(w => /blank/i.test(w))) return true;
  if ((result.items || []).some(it => it.action === 'not-approved' || it.action === 'submit')) return true;
  return false;
}

function reviewLines(result) {
  const lines = [...(result.warnings || [])];
  if (!(result.project && result.project.contract)) {
    lines.unshift('Application / contract number is blank — fill it in before issuing.');
  }
  (result.items || []).forEach(it => {
    if (it.action === 'not-approved' || it.action === 'submit' || it.action === 'test') {
      lines.push((it.letterSpecs || it.specs || []).join(' ') + ' → ' + (it.actionNotes || it.action));
    }
  });
  return [...new Set(lines)];
}

function writeJobFolder(outDir, result, sourcePath, extra) {
  const slug = jobSlug(result.project, path.basename(sourcePath || 'job'));
  const bucket = needsReview(result) ? 'needs-review' : 'ready';
  let dest = path.join(outDir, bucket, slug);
  let n = 2;
  while (fs.existsSync(dest)) {
    dest = path.join(outDir, bucket, slug + '_' + n);
    n++;
  }
  fs.mkdirSync(dest, { recursive: true });
  if (sourcePath && fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, path.join(dest, path.basename(sourcePath)));
  }
  const text = Engine.letterPlainText(result.project, result.items, result.cc);
  fs.writeFileSync(path.join(dest, 'letter.txt'), text);
  fs.writeFileSync(path.join(dest, 'letter.html'), renderLetterHtml(result));
  const review = reviewLines(result);
  fs.writeFileSync(path.join(dest, 'REVIEW.txt'), review.length ? review.map(l => '• ' + l).join('\n') + '\n' : 'No review flags.\n');
  fs.writeFileSync(path.join(dest, 'job.json'), JSON.stringify({
    source: sourcePath ? path.basename(sourcePath) : '',
    bucket,
    project: result.project,
    warnings: result.warnings,
    cc: (result.cc || []).map(c => c.name),
    items: (result.items || []).map(it => ({
      specs: it.letterSpecs || it.specs,
      family: it.family,
      action: it.action,
      source: it.srcName,
      notes: it.actionNotes,
    })),
    extra: extra || null,
  }, null, 2));
  tryPrintPdf(path.join(dest, 'letter.html'), path.join(dest, 'letter.pdf'));
  return { dest, bucket, slug };
}

function tryPrintPdf(htmlPath, pdfPath) {
  const candidates = [
    process.env.SOS_BROWSER,
    'msedge',
    'microsoft-edge',
    'chrome',
    'google-chrome',
    'chromium',
  ].filter(Boolean);
  for (const bin of candidates) {
    const r = spawnSync(bin, [
      '--headless',
      '--disable-gpu',
      '--no-pdf-header-footer',
      '--print-to-pdf=' + pdfPath,
      pathToFileUrl(htmlPath),
    ], { encoding: 'utf8', timeout: 45000 });
    if (r.status === 0 && fs.existsSync(pdfPath)) return true;
  }
  return false;
}

function pathToFileUrl(p) {
  const abs = path.resolve(p).replace(/\\/g, '/');
  if (/^[A-Za-z]:/.test(abs)) return 'file:///' + abs;
  return 'file://' + abs;
}

function processFile(filePath, lists) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') {
    let inspected;
    try { inspected = Learn.inspectPdf(filePath); }
    catch (e) { return { skip: true, reason: 'Could not read PDF: ' + e.message }; }
    if (inspected.kind === 'issued-letter') {
      return { skip: true, reason: 'Issued M&R letter (not a contractor form)' };
    }
    if (inspected.kind !== 'contractor-form') {
      return { skip: true, reason: 'PDF is not a contractor SOS form' };
    }
    try {
      const parsed = Learn.parseFormPdf(filePath);
      const grid = Learn.gridFromForm(parsed);
      if (!looksLikeSosGrid(grid) && !(parsed.items || []).length) {
        return { skip: true, reason: 'PDF does not look like a Source of Supply form' };
      }
      const result = Engine.processGrid(grid, { filename: path.basename(filePath), lists });
      return { result };
    } catch (e) {
      return { skip: true, reason: 'Could not parse contractor form PDF: ' + e.message };
    }
  }
  if (ext === '.xls' || ext === '.xlsx') {
    let grid;
    try { grid = Learn.readGrid(filePath); }
    catch (e) {
      return { skip: true, reason: 'Could not read spreadsheet: ' + e.message };
    }
    if (!looksLikeSosGrid(grid)) {
      return { skip: true, reason: 'Spreadsheet is not a Source of Supply form' };
    }
    const result = Engine.processGrid(grid, { filename: path.basename(filePath), lists });
    return { result };
  }
  return { skip: true, reason: 'Not an .xls, .xlsx, or .pdf' };
}

function collectFiles(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  const out = [];
  const walk = (d) => {
    let names;
    try { names = fs.readdirSync(d); } catch (e) { return; }
    names.forEach(name => {
      if (name.startsWith('.')) return;
      const full = path.join(d, name);
      let st;
      try { st = fs.statSync(full); } catch (e) { return; }
      if (st.isDirectory()) walk(full);
      else if (/\.(xls|xlsx|pdf)$/i.test(name)) out.push(full);
    });
  };
  walk(dir);
  return out;
}

function processOne(filePath, opts) {
  const outDir = opts.outputDir;
  const lists = opts.lists;
  const seen = opts.seen;
  const hash = fileHash(filePath);
  if (seen.hashes[hash]) {
    return { skipped: true, file: filePath, reason: 'already processed' };
  }
  const got = processFile(filePath, lists);
  if (got.skip) {
    const skipDir = path.join(outDir, 'skipped');
    fs.mkdirSync(skipDir, { recursive: true });
    const note = path.join(skipDir, safeSlug(path.basename(filePath), 'file') + '.txt');
    fs.writeFileSync(note, path.basename(filePath) + '\n' + got.reason + '\n');
    seen.hashes[hash] = { skip: got.reason, at: new Date().toISOString() };
    return { skipped: true, file: filePath, reason: got.reason };
  }
  const written = writeJobFolder(outDir, got.result, filePath, opts.meta || null);
  seen.hashes[hash] = { dest: written.dest, at: new Date().toISOString() };
  return { ok: true, file: filePath, ...written, warnings: got.result.warnings || [] };
}

function run(opts) {
  const cfg = Object.assign(loadWatchConfig(), opts || {});
  const programDir = argVal('--dir') || cfg.programDir;
  const outputDir = argVal('--out') || cfg.outputDir;
  const stagingDir = argVal('--staging') || cfg.stagingDir;
  const single = argVal('--file');
  fs.mkdirSync(outputDir, { recursive: true });
  const lists = Learn.loadListsForDir(programDir);
  const seen = loadSeen(outputDir);
  const files = single ? [path.resolve(single)] : collectFiles(stagingDir);
  const results = files.map(f => processOne(f, { outputDir, lists, seen }));
  saveSeen(outputDir, seen);
  return { outputDir, results };
}

function main() {
  const summary = run();
  const ok = summary.results.filter(r => r.ok);
  const skipped = summary.results.filter(r => r.skipped);
  console.log('SOS inbox: ' + summary.results.length + ' file(s) from staging/args');
  ok.forEach(r => console.log('  ' + r.bucket + '  ' + r.dest));
  skipped.forEach(r => console.log('  skip  ' + path.basename(r.file) + ' — ' + r.reason));
  if (!summary.results.length) console.log('Nothing new. Outlook pull writes into the staging folder first.');
  console.log('Output: ' + summary.outputDir);
}

if (require.main === module) main();

module.exports = {
  looksLikeSosGrid,
  jobSlug,
  needsReview,
  writeJobFolder,
  processFile,
  processOne,
  run,
  loadWatchConfig,
  defaultConfig,
};
