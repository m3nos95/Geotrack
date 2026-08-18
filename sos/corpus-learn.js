#!/usr/bin/env node
'use strict';
/**
 * Compare contractor SOS spreadsheets to issued M&R letter PDFs.
 * Usage: node sos/corpus-learn.js
 *        node sos/corpus-learn.js --json
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const Engine = require('./sos-engine.js');

const ROOT = path.join(__dirname, 'corpus');
const CASES = path.join(ROOT, 'cases');
const DROP = path.join(ROOT, 'drop');
const WANT_JSON = process.argv.includes('--json');
const DIR_ONLY = process.argv.includes('--dir-only');
const VERBOSE = process.argv.includes('--verbose');

function argvDirs() {
  const dirs = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === '--dir' && process.argv[i + 1]) {
      dirs.push(path.resolve(process.argv[++i]));
    }
  }
  if (process.env.SOS_CORPUS_DIR) dirs.push(path.resolve(process.env.SOS_CORPUS_DIR));
  return [...new Set(dirs)].filter(d => {
    try { return fs.statSync(d).isDirectory(); } catch (e) { return false; }
  });
}

function pythonCmd() {
  const candidates = [['python3'], ['python'], ['py', '-3']];
  for (const cmd of candidates) {
    const r = spawnSync(cmd[0], cmd.slice(1).concat(['-c', 'print(1)']), { encoding: 'utf8' });
    if (r.status === 0) return cmd;
  }
  return ['python3'];
}

const PYTHON = pythonCmd();

function listFiles(dir, exts) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) continue;
    const ext = path.extname(name).toLowerCase();
    if (exts.includes(ext)) out.push(full);
  }
  return out.sort();
}

function listFilesRecursive(dir, exts, depth) {
  if (depth == null) depth = 0;
  if (depth > 5 || !fs.existsSync(dir)) return [];
  let names;
  try { names = fs.readdirSync(dir); } catch (e) { return []; }
  const out = [];
  for (const name of names) {
    if (name.startsWith('.') || name === 'SOS-learn-report.md') continue;
    const full = path.join(dir, name);
    let st;
    try { st = fs.statSync(full); } catch (e) { continue; }
    if (st.isDirectory()) out.push(...listFilesRecursive(full, exts, depth + 1));
    else if (exts.includes(path.extname(name).toLowerCase())) out.push(full);
  }
  return out.sort();
}

function listDirs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(n => !n.startsWith('.'))
    .map(n => path.join(dir, n))
    .filter(p => fs.statSync(p).isDirectory())
    .sort();
}

const FORMPDF = path.join(__dirname, 'corpus-formpdf.py');

function runScript(args) {
  const r = spawnSync(PYTHON[0], PYTHON.slice(1).concat(args), {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || 'python failed').trim();
    throw new Error(err.slice(0, 800));
  }
  return r.stdout;
}

function runPython(code, args) {
  return runScript(['-c', code, ...args]);
}

function inspectPdf(pdfPath) {
  return JSON.parse(runScript([FORMPDF, '--inspect', pdfPath]));
}

function parseFormPdf(pdfPath) {
  return JSON.parse(runScript([FORMPDF, '--parse', pdfPath]));
}

function gridFromForm(parsed) {
  const p = parsed.project || {};
  const rows = [
    ['', '', '', '', '', '', 'Agreement /Permit/Contract/Application #:', p.contract || '', ''],
    ['', '', '', '', '', '', 'Title of Contract:', p.title || '', ''],
    ['Source of Supply', '', '', '', '', '', '', 'Contractor: ' + (p.contractor || ''), ''],
    ['', '', '', '', '', '', '', 'Address: ' + (p.address || ''), ''],
    ['', '', '', '', '', '', '', 'Date:' + (p.date || ''), ''],
    ['', 'District: ' + (p.district || ''), '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', 'DelDOT Contact: ' + (p.contact || ''), ''],
    ['Specification #', '', 'Item Description', '', 'Material', 'Supplier', '', 'Manufacturer', 'Alternate Manufacturer'],
    ['', '', '', '', '', '', '', 'Address & Contact', 'Address & Contact'],
  ];
  for (const it of parsed.items || []) {
    const spec = /^\d+$/.test(it.spec) ? Number(it.spec) : it.spec;
    rows.push(['', spec, it.desc || '', '', it.material || '', it.supplier || '', '', it.manufacturer || '', it.alt || '']);
    if (it.loc) rows.push(['', '', '', '', '', '', '', it.loc, '']);
    rows.push(Array(9).fill(''));
  }
  return rows;
}

function readGrid(xlsPath) {
  const code = `
import json, sys
path = sys.argv[1]
rows = []
try:
    import xlrd
    wb = xlrd.open_workbook(path)
    sh = wb.sheet_by_index(0)
    for r in range(sh.nrows):
        rows.append([sh.cell_value(r, c) for c in range(sh.ncols)])
except Exception as e:
    raise SystemExit('xls read failed: ' + type(e).__name__ + ': ' + str(e))
print(json.dumps(rows))
`;
  return JSON.parse(runPython(code, [xlsPath]));
}

function readPdf(pdfPath) {
  const code = `
import sys
from pypdf import PdfReader
reader = PdfReader(sys.argv[1])
parts = []
for page in reader.pages:
    parts.append(page.extract_text() or '')
print('\\f'.join(parts))
`;
  return runPython(code, [pdfPath]);
}

function squeeze(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function looksLikeContractorForm(text) {
  const t = text.replace(/\s+/g, ' ');
  if (/The following material sources have been reviewed/i.test(t)) return false;
  return /Spec\w{0,6}cation/i.test(t) && /Item Description/i.test(t);
}

function stripPageBanners(text) {
  return text
    .replace(/\f/g, '\n')
    .replace(/^[^\n]{2,40}\n[^\n]{3,40}\n[^\n]{6,40}\nPage[^\n]*\n/gim, '\n')
    .replace(/SHANT[ÉE]\s+A\.\s+HASTINGS[\s\S]{0,80}?Secretary/i, '')
    .replace(/S\s+ecretary/g, '');
}

function parseIssuedSections(raw) {
  const text = stripPageBanners(raw);
  if (looksLikeContractorForm(text)) {
    return { kind: 'contractor-form', sections: [], cc: [], intro: squeeze(text).slice(0, 200) };
  }
  const blocks = [];
  const re = /SECTION:\s*([\s\S]*?)(?=SECTION:|If you have any questions|$)/gi;
  let m;
  while ((m = re.exec(text))) {
    const chunk = m[1];
    const srcM = chunk.match(/SOURCE:\s*([\s\S]*?)(?=ACTION:|$)/i);
    const actM = chunk.match(/ACTION:\s*([\s\S]*?)$/i);
    const beforeSrc = chunk.split(/SOURCE:/i)[0];
    const specLines = beforeSrc
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !/^•/.test(l));
    const bullets = beforeSrc
      .split('\n')
      .map(l => l.trim())
      .filter(l => /^•/.test(l))
      .map(l => l.replace(/^•\s*/, ''));
    blocks.push({
      section: squeeze(specLines.join(' | ')),
      bullets,
      source: srcM ? squeeze(srcM[1]) : '',
      action: actM ? squeeze(actM[1]) : '',
    });
  }
  const cc = [];
  const ccBlock = text.split(/cc:\s*/i)[1];
  if (ccBlock) {
    ccBlock.split(/\n/).forEach(line => {
      const t = line.replace(/DelDOT.*/i, 'DelDOT').replace(/,.*/, '').trim();
      if (t && t.length < 40 && /[A-Za-z]/.test(t)) cc.push(squeeze(line));
    });
  }
  const introM = text.match(/reviewed by this office for\s+([\s\S]*?)\s+as to their acceptability/i);
  return {
    kind: 'issued-letter',
    intro: introM ? squeeze(introM[1]) : '',
    sections: blocks,
    cc,
  };
}

