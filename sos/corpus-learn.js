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
const Pack = require('./training-pack.js');

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
    if (Pack.isSkipLearnDir(name) || name.toLowerCase() === 'jobs') continue;
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
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
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

const pdfCache = new Map();

function inspectRecord(rec) {
  return {
    kind: rec.kind || 'unknown',
    appNums: rec.appNums || [],
    project: rec.project || {},
    itemCount: rec.itemCount || 0,
    specs: rec.specs || [],
    error: rec.error || '',
  };
}

function inspectPdf(pdfPath) {
  if (pdfCache.has(pdfPath)) return inspectRecord(pdfCache.get(pdfPath));
  const rec = JSON.parse(runScript([FORMPDF, '--inspect', pdfPath]));
  pdfCache.set(pdfPath, rec);
  return inspectRecord(rec);
}

function inspectPdfBatch(pdfs) {
  const pending = [...new Set((pdfs || []).filter(p => /\.pdf$/i.test(p) && !pdfCache.has(p)))];
  if (!pending.length) return;
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'sos-learn-'));
  const listFile = path.join(tmp, 'pdfs.txt');
  const outFile = path.join(tmp, 'inspect.jsonl');
  fs.writeFileSync(listFile, pending.join('\n'));
  console.error('Found ' + pending.length + ' PDFs. Opening each letter — this is the slow part. Leave the window open.');
  const r = spawnSync(PYTHON[0], PYTHON.slice(1).concat([FORMPDF, '--batch-inspect', listFile, outFile]), {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
  });
  if (r.status !== 0 || !fs.existsSync(outFile)) {
    console.error('Batch PDF read failed; opening files one at a time.');
    pending.forEach(p => {
      try {
        const rec = JSON.parse(runScript([FORMPDF, '--inspect', p]));
        rec.text = rec.text || '';
        pdfCache.set(p, rec);
      } catch (e) {
        pdfCache.set(p, { kind: 'unknown', appNums: [], error: e.message, text: '' });
      }
    });
  } else {
    fs.readFileSync(outFile, 'utf8').split('\n').forEach(line => {
      if (!line.trim()) return;
      try {
        const rec = JSON.parse(line);
        if (rec.path) pdfCache.set(rec.path, rec);
      } catch (e) {}
    });
  }
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
}

function parseFormPdf(pdfPath) {
  const text = readPdf(pdfPath);
  return require('./sos-formpdf.js').parseFormText(text, { filename: path.basename(pdfPath) });
}

function gridFromForm(parsed) {
  return require('./sos-formpdf.js').gridFromForm(parsed);
}

function readGrid(xlsPath) {
  const Fetch = require('./fetch-lists.js');
  return Fetch.readSpreadsheetGrid(xlsPath);
}

