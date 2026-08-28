'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const Pack = require('./training-pack.js');
const Learn = require('./corpus-learn.js');
const Fetch = require('./fetch-lists.js');

assert.ok(Pack.isProgramOutputFile('program-output.txt'));
assert.ok(Pack.isProgramOutputFile('/x/program-output.html'));
assert.ok(Pack.isProgramOutputFile('letter.pdf'));
assert.ok(Pack.isProgramOutputFile('items.json'));
assert.ok(!Pack.isProgramOutputFile('issued.pdf'));
assert.ok(!Pack.isProgramOutputFile('Source of Supply 623641525.pdf'));
assert.ok(Pack.isSubmittalFile('submittal.xls'));
assert.ok(Pack.isSkipLearnDir('inbox-staging'));
assert.ok(!Pack.isSkipLearnDir('jobs'));
assert.strictEqual(Pack.safePackName('secret.exe'), '');
assert.strictEqual(Pack.safePackName('foo/bar.txt'), 'bar.txt');
assert.strictEqual(Pack.safePackName('program-output.txt'), 'program-output.txt');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sos-pack-'));
const saved = Pack.saveTrainingPack(tmp, '2026-08-28 Hunters Creek', [
  { name: 'README.txt', text: Pack.trainingReadme({ contract: '623641525', title: 'Hunters Creek' }) },
  { name: 'program-output.txt', text: 'SECTION: #401005\nSOURCE: Allan Myers\nACTION: Approved.\n' },
  { name: 'items.json', text: JSON.stringify({ items: [{ specs: ['#401005'] }] }) },
  { name: 'submittal.xls', buffer: Buffer.from('fake-xls') },
]);
assert.ok(saved.ok);
assert.ok(fs.existsSync(path.join(saved.dest, 'program-output.txt')));
assert.ok(fs.existsSync(path.join(saved.dest, 'submittal.xls')));
const snap = Learn.loadProgramSnapshot(saved.dest);
assert.ok(snap);
assert.ok(snap.sections.length >= 1);

const paired = Learn.pairLooseFiles([
  path.join(tmp, 'jobs', 'x', 'submittal.xls'),
  path.join(tmp, 'jobs', 'x', 'issued.pdf'),
  path.join(tmp, 'jobs', 'x', 'program-output.pdf'),
]);
paired.forEach(c => {
  assert.ok(!(c.pdfs || []).some(p => /program-output/i.test(p)), 'program-output PDF is not treated as the issued letter');
});

const skipRoot = path.join(tmp, 'scan');
fs.mkdirSync(path.join(skipRoot, 'inbox-staging'), { recursive: true });
fs.mkdirSync(path.join(skipRoot, 'jobs', 'one'), { recursive: true });
fs.writeFileSync(path.join(skipRoot, 'inbox-staging', 'secret.pdf'), 'x');
fs.writeFileSync(path.join(skipRoot, 'jobs', 'one', 'issued.pdf'), 'x');
fs.writeFileSync(path.join(skipRoot, 'root-letter.pdf'), 'x');
const listed = Learn.listFilesRecursive(skipRoot, ['.pdf']);
assert.ok(listed.some(p => /root-letter/.test(p)));
assert.ok(!listed.some(p => /inbox-staging/.test(p)));
assert.ok(!listed.some(p => /jobs/.test(p)), 'jobs/ is scanned as folders, not mixed into the loose dump');

const prog = { items: [{ specs: ['#401005'], section: '#401005 - SUPERPAVE' }] };
const issued = {
  kind: 'issued-letter',
  file: 'issued.pdf',
  intro: 'Application No. 623641525',
  sections: [{ section: '#401005 - SUPERPAVE TYPE C', source: 'Allan Myers', action: 'Approved.', bullets: [] }],
};
const merged = Learn.mergeComparedResults([{
  slug: 'hunters',
  dir: saved.dest,
  xlsFiles: ['submittal.xls'],
  formFiles: [],
  pdfFiles: ['issued.pdf'],
  engine: { project: { contract: '623641525' }, items: [{ specs: ['#401005'], section: '#401005' }] },
  program: { file: 'program-output.txt', sections: [{ section: '#401005' }] },
  letters: [issued],
  notes: [],
}]);
assert.ok(merged[0].diff);
assert.ok(merged[0].programDiff);
assert.strictEqual(merged[0].programDiff.against, 'issued.pdf');

process.env.SOS_PROGRAM_DIR = tmp;
(async () => {
  const server = http.createServer(Fetch.handleHelperRequest);
  const port = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
  try {
    const payload = JSON.stringify({
      slug: 'helper-job',
      files: [
        { name: 'program-output.txt', text: 'SECTION: #301003\nSOURCE: Vulcan\nACTION: Must be tested.\n' },
        { name: 'README.txt', text: 'pack' },
      ],
    });
    const body = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/api/save-training',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      }, res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
          catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
    assert.ok(body.ok, body.error || 'save-training failed');
    assert.ok(fs.existsSync(path.join(tmp, 'jobs', 'helper-job', 'program-output.txt')));
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
  console.log('OK training-pack three-file jobs + helper POST');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