function appNumsFromName(filename) {
  return [...String(filename).matchAll(/\b(\d{9,10})\b/g)].map(m => m[1]);
}

function discoverCases() {
  const cases = [];
  const inspected = {};
  const inspectAll = (files) => {
    files.filter(p => /\.pdf$/i.test(p)).forEach(p => {
      if (inspected[p]) return;
      try { inspected[p] = inspectPdf(p); }
      catch (e) { inspected[p] = { kind: 'unknown', appNums: [], error: e.message }; }
    });
  };

  const takeFolder = (dir, slug) => {
    const xls = listFiles(dir, ['.xls', '.xlsx']);
    const pdfs = listFiles(dir, ['.pdf']);
    if (!xls.length && !pdfs.length) return;
    inspectAll(pdfs);
    const forms = pdfs.filter(p => inspected[p] && inspected[p].kind === 'contractor-form');
    const letters = pdfs.filter(p => !forms.includes(p));
    cases.push({ slug, dir, xls, pdfs: letters, formPdfs: forms });
  };

  const extra = argvDirs();
  if (!DIR_ONLY) {
    listDirs(CASES).forEach(dir => takeFolder(dir, path.basename(dir)));
    listDirs(DROP).forEach(dir => takeFolder(dir, 'drop/' + path.basename(dir)));
  }

  const loose = [];
  if (!DIR_ONLY) {
    loose.push(...listFiles(CASES, ['.xls', '.xlsx', '.pdf']));
    loose.push(...listFiles(DROP, ['.xls', '.xlsx', '.pdf']));
  }
  extra.forEach(dir => {
    loose.push(...listFilesRecursive(dir, ['.xls', '.xlsx', '.pdf']));
  });

  inspectAll(loose);
  pairLooseFiles(loose, inspected).forEach(c => {
    let prefix = '';
    if (c.dir === DROP || String(c.dir).startsWith(DROP)) prefix = 'drop/';
    extra.forEach(dir => {
      if (String(c.dir).startsWith(dir)) prefix = path.basename(dir) + '/';
    });
    const slug = c.slug.startsWith('drop/') ? c.slug : prefix + c.slug;
    cases.push({ ...c, slug });
  });
  return cases;
}

