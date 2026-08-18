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

function listDirs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(n => !n.startsWith('.'))
    .map(n => path.join(dir, n))
    .filter(p => fs.statSync(p).isDirectory())
    .sort();
}

function runPython(code, args) {
  const r = spawnSync('python3', ['-c', code, ...args], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || 'python failed').trim();
    throw new Error(err.slice(0, 800));
  }
  return r.stdout;
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
  return /Specification\s*#/i.test(t) && /Item Description/i.test(t) && /Manufacturer/i.test(t);
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

function discoverCases() {
  const cases = [];
  const takeFolder = (dir, slug) => {
    const xls = listFiles(dir, ['.xls', '.xlsx']);
    const pdfs = listFiles(dir, ['.pdf']);
    if (!xls.length && !pdfs.length) return;
    cases.push({ slug, dir, xls, pdfs });
  };

  listDirs(CASES).forEach(dir => takeFolder(dir, path.basename(dir)));
  listDirs(DROP).forEach(dir => takeFolder(dir, 'drop/' + path.basename(dir)));

  const looseXls = listFiles(DROP, ['.xls', '.xlsx']);
  const loosePdf = listFiles(DROP, ['.pdf']);
  if (looseXls.length || loosePdf.length) {
    cases.push({ slug: 'drop-unfiled', dir: DROP, xls: looseXls, pdfs: loosePdf, unfiled: true });
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
    pdfFiles: c.pdfs.map(p => path.basename(p)),
    unfiled: !!c.unfiled,
    engine: null,
    letters: [],
    notes: [],
  };

  if (c.xls.length > 1) out.notes.push('Multiple spreadsheets in this folder — using the first. Split jobs into separate folders if they are different submissions.');
  if (c.unfiled) out.notes.push('Loose files in drop/ — put each job in its own folder named after the project.');

  if (c.xls.length) {
    try {
      const grid = readGrid(c.xls[0]);
      const result = Engine.processGrid(grid, { filename: path.basename(c.xls[0]) });
      out.engine = engineSummary(result);
    } catch (e) {
      out.notes.push('Could not parse spreadsheet: ' + e.message);
    }
  } else {
    out.notes.push('PDF only — add the contractor .xls / .xlsx to this folder.');
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
    lines.push('No files yet. Put each job in sos/corpus/cases/<job-name>/ with contractor.xls + issued.pdf');
    lines.push('See sos/corpus/README.md');
    return lines.join('\n');
  }
  for (const r of results) {
    lines.push('═'.repeat(72));
    lines.push(r.slug);
    lines.push('xls: ' + (r.xlsFiles.join(', ') || '(none)'));
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

function main() {
  fs.mkdirSync(CASES, { recursive: true });
  fs.mkdirSync(DROP, { recursive: true });
  const results = discoverCases().map(compareCase);
  const text = renderText(results);
  fs.writeFileSync(path.join(ROOT, 'report.md'), text);
  fs.writeFileSync(path.join(ROOT, 'report.json'), JSON.stringify(results, null, 2));
  if (WANT_JSON) console.log(JSON.stringify(results, null, 2));
  else console.log(text);
  console.log('\nWrote sos/corpus/report.md');
}

main();
