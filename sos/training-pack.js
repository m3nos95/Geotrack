'use strict';
/**
 * Three-file training packs for SOS letters:
 *   submittal.xls/.pdf  — contractor form
 *   program-output.*    — what this tool printed (including typed edits)
 *   issued.pdf          — the letter that was actually sent
 *
 * Packs live in Desktop SOS Program\jobs\<slug>\ (gitignored office folder).
 */
const fs = require('fs');
const path = require('path');

const DEFAULT_PROGRAM_DIR =
  'C:\\Users\\Aaron.Wieczorek\\OneDrive - STATE OF DELAWARE\\Desktop\\SOS Program';

const SKIP_LEARN_DIRS = new Set([
  'inbox-staging',
  'node_modules',
  '.git',
]);

const ALLOWED_PACK_EXT = new Set([
  '.html', '.txt', '.json', '.md', '.xls', '.xlsx', '.pdf',
]);

function programDir(cfg) {
  const c = cfg || {};
  return c.programDir
    || process.env.SOS_PROGRAM_DIR
    || DEFAULT_PROGRAM_DIR;
}

function isSkipLearnDir(name) {
  const n = String(name || '').toLowerCase();
  if (SKIP_LEARN_DIRS.has(n)) return true;
  return false;
}

function isProgramOutputFile(p) {
  const n = path.basename(String(p || '')).toLowerCase();
  if (/^program[-_]?output\./.test(n)) return true;
  if (/^letter\.(pdf|html|txt)$/.test(n)) return true;
  if (n === 'items.json' || n === 'job.json') return true;
  if (n === 'readme.txt') return true;
  return false;
}

function isSubmittalFile(p) {
  const n = path.basename(String(p || '')).toLowerCase();
  return /^submittal\./.test(n);
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** ASCII letters, digits, hyphen, underscore only — safe as a Windows folder or zip name. */
function safeSlug(raw, fallback) {
  const fb = fallback === undefined ? 'job' : fallback;
  const s = String(raw || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’`]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .slice(0, 60)
    .replace(/[-_.]+$/g, '');
  if (!s || WINDOWS_RESERVED.test(s) || /^\.+$/.test(s)) return fb;
  return s;
}

function isoDay(raw) {
  const m = String(raw || '').match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  return new Date().toISOString().slice(0, 10);
}

/** Prefer date + application/contract #. Never include the project title (punctuation). */
function trainingFolderName(meta) {
  const day = isoDay(meta && meta.date);
  const id = safeSlug((meta && (meta.contract || meta.application)) || '', '');
  if (id) return day + '_' + id;
  return day + '_letter';
}

function safePackName(name) {
  const base = path.basename(String(name || '')).replace(/[^\w.\-]+/g, '_');
  const ext = path.extname(base).toLowerCase();
  if (!ALLOWED_PACK_EXT.has(ext)) return '';
  if (base.includes('..')) return '';
  return base;
}

function jobsRoot(dir) {
  return path.join(dir, 'jobs');
}

function trainingReadme(project) {
  const p = project || {};
  const who = [p.contract, p.title, p.contractor].filter(Boolean).join(' · ') || '(fill the header)';
  return [
    'SOS training pack',
    'Job: ' + who,
    '',
    'This folder is how the program keeps learning:',
    '  1. submittal.xls / .xlsx / .pdf  — contractor Source of Supply form',
    '  2. program-output.html / .txt    — the letter this tool produced (your typed edits included)',
    '  3. issued.pdf                    — the SOS letter that was actually sent',
    '',
    'After you send the letter, copy that PDF into this folder and name it issued.pdf',
    '(or issued-rev1.pdf). Do not rename program-output files to look like issued letters.',
    '',
    'Once a week (or after a batch of letters), double-click learn-sos.bat.',
    'Then drop SOS-language.json on APL / Chart, SOS-libraries.json on Source Library,',
    'and SOS-cc.json on CC.',
    '',
    'The Approved Source List and APL still decide approved vs must-be-tested.',
    'Harvested letters teach wording, plants, spec numbers, and CC names.',
    '',
  ].join('\n');
}

function saveTrainingPack(programRoot, slug, files) {
  const root = programRoot || programDir();
  const jobs = jobsRoot(root);
  fs.mkdirSync(jobs, { recursive: true });
  let dest = path.join(jobs, safeSlug(slug, 'job'));
  try {
    fs.mkdirSync(dest, { recursive: true });
  } catch (e) {
    dest = path.join(jobs, 'job-' + Date.now());
    fs.mkdirSync(dest, { recursive: true });
  }
  const written = [];
  (files || []).forEach(f => {
    const name = safePackName(f && f.name);
    if (!name) return;
    const full = path.join(dest, name);
    if (f.buffer) fs.writeFileSync(full, f.buffer);
    else if (f.base64) fs.writeFileSync(full, Buffer.from(String(f.base64), 'base64'));
    else fs.writeFileSync(full, String(f.text == null ? '' : f.text), 'utf8');
    written.push(name);
  });
  return { ok: true, dest, files: written };
}

module.exports = {
  DEFAULT_PROGRAM_DIR,
  programDir,
  isSkipLearnDir,
  isProgramOutputFile,
  isSubmittalFile,
  safeSlug,
  trainingFolderName,
  safePackName,
  jobsRoot,
  trainingReadme,
  saveTrainingPack,
};
