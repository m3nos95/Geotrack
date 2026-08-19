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
  const Fetch = require('./fetch-lists.js');
  return Fetch.readSpreadsheetGrid(xlsPath);
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

function attachDiff(out) {
  const issued = (out.letters || [])
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
  } else {
    delete out.diff;
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
      if (out.engine && /PDF only|add the contractor/i.test(n)) return;
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
  return [...String(s || '').matchAll(/#?\d{6}|#\d+xxx/gi)].map(m => m[0].replace(/^#/, '#').toUpperCase());
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

  attachDiff(out);
  return out;
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

function renderText(results, harvest) {
  const lines = [];
  lines.push('SOS corpus learn');
  lines.push('Cases: ' + results.length);
  lines.push('');
  lines.push(...renderCcHarvest(harvest));
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
    if (r.diff) {
      lines.push('diff vs ' + r.diff.against + ': engine ' + r.diff.engineItems + ' items / pdf ' + r.diff.pdfSections + ' sections');
      if (r.diff.specsInPdfNotEngine.length) lines.push('  in PDF, not engine: ' + r.diff.specsInPdfNotEngine.join(', '));
      if (r.diff.specsInEngineNotPdf.length) lines.push('  in engine, not PDF: ' + r.diff.specsInEngineNotPdf.join(', '));
    }
    lines.push('');
  }
  return lines.join('\n');
}

function renderSummary(results, harvest) {
  const lines = ['SOS learn  ' + results.length + ' jobs', ''];
  lines.push(...renderCcHarvest(harvest));
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
  const lists = loadListsForDir(extra[0] || '');
  if (lists.tack && lists.tack.entries && lists.tack.entries.length) {
    console.error('APL snapshot: ' + require('./sos-lists.js').summary(lists));
  }
  const results = mergeComparedResults(discoverCases().map(c => compareCase(c, lists)));
  const harvest = harvestCcFromResults(results);
  const text = renderText(results, harvest);
  fs.writeFileSync(path.join(ROOT, 'report.md'), text);
  fs.writeFileSync(path.join(ROOT, 'report.json'), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(ROOT, 'cc-harvest.json'), JSON.stringify(harvest, null, 2));
  extra.forEach(dir => {
    try { fs.writeFileSync(path.join(dir, 'SOS-learn-report.md'), text); }
    catch (e) { console.error('Could not write report into ' + dir + ': ' + e.message); }
    try { fs.writeFileSync(path.join(dir, 'SOS-cc.json'), JSON.stringify(harvest, null, 2)); }
    catch (e) { console.error('Could not write SOS-cc.json into ' + dir + ': ' + e.message); }
  });
  if (WANT_JSON) console.log(JSON.stringify({ results, harvest }, null, 2));
  else {
    console.log(VERBOSE ? text : renderSummary(results, harvest));
    console.log('\nFull report: sos/corpus/report.md');
    extra.forEach(dir => {
      console.log('Copy: ' + path.join(dir, 'SOS-learn-report.md'));
      console.log('CC list: ' + path.join(dir, 'SOS-cc.json') + '  (drop this on the CC tab)');
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
  readGrid,
  parseFormPdf,
  inspectPdf,
  loadListsForDir,
  looksLikeContractorForm,
};
