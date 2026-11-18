'use strict';
const assert = require('assert');
const zlib = require('zlib');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Geo = require('./import-geo.js');

const tests = [];
function check(name, fn) { tests.push({ name, fn }); }

const NUL = String.fromCharCode(0);
function gs(total, cum10, wash, cum40, cum200) {
  return `<SieveTest>
  <Sample><SampleWt>${total}</SampleWt>
    <TestPoint><Sieve wtretained="${cum10}"/><OpeningSize readable_size="#10"/></TestPoint>
  </Sample>
  <Sample><SampleWt>${wash}</SampleWt>
    <TestPoint><Sieve wtretained="${cum40}"/><OpeningSize readable_size="#40"/></TestPoint>
    <TestPoint><Sieve wtretained="${cum200}"/><OpeningSize readable_size="#200"/></TestPoint>
  </Sample>
</SieveTest>`;
}
const LIM = `<LIM>
  <NATURAL_WATER_CONTENT wet="28.5" dry="25.0" tare="10.0"/>
  <LIQUID_LIMIT><LLTestPoint><Blows>22</Blows><MOISTURE_DATA wet="30" dry="24" tare="10"/></LLTestPoint></LIQUID_LIMIT>
  <PLASTIC_LIMIT><MOISTURE_DATA wet="26" dry="24" tare="10"/></PLASTIC_LIMIT>
</LIM>`;
const MDT = "00000001,SB-1, 1 (2.0'/18 in.)\n-1\n00000002,SB-1, 2 (4.0'/24 in.)\n";

function boringP() {
  return [
    'BORING', 'SB-1',
    'NORTH', '421790',
    'EAST', '625703.7',
    'SAMP_NUM', '1', '2',
    'DEPTH', '2.0', '4.0',
    'SAMP_REC', '18', '24',
    'BLOWS1', '1', '3',
    'BLOWS2', '2', '4',
    'BLOWS3', '3', '5',
    'BLOWS4', '4', '6',
    'DESCRIPTION', 'FILL', 'BROWN FINE SAND',
    'GDMID', '0', '1'
  ].join(NUL) + NUL;
}

function projectFiles(opts) {
  opts = opts || {};
  const pName = opts.pName || '0001.$P$';
  const files = [
    { name: '9999.$P$', path: 'Bridge.GEO/9999.$P$', text: ['PROJECT', 'Bridge 12', 'STATE_CONTRACT', 'T202600001$extra', 'PROJ_LOC', 'Dover'].join(NUL) },
    { name: pName, path: 'Bridge.GEO/' + pName, text: opts.pText || boringP() },
    { name: '00000001.GS', path: 'Bridge.GEO/00000001.GS', text: gs(100, 10, 90, 5, 20) },
    { name: '00000002.GS', path: 'Bridge.GEO/00000002.GS', text: gs(100, 80, 20, 2, 18) },
    { name: '00000001.LIM', path: 'Bridge.GEO/00000001.LIM', text: LIM }
  ];
  if (!opts.noMdt) files.push({ name: 'GSCOMB.MDT', path: 'Bridge.GEO/GSCOMB.MDT', text: MDT });
  return files;
}

check('sample 1 gets its own sieve, class, and Dover coordinates', function () {
  const bundle = Geo.parseGeoBundle(projectFiles());
  assert.strictEqual(bundle.errors.length, 0);
  assert.strictEqual(bundle.projects.length, 1);
  const p = bundle.projects[0];
  assert.strictEqual(p.name, 'Bridge 12');
  assert.strictEqual(p.contract, 'T202600001');
  assert.strictEqual(p.location, 'Dover');
  const b = p.borings[0];
  assert.ok(Math.abs(b.lat - 39.1581) < 1e-4, 'lat ' + b.lat);
  assert.ok(Math.abs(b.lon + 75.5241) < 1e-4, 'lon ' + b.lon);
  assert.strictEqual(b.s[0].p200, 70);
  assert.strictEqual(b.s[0].p10, 90);
  assert.strictEqual(b.s[1].p200, 2);
  assert.strictEqual(b.s[0].desc, 'FILL');
  assert.strictEqual(b.s[1].desc, 'BROWN FINE SAND');
  assert.strictEqual(b.s[0].nm, 23.3);
  assert.strictEqual(b.s[0].ll, 42.9);
  assert.strictEqual(b.s[0].pi, 28.6);
  assert.strictEqual(b.s[0].n, 5);
  assert.strictEqual(b.s[0].d, 2);
  assert.strictEqual(b.s[1].d, 4);
});

check('a log-only project imports without GSCOMB.MDT', function () {
  const bundle = Geo.parseGeoBundle(projectFiles({ noMdt: true }));
  assert.strictEqual(bundle.errors.length, 0);
  const b = bundle.projects[0].borings[0];
  assert.strictEqual(b.s.length, 2);
  assert.strictEqual(b.s[0].d, 2);
  assert.strictEqual(b.s[0].p200, null);
  assert.ok(bundle.warnings.some(w => /GSCOMB/.test(w)));
});

check('lowercase .$p$ is a boring file', function () {
  const bundle = Geo.parseGeoBundle(projectFiles({ pName: '0001.$p$' }));
  assert.strictEqual(bundle.projects[0].borings[0].b, 'SB-1');
  assert.strictEqual(bundle.projects[0].borings[0].s.length, 2);
});

