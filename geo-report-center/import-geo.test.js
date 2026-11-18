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

function indexedField(name, pairs) {
  let out = name + NUL + NUL + NUL;
  pairs.forEach(function (pair) {
    out += pair[1] + NUL + String.fromCharCode(pair[0]) + NUL + NUL;
  });
  return out;
}

check('indexed boring rows keep each lab file on its sample', function () {
  const boring = [
    'BORING' + NUL + NUL + NUL + 'B-1' + NUL + NUL + NUL,
    'LOCATION' + NUL + NUL + NUL + 'New Castle County, DE' + NUL + NUL + NUL,
    'EAST' + NUL + NUL + NUL + '556766.628' + NUL + NUL + NUL,
    'NORTH' + NUL + NUL + NUL + '584724.564' + NUL + NUL + NUL,
    indexedField('DEPTH', [[1, '0.0'], [2, '2.0'], [3, '4.0']]),
    indexedField('SAMP_NUM', [[1, '1'], [2, '2']]),
    indexedField('SAMP_REC', [[1, '24'], [2, '24']]),
    indexedField('BLOWS1', [[1, '7'], [2, '1']]),
    indexedField('BLOWS2', [[1, '8'], [2, '1']]),
    indexedField('BLOWS3', [[1, '4'], [2, '2']]),
    indexedField('BLOWS4', [[1, '4'], [2, '2']]),
    indexedField('GDMID', [[1, '0'], [2, '1']]),
    indexedField('DESCRIPTION', [
      [1, 'Moist stiff orange coarse to fine sandy silt'],
      [2, 'Moist soft orange sand'],
      [3, 'End Boring']
    ]),
    indexedField('LL', [[1, '21.1'], [2, 'NV']]),
    indexedField('PL', [[1, '16.7'], [2, 'NP']]),
    indexedField('PI', [[1, '4.4'], [2, 'NP']]),
    indexedField('NM', [[1, '9.8'], [2, '12.2']]),
    indexedField('USCS', [[1, 'SC-SM'], [2, 'SM']]),
    indexedField('AASHTO', [[1, 'A-4(0)'], [2, 'A-4(0)']]),
    indexedField('PER200', [[1, '44.8'], [2, '38.2']]),
    indexedField('PER10', [[1, '100.0'], [2, '100.0']]),
    indexedField('PER40', [[1, '70.2'], [2, '59.8']]),
    indexedField('PER4', [[1, '100.0'], [2, '100.0']])
  ].join('');
  const gs = `<?xml version="1.0"?><GEOTECHNICAL_PROJECT><GRAIN_SIZE><SieveTest>
    <Sample><SampleWt>338.63<Tare wt="0"/></SampleWt></Sample>
    <TestPoint><Sieve wtretained="0"><OpeningSize readable_size="#10"/></Sieve></TestPoint>
    <Sample><SampleWt>116.1<Tare wt="0"/></SampleWt></Sample>
    <TestPoint><Sieve wtretained="34.3"><OpeningSize readable_size="#40"/></Sieve></TestPoint>
    <TestPoint><Sieve wtretained="64.1"><OpeningSize readable_size="#200"/></Sieve></TestPoint>
  </SieveTest></GRAIN_SIZE></GEOTECHNICAL_PROJECT>`;
  const lim = `<?xml version="1.0"?><GEOTECHNICAL_PROJECT><CLASSIFICATION>
    <NATURAL_WATER_CONTENT wet="451.51" dry="418.22" tare="79.59">9.8</NATURAL_WATER_CONTENT>
    <LIQUID_LIMIT><LLTestPoint><Blows>25</Blows><MOISTURE_DATA wet="33.32" dry="31.25" tare="21.42"/></LLTestPoint>21.1</LIQUID_LIMIT>
    <PLASTIC_LIMIT><MOISTURE_DATA wet="30.02" dry="28.82" tare="21.65"/>16.7</PLASTIC_LIMIT>
  </CLASSIFICATION></GEOTECHNICAL_PROJECT>`;
  const other = `<?xml version="1.0"?><GEOTECHNICAL_PROJECT><GRAIN_SIZE><SieveTest>
    <Sample><SampleWt>418.36</SampleWt></Sample>
    <TestPoint><Sieve wtretained="0"><OpeningSize readable_size="#10"/></Sieve></TestPoint>
    <Sample><SampleWt>105.4</SampleWt></Sample>
    <TestPoint><Sieve wtretained="42.4"><OpeningSize readable_size="#40"/></Sieve></TestPoint>
    <TestPoint><Sieve wtretained="65.1"><OpeningSize readable_size="#200"/></Sieve></TestPoint>
  </SieveTest></GRAIN_SIZE></GEOTECHNICAL_PROJECT>`;
  const bundle = Geo.parseGeoBundle([
    { name: '0.$P$', path: 'County.GEO/0.$P$', text: boring },
    { name: '00000007.GS', path: 'County.GEO/00000007.GS', text: gs },
    { name: '00000007.LIM', path: 'County.GEO/00000007.LIM', text: lim },
    { name: '00000008.GS', path: 'County.GEO/00000008.GS', text: other }
  ]);
  assert.strictEqual(bundle.errors.length, 0, bundle.errors.join('; '));
  const b = bundle.projects[0].borings[0];
  assert.strictEqual(b.b, 'B-1');
  assert.strictEqual(b.eob, 4);
  assert.strictEqual(b.s.length, 2);
  assert.strictEqual(b.s[0].d, 2);
  assert.strictEqual(b.s[0].depth_from, 0);
  assert.strictEqual(b.s[0].desc, 'Moist stiff orange coarse to fine sandy silt');
  assert.strictEqual(b.s[0].p200, 44.8);
  assert.strictEqual(b.s[0].ll, 21.1);
  assert.strictEqual(b.s[0].pi, 4.4);
  assert.strictEqual(b.s[0].nm, 9.8);
  assert.strictEqual(b.s[0].uscs, 'SC-SM');
  assert.strictEqual(b.s[0].aashto, 'A-4(0)');
  assert.strictEqual(b.s[0].n, 12);
  assert.strictEqual(b.s[0].gs_file, '00000007.GS');
  assert.strictEqual(b.s[0].lim_file, '00000007.LIM');
  assert.strictEqual(b.s[0].sieve_inputs.total_wt, 338.63);
  assert.strictEqual(b.s[1].d, 4);
  assert.strictEqual(b.s[1].depth_from, 2);
  assert.strictEqual(b.s[1].p200, 38.2);
  assert.strictEqual(b.s[1].ll, 'NV');
  assert.strictEqual(b.s[1].gs_file, '00000008.GS');
  assert.strictEqual(b.s[1].lim_file, null);
  assert.ok(b.lat > 39 && b.lat < 40, 'lat ' + b.lat);
  assert.ok(bundle.warnings.length === 0, bundle.warnings.join(' '));
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

check('a boring file supplies the contract and the project name stays', function () {
  const files = [
    { name: '9999.$P$', path: 'North Bethany RRFB.GEO/9999.$P$', text: ['PROJECT', 'North Bethany RRFB', 'PROJ_LOC', 'Sussex County DE'].join(NUL) },
    { name: '0001.$P$', path: 'North Bethany RRFB.GEO/0001.$P$', text: ['BORING', 'SB-01', 'STATE_CONTRACT', 'T201709502', 'LOCATION', 'Sussex County DE', 'SAMP_NUM', '1', 'DEPTH', '2.0', 'DESCRIPTION', 'SAND'].join(NUL) }
  ];
  const p = Geo.parseGeoBundle(files).projects[0];
  assert.strictEqual(p.name, 'North Bethany RRFB');
  assert.strictEqual(p.contract, 'T201709502');
  assert.strictEqual(p.borings[0].contract, 'T201709502');
});

check('a folder contract number does not replace the project name', function () {
  const files = [
    { name: '9999.$P$', path: 'T201709502.GEO/9999.$P$', text: ['PROJECT', 'North Bethany RRFB'].join(NUL) },
    { name: '0001.$P$', path: 'T201709502.GEO/0001.$P$', text: boringP() }
  ];
  const p = Geo.parseGeoBundle(files).projects[0];
  assert.strictEqual(p.contract, 'T201709502');
  assert.strictEqual(p.name, 'North Bethany RRFB');
});

check('JOB_NO on the boring is the contract', function () {
  const files = [
    { name: '0001.$P$', path: 'North Bethany RRFB.GEO/0001.$P$', text: ['BORING', 'SB-01', 'PROJECT', 'North Bethany RRFB', 'JOB_NO', 'T201709502', 'SAMP_NUM', '1', 'DEPTH', '2.0', 'DESCRIPTION', 'SAND'].join(NUL) }
  ];
  const p = Geo.parseGeoBundle(files).projects[0];
  assert.strictEqual(p.contract, 'T201709502');
  assert.strictEqual(p.name, 'North Bethany RRFB');
});

check('a contract beside the folder name stays the identifier', function () {
  const files = [
    { name: '0001.$P$', path: 'T201709502 North Bethany RRFB.GEO/0001.$P$', text: ['BORING', 'SB-01', 'SAMP_NUM', '1', 'DEPTH', '2.0', 'DESCRIPTION', 'SAND'].join(NUL) }
  ];
  const p = Geo.parseGeoBundle(files).projects[0];
  assert.strictEqual(p.contract, 'T201709502');
  assert.strictEqual(p.name, 'North Bethany RRFB');
});

check('a space-separated boring file keeps CONTRACT_NO', function () {
  const text = [
    'PROJECT   North Bethany RRFB',
    'BORING   SB-01',
    'CONTRACT_NO   T201709502',
    'SAMP_NUM   1',
    'DEPTH   2.0',
    'DESCRIPTION   SAND'
  ].join('\n');
  const p = Geo.parseGeoBundle([{ name: '0001.$P$', path: 'North Bethany RRFB.GEO/0001.$P$', text }]).projects[0];
  assert.strictEqual(p.contract, 'T201709502');
  assert.strictEqual(p.name, 'North Bethany RRFB');
});

check('a file path is not stored as the project name', function () {
  const files = [
    { name: '9999.$P$', path: 'T202208302.GEO/9999.$P$', text: ['PROJECT', 'C:\\Users\\aaron\\Pole Bridge Road.dwg', 'STATE_CONTRACT', 'T202208302'].join(NUL) },
    { name: '0001.$P$', path: 'T202208302.GEO/0001.$P$', text: ['BORING', 'B-1', 'SAMP_NUM', '1', 'DEPTH', '2.0', 'DESCRIPTION', 'SAND'].join(NUL) }
  ];
  const p = Geo.parseGeoBundle(files).projects[0];
  assert.strictEqual(p.contract, 'T202208302');
  assert.ok(!/[\\/]/.test(p.name), 'name was a path: ' + p.name);
  assert.notStrictEqual(p.name, 'C:\\Users\\aaron\\Pole Bridge Road.dwg');
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