function readPdf(pdfPath) {
  const cached = pdfCache.get(pdfPath);
  if (cached && cached.text != null && cached.text !== '') return cached.text;
  const code = `
import sys
from pypdf import PdfReader
reader = PdfReader(sys.argv[1])
parts = []
for page in reader.pages:
    parts.append(page.extract_text() or '')
print('\\f'.join(parts))
`;
  const text = runPython(code, [pdfPath]);
  const rec = pdfCache.get(pdfPath) || { kind: 'unknown', appNums: [] };
  rec.text = text;
  pdfCache.set(pdfPath, rec);
  return text;
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

function titleCaseName(s) {
  return squeeze(s).split(/\s+/).map(w => {
    if (/^mc[a-z]/i.test(w)) return 'Mc' + w.slice(2, 3).toUpperCase() + w.slice(3).toLowerCase();
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(' ');
}

function looksLikePersonName(s) {
  const t = squeeze(s).replace(/^cc:\s*/i, '');
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) return false;
  if (t.length < 5 || t.length > 42) return false;
  if (/\d/.test(t)) return false;
  if (/^(section|source|action|page|secretary|delaware|materials|research|deldot)$/i.test(words[0])) return false;
  return words.every(w => /^[A-Za-z][A-Za-z.'-]*$/.test(w));
}

/** Names from the cc: block on an issued SOS letter. */
function parseCcPeople(text) {
  const people = [];
  const raw = String(text || '');
  const idx = raw.search(/\bcc:\s*/i);
  if (idx < 0) return people;
  let block = raw.slice(idx);
  block = block.split(/SHANT[ÉE]\s+A\.\s+HASTINGS|If you have any questions|Page\s+\d+\s+of/i)[0];
  const seen = new Set();
  block.split(/\n/).forEach(line => {
    let t = squeeze(line).replace(/^cc:\s*/i, '');
    if (!t) return;
    if (/^(section:|source:|action:)/i.test(t)) return;
    t.split(/\s*;\s*/).forEach(part => {
      const bits = squeeze(part).split(',').map(x => squeeze(x));
      const name = bits[0];
      if (!looksLikePersonName(name)) return;
      const pretty = titleCaseName(name);
      const key = pretty.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      const orgBit = bits.slice(1).join(', ');
      const org = /deldot/i.test(orgBit) || /deldot/i.test(part) ? 'DelDOT'
        : (orgBit && !/^\d/.test(orgBit) && orgBit.length < 40 ? orgBit : 'DelDOT');
      people.push({ name: pretty, org });
    });
  });
  return people;
}

function harvestCcFromResults(results) {
  const counts = new Map();
  let letters = 0;
  (results || []).forEach(r => {
    (r.letters || []).forEach(letter => {
      if (letter.kind !== 'issued-letter' || !(letter.cc || []).length) return;
      letters++;
      const seen = new Set();
      letter.cc.forEach(p => {
        const name = titleCaseName(typeof p === 'string' ? String(p).split(',')[0] : p.name);
        if (!looksLikePersonName(name)) return;
        const key = name.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        const org = (p && p.org) || 'DelDOT';
        const cur = counts.get(key) || { name, org, letters: 0 };
        cur.letters += 1;
        counts.set(key, cur);
      });
    });
  });
  const people = [...counts.values()].sort((a, b) => b.letters - a.letters || a.name.localeCompare(b.name));
  const threshold = Math.max(2, Math.ceil(letters * 0.4));
  const always = people.filter(p => p.letters >= threshold);
  return {
    generatedAt: new Date().toISOString(),
    letters,
    always: always.map(p => ({ name: p.name, org: p.org })),
    people,
  };
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
  const cc = parseCcPeople(text);
  const introM = text.match(/reviewed by this office for\s+([\s\S]*?)\s+as to their acceptability/i);
  return {
    kind: 'issued-letter',
    intro: introM ? squeeze(introM[1]) : '',
    sections: blocks,
    cc,
  };
}

function appNumsFromName(filename) {
  return contractKeysFrom(filename);
}

/** Compact contract / application keys: T2024-062-02 == T202406202, CA 2525, 9-digit apps. */
function contractKey(raw) {
  return contractKeysFrom(raw)[0] || '';
}

function contractKeysFrom(raw) {
  const s = String(raw || '').toUpperCase();
  const keys = [];
  const seen = new Set();
  const add = (k) => {
    if (!k || seen.has(k)) return;
    seen.add(k);
    keys.push(k);
  };
  const compact = s.replace(/[\s._/-]/g, '');
  let m;
  const tRe = /T(\d{4})(\d{3})(\d{2})/g;
  while ((m = tRe.exec(compact))) add('T' + m[1] + m[2] + m[3]);
  const caRe = /CA(\d{3,5})/g;
  while ((m = caRe.exec(compact))) add('CA' + m[1]);
  const appRe = /\b(\d{9,10})\b/g;
  while ((m = appRe.exec(s))) {
    add(m[1]);
    // T2026-031-09 compact is T202603109; some forms only store 202603109.
    if (/^20\d{7}$/.test(m[1])) add('T' + m[1]);
  }
  // Form contract field "2525" should match issued letters named CA 2525.
  const leadCa = s.trim().match(/^(\d{3,5})(?!\d)/);
  if (leadCa) add('CA' + leadCa[1]);
  return keys;
}

function filenameAppIds(filename) {
  return contractKeysFrom(filename).filter(k => /^\d{9,10}$/.test(k));
}

function loadProgramSnapshot(dir) {
  if (!dir || !fs.existsSync(dir)) return null;
  const txtNames = ['program-output.txt', 'letter.txt'];
  for (const name of txtNames) {
    const full = path.join(dir, name);
    if (!fs.existsSync(full)) continue;
    try {
      const parsed = parseIssuedSections(fs.readFileSync(full, 'utf8'));
      if (parsed && parsed.sections && parsed.sections.length) {
        return { file: name, ...parsed };
      }
    } catch (e) {}
  }
  const jsonNames = ['items.json', 'job.json'];
  for (const name of jsonNames) {
    const full = path.join(dir, name);
    if (!fs.existsSync(full)) continue;
    try {
      const rec = JSON.parse(fs.readFileSync(full, 'utf8'));
      const items = rec.items || [];
      if (!items.length) continue;
      return {
        file: name,
        kind: 'program-output',
        intro: rec.project ? [rec.project.contract, rec.project.title].filter(Boolean).join(' ') : '',
        sections: items.map(it => ({
          section: (it.specs || it.letterSpecs || []).join(' ') + (it.section ? ' ' + it.section : ''),
          source: it.source || it.srcName || '',
          action: it.notes || it.actionNotes || it.action || '',
          bullets: it.subs || it.subItems || [],
        })),
        cc: rec.cc || [],
      };
    } catch (e) {}
  }
  return null;
}

function discoverCases() {
  const cases = [];
  const inspected = {};
  console.error('Listing PDFs and spreadsheets (OneDrive can sit here a minute)…');
  const inspectAll = (files) => {
    const pdfs = files.filter(p => /\.pdf$/i.test(p));
    inspectPdfBatch(pdfs);
    pdfs.forEach(p => {
      if (inspected[p]) return;
      if (pdfCache.has(p)) inspected[p] = inspectRecord(pdfCache.get(p));
      else inspected[p] = { kind: 'unknown', appNums: [] };
    });
  };

  const takeFolder = (dir, slug) => {
    const xls = listFiles(dir, ['.xls', '.xlsx']);
    const pdfs = listFiles(dir, ['.pdf']).filter(p => !Pack.isProgramOutputFile(p));
    if (!xls.length && !pdfs.length && !loadProgramSnapshot(dir)) return;
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
    const jobsDir = path.join(dir, 'jobs');
    if (fs.existsSync(jobsDir)) {
      listDirs(jobsDir).forEach(jobDir => takeFolder(jobDir, 'jobs/' + path.basename(jobDir)));
    }
    loose.push(...listFilesRecursive(dir, ['.xls', '.xlsx', '.pdf']));
  });
  const pdfCount = loose.filter(p => /\.pdf$/i.test(p)).length;
  const xlsCount = loose.filter(p => /\.xlsx?$/i.test(p)).length;
  if (pdfCount || xlsCount) {
    console.error('Listed ' + pdfCount + ' PDFs and ' + xlsCount + ' spreadsheets.');
  }

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
  const xls = files.filter(p => /\.xlsx?$/i.test(p) && !Pack.isProgramOutputFile(p));
  const pdfs = files.filter(p => /\.pdf$/i.test(p) && !Pack.isProgramOutputFile(p));
  const all = [...xls, ...pdfs];

  const keysFor = (file) => {
    const keys = [];
    const name = pairKey(file);
    if (name) keys.push('name:' + name);
    appNumsFromName(file).forEach(n => keys.push('id:' + n));
    const info = inspected[file];
    (info && info.appNums || []).forEach(n => {
      contractKeysFrom(n).forEach(k => keys.push('id:' + k));
      keys.push('app:' + n);
    });
    if (info && info.project && info.project.contract) {
      contractKeysFrom(info.project.contract).forEach(k => keys.push('id:' + k));
    }
    return [...new Set(keys)];
  };

  const parent = new Map();
  all.forEach(f => parent.set(f, f));
  const find = (f) => {
    while (parent.get(f) !== f) {
      parent.set(f, parent.get(parent.get(f)));
      f = parent.get(f);
    }
    return f;
  };
  const hardIdsIn = (root) => {
    const ids = new Set();
    all.forEach(f => {
      if (find(f) !== root) return;
      filenameAppIds(f).forEach(n => ids.add(n));
    });
    return ids;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return true;
    const idsA = hardIdsIn(ra);
    const idsB = hardIdsIn(rb);
    const combined = new Set([...idsA, ...idsB]);
    if (combined.size > 1) return false;
    parent.set(rb, ra);
    return true;
  };

  const byKey = new Map();
  for (const f of all) {
    for (const k of keysFor(f)) {
      if (byKey.has(k)) union(byKey.get(k), f);
      if (!byKey.has(k) || find(byKey.get(k)) === find(f)) byKey.set(k, f);
    }
  }

  const grouped = new Map();
  for (const f of all) {
    const root = find(f);
    if (!grouped.has(root)) grouped.set(root, { xls: [], pdfs: [], formPdfs: [] });
    const g = grouped.get(root);
    if (/\.xlsx?$/i.test(f)) g.xls.push(f);
    else if (inspected[f] && inspected[f].kind === 'contractor-form') g.formPdfs.push(f);
    else g.pdfs.push(f);
  }

  const cases = [];
  for (const g of grouped.values()) {
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
    sampler: Engine.samplerName(result.project && result.project.district),
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

function specSetFrom(itemsOrSections, kind) {
  const set = new Set();
  (itemsOrSections || []).forEach(row => {
    const blob = kind === 'engine'
      ? ((row.specs || []).join(' ') + ' ' + (row.section || ''))
      : (row.section || '');
    specTokens(blob).forEach(s => set.add(s));
  });
  return set;
}

function specDiff(left, right) {
  const missing = [...right].filter(s => ![...left].some(e => e.replace('#', '') === s.replace('#', '')));
  const extra = [...left].filter(s => ![...right].some(p => p.replace('#', '') === s.replace('#', '')));
  return { missing, extra };
}

function attachDiff(out) {
  const issued = (out.letters || [])
    .filter(l => l.kind === 'issued-letter' && l.sections.length)
    .sort((a, b) => b.sections.length - a.sections.length);
  const letter = issued[0];
  const issuedSpecs = letter ? specSetFrom(letter.sections) : new Set();
  if (out.engine && letter) {
    const engSpecs = specSetFrom(out.engine.items, 'engine');
    const d = specDiff(engSpecs, issuedSpecs);
    out.diff = {
      against: letter.file,
      engineItems: out.engine.items.length,
      pdfSections: letter.sections.length,
      specsInPdfNotEngine: d.missing,
      specsInEngineNotPdf: d.extra,
      pdfIntro: letter.intro,
      enginePhrase: Engine.contractPhrase(out.engine.project),
    };
  } else {
    delete out.diff;
  }
  if (out.program && letter) {
    const progSpecs = specSetFrom(out.program.sections);
    const d = specDiff(progSpecs, issuedSpecs);
    out.programDiff = {
      against: letter.file,
      programFile: out.program.file,
      programSections: (out.program.sections || []).length,
      pdfSections: letter.sections.length,
      specsInIssuedNotProgram: d.missing,
      specsInProgramNotIssued: d.extra,
    };
  } else {
    delete out.programDiff;
  }
  return out;
}

function resultContractKeys(r) {
  const keys = [];
  const addAll = (s) => { contractKeysFrom(s).forEach(k => keys.push(k)); };
  addAll(r.slug);
  (r.xlsFiles || []).forEach(addAll);
  (r.formFiles || []).forEach(addAll);
  (r.pdfFiles || []).forEach(addAll);
  if (r.engine && r.engine.project) {
    addAll(r.engine.project.contract || '');
    addAll((r.engine.project.contract || '') + ' ' + (r.engine.project.title || ''));
  }
  (r.letters || []).forEach(l => {
    addAll(l.file);
    addAll(l.intro);
  });
  return [...new Set(keys)];
}

function resultFilenameAppIds(r) {
  const ids = new Set();
  const add = (s) => filenameAppIds(s).forEach(n => ids.add(n));
  add(r.slug);
  (r.xlsFiles || []).forEach(add);
  (r.formFiles || []).forEach(add);
  (r.pdfFiles || []).forEach(add);
  return ids;
}

function mergeOneGroup(group) {
  if (group.length === 1) return attachDiff(group[0]);
  const withEngine = group.find(g => g.engine);
  const out = {
    slug: (withEngine && withEngine.slug) || group.map(g => g.slug).sort((a, b) => a.length - b.length)[0],
    dir: (withEngine && withEngine.dir) || group[0].dir,
    xlsFiles: [...new Set(group.flatMap(g => g.xlsFiles || []))],
    formFiles: [...new Set(group.flatMap(g => g.formFiles || []))],
    pdfFiles: [...new Set(group.flatMap(g => g.pdfFiles || []))],
    unfiled: group.some(g => g.unfiled),
    engine: (withEngine && withEngine.engine) || null,
    program: (group.find(g => g.program) || {}).program || null,
    letters: [],
    notes: [],
  };
  const seenLetter = new Set();
  group.forEach(g => {
    (g.letters || []).forEach(l => {
      const id = l.file || JSON.stringify(l.intro);
      if (seenLetter.has(id)) return;
      seenLetter.add(id);
      out.letters.push(l);
    });
  });
  const seenNote = new Set();
  group.forEach(g => {
    (g.notes || []).forEach(n => {
      if (out.engine && /PDF only|letter only|add the contractor/i.test(n)) return;
      if (seenNote.has(n)) return;
      seenNote.add(n);
      out.notes.push(n);
    });
  });
  return attachDiff(out);
}

function mergeComparedResults(results) {
  const parent = results.map((_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const byKey = new Map();
  const canMerge = (a, b) => {
    const idsA = resultFilenameAppIds(results[a]);
    const idsB = resultFilenameAppIds(results[b]);
    const combined = new Set([...idsA, ...idsB]);
    return combined.size <= 1;
  };
  results.forEach((r, i) => {
    resultContractKeys(r).forEach(k => {
      if (byKey.has(k)) {
        const a = find(byKey.get(k));
        const b = find(i);
        if (a !== b && canMerge(a, b)) parent[b] = a;
      } else {
        byKey.set(k, i);
      }
    });
  });
  const groups = new Map();
  results.forEach((r, i) => {
    const p = find(i);
    if (!groups.has(p)) groups.set(p, []);
    groups.get(p).push(r);
  });
  return [...groups.values()].map(mergeOneGroup);
}

function specTokens(s) {
  return [...String(s || '').matchAll(/#?\d{6}|#\d+xxx/gi)].map(m => {
    const t = m[0].toUpperCase();
    return t.startsWith('#') ? t : '#' + t;
  });
}

function canonSpec(tok) {
  const t = String(tok || '').toUpperCase().replace(/^#+/, '');
  if (/^\d{6}/.test(t)) return '#' + t.slice(0, 6);
  if (/^\d+XXX$/.test(t)) return '#' + t;
  return t ? '#' + t : '';
}

function actionIntent(text) {
  const t = String(text || '').toLowerCase();
  if (/pending jmf/.test(t)) return 'not-approved';
  if (/not approved/.test(t)) return 'not-approved';
  if (/must be tested|tested and approved prior/.test(t)) return 'test';
  if (/visual inspection/.test(t)) return 'visual';
  if (/\bon apl\b|approved products list|choose a product from the apl/.test(t)) return 'apl';
  if (/state inspected stock/.test(t)) return 'on-file';
  if (/\bsubmit\b/.test(t) && /tack|curing|expansion|manufacturer/.test(t)) return 'submit';
  if (/approved/.test(t)) return 'approved';
  return 'other';
}

function stockActionPhrase(text) {
  return squeeze(text).split(/\s+Contact\s+/i)[0].replace(/\s*\|\s*/g, ' ').trim();
}

function familyGuess(section, specs) {
  const spec = canonSpec(specs[0] || '');
  const desc = String(section || '');
  try { return Engine.familyFromSpec(spec, desc, desc) || 'other'; }
  catch (e) { return 'other'; }
}

function bumpPhrase(map, key, rec) {
  if (!map.has(key)) map.set(key, { letters: 0, family: rec.family || '', phrases: new Map() });
  const row = map.get(key);
  row.letters += 1;
  if (rec.family && !row.family) row.family = rec.family;
  const pk = stockActionPhrase(rec.action).toLowerCase().slice(0, 280);
  if (!pk) return;
  if (pk.length < 8 && rec.intent === 'other') return;
  const cur = row.phrases.get(pk) || { count: 0, action: stockActionPhrase(rec.action), intent: rec.intent };
  cur.count += 1;
  if (stockActionPhrase(rec.action).length > cur.action.length) cur.action = stockActionPhrase(rec.action);
  row.phrases.set(pk, cur);
}

function pickHarvestRows(map, minUses) {
  const out = {};
  for (const [key, row] of map) {
    const ranked = [...row.phrases.values()].sort((a, b) => b.count - a.count || b.action.length - a.action.length);
    const best = ranked[0];
    if (!best || best.count < minUses) continue;
    out[key] = {
      letters: row.letters,
      family: row.family || '',
      intent: best.intent,
      action: best.action,
      uses: best.count,
    };
  }
  return out;
}

/** Split SOURCE into primary + alt plants listed after | Alt: */
function splitIssuedSources(source) {
  return String(source || '')
    .split(/\s*\|\s*Alt:\s*/i)
    .map(s => squeeze(s))
    .filter(Boolean);
}

function parseIssuedSource(source) {
  let s = squeeze(source).replace(/^SOURCE:\s*/i, '');
  if (!s || /^n\/?a$/i.test(s) || /^tbd$/i.test(s) || s.length < 3) return null;
  let name = s;
  let rest = '';
  const dash = s.match(/^(.*?)\s+[-–—]\s+(.*)$/);
  if (dash) {
    name = squeeze(dash[1]);
    rest = squeeze(dash[2]);
  }
  name = squeeze(name);
  if (!name || /^manufacturer$/i.test(name)) return null;
  let phone = '';
  const ph = rest.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/);
  if (ph) {
    phone = ph[0];
    rest = squeeze(rest.replace(ph[0], '')).replace(/[|,]\s*$/, '');
  }
  let loc = '';
  let addr = '';
  const locM = rest.match(/([A-Za-z][A-Za-z .'-]{1,40}),?\s+(DE|MD|PA|NJ|VA|NC|NY|OH|IN|GA|AL|UT|AZ|IL|WI|CA|TX)\s*\d{0,5}\.?$/i);
  if (locM) {
    loc = squeeze(locM[1].replace(/,\s*$/, '') + ' ' + locM[2].toUpperCase());
    addr = squeeze(rest.slice(0, locM.index).replace(/[|,]\s*$/, ''));
  } else {
    loc = rest;
  }
  if (/^manufacturer$/i.test(addr)) addr = '';
  return { name, loc, addr, phone };
}

function tagsForFamily(family) {
  const map = {
    aggregate: ['GABC', 'Stone'],
    borrow: ['Borrow'],
    'hma-mix': ['Asphalt'],
    tack: ['Tack Coat', 'Asphalt', 'APL'],
    'crack-seal': ['Crack Sealing', 'APL'],
    pcc: ['Concrete'],
    rcp: ['RCP', 'Precast'],
    precast: ['Precast'],
    striping: ['APL'],
    geotextile: ['Geotextile'],
    erosion: ['Erosion Control'],
    topsoil: ['Topsoil'],
    seed: ['Seed'],
    riprap: ['Riprap', 'Stone'],
    hdpe: ['Pipe', 'HDPE'],
    castings: ['Drainage', 'APL'],
    ttc: ['Traffic Control', 'APL'],
  };
  return map[family] || [];
}

function bumpSource(map, rec, tags) {
  if (!rec || !rec.name) return;
  const locKey = String(rec.loc || '').toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  const key = rec.name.toLowerCase() + '|' + locKey;
  const cur = map.get(key) || {
    name: rec.name,
    loc: rec.loc || '',
    addr: rec.addr || '',
    phone: rec.phone || '',
    tags: [],
    letters: 0,
  };
  cur.letters += 1;
  if (rec.loc && rec.loc.length > cur.loc.length) cur.loc = rec.loc;
  if (rec.addr && rec.addr.length > cur.addr.length) cur.addr = rec.addr;
  if (rec.phone && !cur.phone) cur.phone = rec.phone;
  (tags || []).forEach(t => { if (t && !cur.tags.includes(t)) cur.tags.push(t); });
  map.set(key, cur);
}

function bumpSpec(map, num, desc, src) {
  const key = canonSpec(num);
  if (!key) return;
  const cur = map.get(key) || {
    num: key,
    desc: '',
    lastSrcName: '',
    lastSrcLoc: '',
    lastSrcAddr: '',
    lastSrcPhone: '',
    letters: 0,
  };
  cur.letters += 1;
  if (desc && desc.length > cur.desc.length) cur.desc = desc;
  if (src && src.name) {
    cur.lastSrcName = src.name;
    if (src.loc) cur.lastSrcLoc = src.loc;
    if (src.addr) cur.lastSrcAddr = src.addr;
    if (src.phone) cur.lastSrcPhone = src.phone;
  }
  map.set(key, cur);
}

/** Plants and spec numbers from issued letters (and contractor forms when present). */
function harvestLibrariesFromResults(results) {
  const sources = new Map();
  const specs = new Map();
  let letters = 0;
  (results || []).forEach(r => {
    (r.letters || []).forEach(letter => {
      if (letter.kind !== 'issued-letter') return;
      letters += 1;
      (letter.sections || []).forEach(s => {
        const family = familyGuess(s.section, specTokens(s.section));
        const tags = tagsForFamily(family);
        const parsedSources = splitIssuedSources(s.source).map(parseIssuedSource).filter(Boolean);
        parsedSources.forEach(src => bumpSource(sources, src, tags));
        const desc = squeeze(String(s.section || '').replace(/#?\d{6}/g, '').replace(/^[\s|,:.-]+/, ''));
        specTokens(s.section).forEach(tok => bumpSpec(specs, tok, desc, parsedSources[0]));
      });
    });
    ((r.engine && r.engine.items) || []).forEach(it => {
      const tags = tagsForFamily(it.family);
      splitIssuedSources(it.source).map(parseIssuedSource).filter(Boolean).forEach(src => bumpSource(sources, src, tags));
      (it.specs || []).forEach(tok => {
        bumpSpec(specs, tok, it.section || '', parseIssuedSource(splitIssuedSources(it.source)[0] || ''));
      });
    });
  });
  return {
    kind: 'issued-libraries',
    generatedAt: new Date().toISOString(),
    letters,
    sources: [...sources.values()].sort((a, b) => b.letters - a.letters || a.name.localeCompare(b.name)),
    specs: [...specs.values()].sort((a, b) => a.num.localeCompare(b.num)),
  };
}
function harvestLanguageFromResults(results) {
  const bySpec = new Map();
  const byFamily = new Map();
  let letters = 0;
  let sections = 0;
  (results || []).forEach(r => {
    (r.letters || []).forEach(letter => {
      if (letter.kind !== 'issued-letter') return;
      letters += 1;
      (letter.sections || []).forEach(s => {
        const action = squeeze(s.action);
        const intent = actionIntent(action);
        if (action.length < 8 && intent === 'other') return;
        const specs = specTokens(s.section).map(canonSpec).filter(Boolean);
        if (!specs.length) return;
        sections += 1;
        const family = familyGuess(s.section, specs);
        specs.forEach(spec => bumpPhrase(bySpec, spec, { action, intent, family }));
        if (family && family !== 'other') bumpPhrase(byFamily, family, { action, intent, family });
      });
    });
  });
  return {
    kind: 'issued-language',
    generatedAt: new Date().toISOString(),
    letters,
    sections,
    bySpec: pickHarvestRows(bySpec, 1),
    byFamily: pickHarvestRows(byFamily, 2),
  };
}

function loadListsForDir(dir) {
  const Lists = require('./sos-lists.js');
  let bundle = Lists.emptyBundle();
  const snap = path.join(__dirname, 'lists', 'apl-snapshot.json');
  if (fs.existsSync(snap)) {
    try { bundle = Lists.mergeBundle(bundle, JSON.parse(fs.readFileSync(snap, 'utf8'))); }
    catch (e) {}
  }
  if (dir) {
    const json = path.join(dir, 'SOS-lists.json');
    if (fs.existsSync(json)) {
      try { bundle = Lists.mergeBundle(bundle, JSON.parse(fs.readFileSync(json, 'utf8'))); }
      catch (e) {}
    }
    const langFile = path.join(dir, 'SOS-language.json');
    if (fs.existsSync(langFile)) {
      try {
        const language = JSON.parse(fs.readFileSync(langFile, 'utf8'));
        if (language && language.bySpec) bundle.language = language;
      } catch (e) {}
    }
    const ccFile = path.join(dir, 'SOS-cc.json');
    if (fs.existsSync(ccFile)) {
      try {
        const harvest = JSON.parse(fs.readFileSync(ccFile, 'utf8'));
        bundle.ccAlways = harvest.always || [];
      } catch (e) {}
    }
    const rulesFile = path.join(dir, 'SOS-cc-rules.json');
    if (fs.existsSync(rulesFile)) {
      try {
        const rules = JSON.parse(fs.readFileSync(rulesFile, 'utf8'));
        if (Array.isArray(rules.ccAssignments)) bundle.ccAssignments = rules.ccAssignments;
        if (rules.contacts) bundle.contacts = rules.contacts;
      } catch (e) {}
    }
  }
  try {
    const Fetch = require('./fetch-lists.js');
    const cfg = {};
    try {
      const watch = path.join(__dirname, 'SOS-watch.json');
      if (fs.existsSync(watch)) Object.assign(cfg, JSON.parse(fs.readFileSync(watch, 'utf8')));
    } catch (e) {}
    const aggSnap = path.join(__dirname, 'lists', 'aggregate-snapshot.json');
    if (fs.existsSync(aggSnap)) {
      try { bundle.aggregate = JSON.parse(fs.readFileSync(aggSnap, 'utf8')); }
      catch (e) {}
    }
    const chart = Fetch.resolveAggregateChart(dir, cfg);
    if (chart) {
      bundle.aggregate = Fetch.loadAggregateChart(chart);
    }
  } catch (e) {}
  return bundle;
}

function compareCase(c, lists) {
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
      const result = Engine.processGrid(grid, { filename: path.basename(c.xls[0]), lists });
      out.engine = engineSummary(result);
    } catch (e) {
      out.notes.push('Could not parse spreadsheet: ' + e.message);
    }
  } else if ((c.formPdfs || []).length) {
    try {
      const parsed = parseFormPdf(c.formPdfs[0]);
      out.notes.push('Contractor form is a PDF (not .xls) — parsed the spec table from the PDF.');
      const grid = gridFromForm(parsed);
      const result = Engine.processGrid(grid, { filename: path.basename(c.formPdfs[0]), lists });
      out.engine = engineSummary(result);
    } catch (e) {
      out.notes.push('Could not parse contractor form PDF: ' + e.message);
    }
  } else {
    out.notes.push('Letter only (no contractor spreadsheet). SECTION / SOURCE / ACTION language is still harvested.');
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

  const program = loadProgramSnapshot(c.dir);
  if (program) out.program = program;

  attachDiff(out);
  return out;
}

function renderLanguageHarvest(language) {
  const lines = [];
  if (!language || !language.letters) {
    lines.push('Language: no issued-letter SECTION/ACTION blocks harvested yet.');
    return lines;
  }
  const specs = Object.keys(language.bySpec || {});
  const families = Object.keys(language.byFamily || {});
  lines.push('Language harvested from ' + language.letters + ' issued letters (' + language.sections + ' sections, ' + specs.length + ' spec numbers). No contractor .xls required.');
  families.sort().forEach(f => {
    const row = language.byFamily[f];
    lines.push('  ' + f + ' ×' + row.uses + ' — ' + squeeze(row.action).slice(0, 140));
  });
  const top = specs
    .map(s => ({ spec: s, row: language.bySpec[s] }))
    .sort((a, b) => b.row.uses - a.row.uses)
    .slice(0, 25);
  top.forEach(({ spec, row }) => {
    lines.push('  ' + spec + ' ×' + row.uses + ' [' + (row.family || '?') + '] — ' + squeeze(row.action).slice(0, 120));
  });
  if (specs.length > 25) lines.push('  … ' + (specs.length - 25) + ' more specs in SOS-language.json');
  return lines;
}

function renderCcHarvest(h) {
  const lines = [];
  if (!h || !h.letters) {
    lines.push('CC: no issued letters with a readable cc: block yet.');
    return lines;
  }
  lines.push('CC harvested from ' + h.letters + ' issued letters (always = on ≥40%, min 2)');
  if (h.always.length) lines.push('Always CC: ' + h.always.map(p => p.name).join(', '));
  else lines.push('Always CC: (none yet)');
  h.people.slice(0, 40).forEach(p => {
    lines.push('  ' + p.name + ', ' + p.org + ' — ' + p.letters);
  });
  return lines;
}

function renderLibrariesHarvest(libraries) {
  const lines = [];
  if (!libraries || !libraries.letters) {
    lines.push('Libraries: no issued-letter SOURCE / SECTION blocks harvested yet.');
    return lines;
  }
  lines.push('Libraries harvested from ' + libraries.letters + ' issued letters: ' + (libraries.sources || []).length + ' sources, ' + (libraries.specs || []).length + ' spec numbers.');
  (libraries.sources || []).slice(0, 20).forEach(s => {
    lines.push('  ' + s.name + (s.loc ? ' — ' + s.loc : '') + ' ×' + s.letters);
  });
  if ((libraries.sources || []).length > 20) lines.push('  … ' + (libraries.sources.length - 20) + ' more in SOS-libraries.json');
  return lines;
}

function renderText(results, harvest, language, libraries) {
  const lines = [];
  lines.push('SOS corpus learn');
  lines.push('Cases: ' + results.length);
  lines.push('');
  lines.push(...renderCcHarvest(harvest));
  lines.push('');
  lines.push(...renderLanguageHarvest(language));
  lines.push('');
  lines.push(...renderLibrariesHarvest(libraries));
  lines.push('');
  if (!results.length) {
    lines.push('No files yet. Put issued SOS letter PDFs (and contractor forms if you have them) in the SOS Program folder.');
    lines.push('See sos/corpus/README.md');
    return lines.join('\n');
  }
  const DETAIL_CAP = 60;
  const paired = results.filter(r => r.engine && (r.letters || []).length);
  const rest = results.filter(r => !(r.engine && (r.letters || []).length));
  let toShow = results;
  if (results.length > DETAIL_CAP) {
    toShow = paired.concat(rest.slice(0, Math.max(0, DETAIL_CAP - paired.length)));
    lines.push('Showing ' + toShow.length + ' of ' + results.length + ' jobs. Letter-only language is in SOS-language.json.');
    lines.push('');
  }
  for (const r of toShow) {
    lines.push('═'.repeat(72));
    lines.push(r.slug);
    lines.push('xls: ' + (r.xlsFiles.join(', ') || '(none)'));
    if (r.formFiles && r.formFiles.length) lines.push('form-pdf: ' + r.formFiles.join(', '));
    lines.push('pdf: ' + (r.pdfFiles.join(', ') || '(none)'));
    r.notes.forEach(n => lines.push('note: ' + n));
    if (r.engine) {
      const p = r.engine.project || {};
      lines.push('engine project: ' + [p.contract, p.title, p.contractor].filter(Boolean).join(' · '));
      if (r.engine.cc && r.engine.cc.length) lines.push('engine cc: ' + r.engine.cc.join('; '));
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
      if (letter.cc && letter.cc.length) {
        lines.push('  cc: ' + letter.cc.map(p => p.name + ', ' + p.org).join('; '));
      }
      letter.sections.forEach((s, i) => {
        lines.push(`  P${i + 1} ${s.section}` + (s.bullets.length ? ' · ' + s.bullets.join('; ') : ''));
        lines.push('     SOURCE ' + s.source);
        lines.push('     ACTION ' + s.action.slice(0, 220));
      });
    }
    if (r.program) {
      lines.push('program-output: ' + r.program.file + ' (' + (r.program.sections || []).length + ' sections)');
    }
    if (r.diff) {
      lines.push('diff vs ' + r.diff.against + ': engine ' + r.diff.engineItems + ' items / pdf ' + r.diff.pdfSections + ' sections');
      if (r.diff.specsInPdfNotEngine.length) lines.push('  in PDF, not engine: ' + r.diff.specsInPdfNotEngine.join(', '));
      if (r.diff.specsInEngineNotPdf.length) lines.push('  in engine, not PDF: ' + r.diff.specsInEngineNotPdf.join(', '));
    }
    if (r.programDiff) {
      lines.push('program vs sent ' + r.programDiff.against + ': ' + r.programDiff.programFile + ' ' + r.programDiff.programSections + ' / issued ' + r.programDiff.pdfSections);
      if (r.programDiff.specsInIssuedNotProgram.length) lines.push('  in sent letter, not program output: ' + r.programDiff.specsInIssuedNotProgram.join(', '));
      if (r.programDiff.specsInProgramNotIssued.length) lines.push('  in program output, not sent letter: ' + r.programDiff.specsInProgramNotIssued.join(', '));
    }
    lines.push('');
  }
  return lines.join('\n');
}

function renderSummary(results, harvest, language) {
  const lines = ['SOS learn  ' + results.length + ' jobs', ''];
  lines.push(...renderCcHarvest(harvest));
  lines.push('');
  lines.push(...renderLanguageHarvest(language));
  lines.push('');
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
    } else if (r.programDiff) {
      const miss = (r.programDiff.specsInIssuedNotProgram || []).length;
      const extra = (r.programDiff.specsInProgramNotIssued || []).length;
      status = 'program ' + r.programDiff.programSections + ' / sent ' + r.programDiff.pdfSections;
      if (!miss && !extra) status += '  specs match';
    } else if (!hasForm) status = 'letter only (language harvested)';
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
  const lists = loadListsForDir(extra[0] || '');
  if (lists.tack && lists.tack.entries && lists.tack.entries.length) {
    console.error('APL snapshot: ' + require('./sos-lists.js').summary(lists));
  }
  const results = mergeComparedResults(discoverCases().map(c => compareCase(c, lists)));
  const harvest = harvestCcFromResults(results);
  const language = harvestLanguageFromResults(results);
  const libraries = harvestLibrariesFromResults(results);
  const text = renderText(results, harvest, language, libraries);
  fs.writeFileSync(path.join(ROOT, 'report.md'), text);
  fs.writeFileSync(path.join(ROOT, 'report.json'), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(ROOT, 'cc-harvest.json'), JSON.stringify(harvest, null, 2));
  fs.writeFileSync(path.join(ROOT, 'language-harvest.json'), JSON.stringify(language, null, 2));
  fs.writeFileSync(path.join(ROOT, 'libraries-harvest.json'), JSON.stringify(libraries, null, 2));
  extra.forEach(dir => {
    try { fs.writeFileSync(path.join(dir, 'SOS-learn-report.md'), text); }
    catch (e) { console.error('Could not write report into ' + dir + ': ' + e.message); }
    try { fs.writeFileSync(path.join(dir, 'SOS-cc.json'), JSON.stringify(harvest, null, 2)); }
    catch (e) { console.error('Could not write SOS-cc.json into ' + dir + ': ' + e.message); }
    try { fs.writeFileSync(path.join(dir, 'SOS-language.json'), JSON.stringify(language, null, 2)); }
    catch (e) { console.error('Could not write SOS-language.json into ' + dir + ': ' + e.message); }
    try { fs.writeFileSync(path.join(dir, 'SOS-libraries.json'), JSON.stringify(libraries, null, 2)); }
    catch (e) { console.error('Could not write SOS-libraries.json into ' + dir + ': ' + e.message); }
  });
  if (WANT_JSON) console.log(JSON.stringify({ results, harvest, language, libraries }, null, 2));
  else {
    console.log(VERBOSE ? text : renderSummary(results, harvest, language));
    console.log('\nFull report: sos/corpus/report.md');
    extra.forEach(dir => {
      console.log('Copy: ' + path.join(dir, 'SOS-learn-report.md'));
      console.log('CC list: ' + path.join(dir, 'SOS-cc.json') + '  (drop this on the CC tab)');
      console.log('Language: ' + path.join(dir, 'SOS-language.json') + '  (drop this on APL / Chart)');
      console.log('Sources/specs: ' + path.join(dir, 'SOS-libraries.json') + '  (drop this on Source Library or Spec Library)');
    });
  }
}

if (require.main === module) main();

module.exports = {
  pairKey,
  pairLooseFiles,
  appNumsFromName,
  contractKey,
  contractKeysFrom,
  filenameAppIds,
  mergeComparedResults,
  gridFromForm,
  argvDirs,
  listFilesRecursive,
  parseIssuedSections,
  parseCcPeople,
  harvestCcFromResults,
  harvestLanguageFromResults,
  harvestLibrariesFromResults,
  parseIssuedSource,
  actionIntent,
  readGrid,
  parseFormPdf,
  inspectPdf,
  loadListsForDir,
  loadProgramSnapshot,
  looksLikeContractorForm,
};