check('space-separated .$P$ keeps FILL and BROWN FINE SAND', function () {
  const text = [
    'PROJECT   Bridge 12',
    'BORING   SB-1',
    'DESCRIPTION   FILL   BROWN FINE SAND',
    'SAMP_NUM   1   2',
    'DEPTH   2.0   4.0',
    'NORTH   421790',
    'EAST   625703.7'
  ].join('\n');
  const bundle = Geo.parseGeoBundle([
    { name: '0001.$P$', path: 'Job.GEO/0001.$P$', text }
  ]);
  assert.deepStrictEqual(bundle.projects[0].borings[0].s.map(x => x.desc), ['FILL', 'BROWN FINE SAND']);
});

check('a flat depth is kept and moved down the hole', function () {
  const text = ['BORING', 'SB-1', 'SAMP_NUM', '1', '2', 'DEPTH', '2.0', '2.0', 'SAMP_REC', '18', '24', 'DESCRIPTION', 'FILL', 'SAND'].join(NUL);
  const bundle = Geo.parseGeoBundle([{ name: '0001.$P$', path: '0001.$P$', text }]);
  const s = bundle.projects[0].borings[0].s;
  assert.strictEqual(s.length, 2);
  assert.ok(s[1].d > s[0].d);
  assert.ok(bundle.projects[0].borings[0].warnings.length > 0);
});

check('importing the same job replaces its borings', function () {
  const db = { borings: [], cores: [], jobs: {} };
  const bundle = Geo.parseGeoBundle(projectFiles());
  Geo.mergeProjectsIntoDb(db, bundle.projects);
  Geo.mergeProjectsIntoDb(db, bundle.projects);
  assert.strictEqual(db.borings.length, 1);
  assert.strictEqual(db.borings[0].job, 'Bridge 12');
  assert.strictEqual(db.jobs['Bridge 12'].source, 'geosystem');
  assert.strictEqual(db.borings[0].s[0].p200, 70);
});

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function makeZip(entries) {
  const parts = [];
  const centrals = [];
  let offset = 0;
  entries.forEach(ent => {
    const name = Buffer.from(ent.name);
    const data = Buffer.isBuffer(ent.data) ? ent.data : Buffer.from(ent.data);
    const method = ent.method || 0;
    const stored = method === 8 ? zlib.deflateRawSync(data) : data;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(stored.length, 18);
    local.writeUInt32LE(ent.uncomp != null ? ent.uncomp : data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, stored);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(stored.length, 20);
    central.writeUInt32LE(ent.uncomp != null ? ent.uncomp : data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, name]));
    offset += local.length + name.length + stored.length;
  });
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, eocd]);
}

check('a nested Bridge.GEO zip keeps sample 1 on file 1', async function () {
  const zip = makeZip(projectFiles().map(f => ({ name: f.path, data: f.text })));
  assert.strictEqual(Geo.looksLikeZip(zip), true);
  const opened = await Geo.unzipToTexts(zip);
  assert.strictEqual(opened.tooBig, false, opened.message);
  const bundle = Geo.parseGeoBundle(opened.files);
  assert.strictEqual(bundle.projects[0].name, 'Bridge 12');
  assert.strictEqual(bundle.projects[0].borings[0].s[0].p200, 70);
});

check('an inflated zip member is read', async function () {
  const zip = makeZip([{ name: 'Bridge.GEO/0001.$P$', data: boringP(), method: 8 }]);
  const opened = await Geo.unzipToTexts(zip);
  const bundle = Geo.parseGeoBundle(opened.files);
  assert.strictEqual(bundle.projects[0].borings[0].s[0].desc, 'FILL');
});

check('a zip that declares a huge member is refused before inflate', async function () {
  const zip = makeZip([{ name: 'Bridge.GEO/0001.$P$', data: 'BORING' + NUL + 'SB-1', uncomp: 200 * 1024 * 1024 }]);
  const opened = await Geo.unzipToTexts(zip);
  assert.strictEqual(opened.tooBig, true);
  assert.ok(/import-geo-zips\.bat/.test(opened.message));
  assert.strictEqual(opened.files.length, 0);
});

check('a Python zip of the same project imports', async function () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'geo-zip-'));
  const zipPath = path.join(dir, 'bridge.zip');
  const script = [
    'import zipfile,sys',
    'z=zipfile.ZipFile(sys.argv[1],"w")',
    ...projectFiles().map(f => 'z.writestr(' + JSON.stringify(f.path) + ',' + JSON.stringify(f.text) + ')'),
    'z.close()'
  ].join('\n');
  const real = spawnSync('python3', ['-c', script, zipPath], { encoding: 'utf8' });
  assert.strictEqual(real.status, 0, real.stderr);
  const opened = await Geo.unzipToTexts(fs.readFileSync(zipPath));
  const bundle = Geo.parseGeoBundle(opened.files);
  assert.strictEqual(bundle.projects[0].borings[0].s[0].p200, 70);
  fs.rmSync(dir, { recursive: true, force: true });
});

(async function () {
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log('ok  ' + t.name);
    } catch (err) {
      failed++;
      console.error('FAIL ' + t.name);
      console.error(err && err.stack ? err.stack : err);
    }
  }
  if (failed) process.exit(1);
})();