/** Same job if the name matches before the extension, ignoring -rev1 / _rev 2 / tack-rev. */
function pairKey(filename) {
  let s = path.basename(String(filename)).replace(/\.(xlsx?|pdf)$/i, '');
  s = s.replace(/[-_\s.()]+/g, ' ').trim();
  s = s.replace(/\s+(rev(ision)?|tack(\s*rev(ision)?)?)\s*\d*$/i, '');
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function pairLooseFiles(files, inspected) {
  inspected = inspected || {};
  const xls = files.filter(p => /\.xlsx?$/i.test(p));
  const pdfs = files.filter(p => /\.pdf$/i.test(p));
  const byKey = new Map();

  const keysFor = (file) => {
    const keys = [];
    const name = pairKey(file);
    if (name) keys.push('name:' + name);
    appNumsFromName(file).forEach(n => keys.push('app:' + n));
    const info = inspected[file];
    (info && info.appNums || []).forEach(n => keys.push('app:' + n));
    return [...new Set(keys)];
  };

  const groupFor = (file) => {
    const keys = keysFor(file);
    let g = null;
    for (const k of keys) {
      if (byKey.has(k)) { g = byKey.get(k); break; }
    }
    if (!g) g = { xls: [], pdfs: [], formPdfs: [] };
    keys.forEach(k => byKey.set(k, g));
    return g;
  };

  for (const x of xls) groupFor(x).xls.push(x);
  for (const p of pdfs) {
    const g = groupFor(p);
    if (inspected[p] && inspected[p].kind === 'contractor-form') g.formPdfs.push(p);
    else g.pdfs.push(p);
  }

  const seen = new Set();
  const cases = [];
  for (const g of byKey.values()) {
    if (seen.has(g)) continue;
    seen.add(g);
    if (!g.xls.length && !g.pdfs.length && !g.formPdfs.length) continue;
    const first = g.xls[0] || g.formPdfs[0] || g.pdfs[0];
    const app = appNumsFromName(first)[0]
      || (g.formPdfs[0] && inspected[g.formPdfs[0]] && inspected[g.formPdfs[0]].appNums[0])
      || (g.pdfs[0] && inspected[g.pdfs[0]] && inspected[g.pdfs[0]].appNums[0])
      || '';
    let slug = path.basename(first).replace(/\.(xlsx?|pdf)$/i, '');
    if (app && !slug.includes(app)) slug = app + ' ' + slug;
    cases.push({
      slug,
      dir: path.dirname(first),
      xls: g.xls,
      pdfs: g.pdfs,
      formPdfs: g.formPdfs,
    });
  }
  return cases;
}

function engineSummary(result) {
  return {
    project: result.project,
    warnings: result.warnings || [],
    cc: (result.cc || []).map(c => c.name),
    items: (result.items || []).map(it => ({
      specs: it.letterSpecs || it.specs,
      family: it.family,
      action: it.action,
      rule: it.rule,
      section: Engine.letterSectionLines(it).join(' / '),
      source: Engine.sourceLine(it).replace(/\n/g, ' | '),
      notes: it.actionNotes,
      subs: it.subItems || [],
    })),
  };
}

function specTokens(s) {
  return [...String(s || '').matchAll(/#?\d{6}|#\d+xxx/gi)].map(m => m[0].replace(/^#/, '#').toUpperCase());
}

function compareCase(c) {
  const out = {
    slug: c.slug,
    dir: c.dir,
    xlsFiles: c.xls.map(p => path.basename(p)),
    formFiles: (c.formPdfs || []).map(p => path.basename(p)),
    pdfFiles: c.pdfs.map(p => path.basename(p)),
    unfiled: !!c.unfiled,
    engine: null,
    letters: [],
    notes: [],
  };

  if (c.xls.length > 1) out.notes.push('Multiple spreadsheets matched this name — using the first.');

  if (c.xls.length) {
    try {
      const grid = readGrid(c.xls[0]);
      const result = Engine.processGrid(grid, { filename: path.basename(c.xls[0]) });
      out.engine = engineSummary(result);
    } catch (e) {
      out.notes.push('Could not parse spreadsheet: ' + e.message);
    }
  } else if ((c.formPdfs || []).length) {
    try {
      const parsed = parseFormPdf(c.formPdfs[0]);
      out.notes.push('Contractor form is a PDF (not .xls) — parsed the spec table from the PDF.');
      const grid = gridFromForm(parsed);
      const result = Engine.processGrid(grid, { filename: path.basename(c.formPdfs[0]) });
      out.engine = engineSummary(result);
    } catch (e) {
      out.notes.push('Could not parse contractor form PDF: ' + e.message);
    }
  } else {
    out.notes.push('PDF only — add the contractor .xls / .xlsx (or a PDF printout of the form) to this folder.');
  }

  for (const pdf of c.pdfs) {
    try {
      const raw = readPdf(pdf);
      const parsed = parseIssuedSections(raw);
      out.letters.push({ file: path.basename(pdf), pages: raw.split('\f').length, ...parsed });
      if (parsed.kind === 'contractor-form') {
        out.notes.push(path.basename(pdf) + ' looks like the contractor SOS form, not the issued M&R letter.');
      }
    } catch (e) {
      out.notes.push('Could not read ' + path.basename(pdf) + ': ' + e.message);
    }
  }

  const issued = out.letters
      .filter(l => l.kind === 'issued-letter' && l.sections.length)
      .sort((a, b) => b.sections.length - a.sections.length);
    if (out.engine && issued.length) {
    const letter = issued[0];
    const engSpecs = new Set(out.engine.items.flatMap(i => specTokens((i.specs || []).join(' ') + ' ' + i.section)));
    const pdfSpecs = new Set(letter.sections.flatMap(s => specTokens(s.section)));
    const missing = [...pdfSpecs].filter(s => ![...engSpecs].some(e => e.replace('#', '') === s.replace('#', '')));
    const extra = [...engSpecs].filter(s => ![...pdfSpecs].some(p => p.replace('#', '') === s.replace('#', '')));
    out.diff = {
      against: letter.file,
      engineItems: out.engine.items.length,
      pdfSections: letter.sections.length,
      specsInPdfNotEngine: missing,
      specsInEngineNotPdf: extra,
      pdfIntro: letter.intro,
      enginePhrase: Engine.contractPhrase(out.engine.project),
    };
  }
  return out;
}

function renderText(results) {
  const lines = [];
  lines.push('SOS corpus learn');
  lines.push('Cases: ' + results.length);
  lines.push('');
  if (!results.length) {
    lines.push('No files yet. Put matching pairs in sos/corpus/drop/ (Job.xls + Job.pdf) or one subfolder per job.');
    lines.push('See sos/corpus/README.md');
    return lines.join('\n');
  }
  for (const r of results) {
    lines.push('═'.repeat(72));
    lines.push(r.slug);
    lines.push('xls: ' + (r.xlsFiles.join(', ') || '(none)'));
    if (r.formFiles && r.formFiles.length) lines.push('form-pdf: ' + r.formFiles.join(', '));
    lines.push('pdf: ' + (r.pdfFiles.join(', ') || '(none)'));
    r.notes.forEach(n => lines.push('note: ' + n));
    if (r.engine) {
      const p = r.engine.project || {};
      lines.push('engine project: ' + [p.contract, p.title, p.contractor].filter(Boolean).join(' · '));
      if (r.engine.warnings.length) lines.push('warnings: ' + r.engine.warnings.join(' | '));
      r.engine.items.forEach((it, i) => {
        lines.push(`  E${i + 1} [${it.action}/${it.family}] ${it.section}`);
        lines.push('     SOURCE ' + it.source);
        lines.push('     ACTION ' + squeeze(it.notes).slice(0, 220));
      });
    }
    for (const letter of r.letters) {
      lines.push('letter: ' + letter.file + ' (' + letter.kind + ', ' + letter.sections.length + ' sections)');
      if (letter.intro) lines.push('  for: ' + letter.intro);
      letter.sections.forEach((s, i) => {
        lines.push(`  P${i + 1} ${s.section}` + (s.bullets.length ? ' · ' + s.bullets.join('; ') : ''));
        lines.push('     SOURCE ' + s.source);
        lines.push('     ACTION ' + s.action.slice(0, 220));
      });
    }
    if (r.diff) {
      lines.push('diff vs ' + r.diff.against + ': engine ' + r.diff.engineItems + ' items / pdf ' + r.diff.pdfSections + ' sections');
      if (r.diff.specsInPdfNotEngine.length) lines.push('  in PDF, not engine: ' + r.diff.specsInPdfNotEngine.join(', '));
      if (r.diff.specsInEngineNotPdf.length) lines.push('  in engine, not PDF: ' + r.diff.specsInEngineNotPdf.join(', '));
    }
    lines.push('');
  }
  return lines.join('\n');
}

function renderSummary(results) {
  const lines = ['SOS learn  ' + results.length + ' jobs', ''];
  let paired = 0;
  for (const r of results) {
    const hasForm = r.xlsFiles.length || (r.formFiles || []).length;
    const letter = (r.letters || []).find(l => l.kind === 'issued-letter' && l.sections.length);
    if (hasForm && letter) paired++;
    let status = 'unpaired';
    if (r.diff) {
      const miss = (r.diff.specsInPdfNotEngine || []).length;
      const extra = (r.diff.specsInEngineNotPdf || []).length;
      status = 'engine ' + r.diff.engineItems + ' / letter ' + r.diff.pdfSections;
      if (!miss && !extra) status += '  specs match';
      else {
        if (miss) status += '  letter-only ' + r.diff.specsInPdfNotEngine.join(',');
        if (extra) status += '  engine-only ' + r.diff.specsInEngineNotPdf.join(',');
      }
    } else if (!hasForm) status = 'letter only';
    else if (!letter) status = 'form only';
    lines.push('• ' + r.slug);
    lines.push('  ' + status);
  }
  lines.push('');
  lines.push('Paired form+letter: ' + paired + ' / ' + results.length);
  return lines.join('\n');
}

function main() {
  fs.mkdirSync(CASES, { recursive: true });
  fs.mkdirSync(DROP, { recursive: true });
  const extra = argvDirs();
  if (DIR_ONLY && !extra.length) {
    console.error('No --dir folder found. Pass --dir "C:\\path\\to\\SOS Program"');
    process.exit(1);
  }
  extra.forEach(d => console.error('Scanning ' + d));
  const results = discoverCases().map(compareCase);
  const text = renderText(results);
  fs.writeFileSync(path.join(ROOT, 'report.md'), text);
  fs.writeFileSync(path.join(ROOT, 'report.json'), JSON.stringify(results, null, 2));
  extra.forEach(dir => {
    try { fs.writeFileSync(path.join(dir, 'SOS-learn-report.md'), text); }
    catch (e) { console.error('Could not write report into ' + dir + ': ' + e.message); }
  });
  if (WANT_JSON) console.log(JSON.stringify(results, null, 2));
  else {
    console.log(VERBOSE ? text : renderSummary(results));
    console.log('\nFull report: sos/corpus/report.md');
    extra.forEach(dir => console.log('Copy: ' + path.join(dir, 'SOS-learn-report.md')));
  }
}

if (require.main === module) main();

module.exports = { pairKey, pairLooseFiles, appNumsFromName, gridFromForm, argvDirs, listFilesRecursive };
