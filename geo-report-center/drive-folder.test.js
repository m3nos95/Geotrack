'use strict';
const assert = require('assert');
const Drive = require('./drive-folder.js');

const tests = [];
function check(name, fn) { tests.push({ name, fn }); }

function jsonRes(obj, status) {
  const code = status || 200;
  return {
    ok: code < 400,
    status: code,
    json: async () => obj,
    text: async () => (typeof obj === 'string' ? obj : JSON.stringify(obj))
  };
}

const FOLDER = Drive.FOLDER_MIME;

check('parseFolderId reads a Drive folder link, an open link, and a raw id', () => {
  assert.strictEqual(Drive.parseFolderId('https://drive.google.com/drive/folders/abcDEF_123-xyz'), 'abcDEF_123-xyz');
  assert.strictEqual(Drive.parseFolderId('https://drive.google.com/drive/u/0/folders/abcDEF_123-xyz?usp=sharing'), 'abcDEF_123-xyz');
  assert.strictEqual(Drive.parseFolderId('https://drive.google.com/open?id=abcDEF_123-xyz'), 'abcDEF_123-xyz');
  assert.strictEqual(Drive.parseFolderId('abcDEF_123-xyz'), 'abcDEF_123-xyz');
  assert.strictEqual(Drive.parseFolderId('not a folder'), '');
  assert.strictEqual(Drive.parseFolderId(''), '');
});

check('scope is Drive readonly', () => {
  assert.strictEqual(Drive.DRIVE_SCOPE, 'https://www.googleapis.com/auth/drive.readonly');
});

check('opening a project folder plans db.json only, not the ref pack', () => {
  const root = [
    { id: 'db1', name: 'db.json', mimeType: 'application/json', size: '1200' },
    { id: 'refs', name: 'refs', mimeType: FOLDER },
    { id: 'fs', name: 'feature-store.json', mimeType: 'application/json', size: '80' },
    { id: 'zip', name: 'GEO.zip', mimeType: 'application/zip', size: String(4 * 1024 * 1024 * 1024) }
  ];
  const refs = [
    { id: 'soils', name: 'soils.geojson', mimeType: 'application/geo+json', size: String(2 * 1024 * 1024 * 1024) },
    { id: 'wells', name: 'dgir_wells.json', mimeType: 'application/json', size: '4000' },
    { id: 'doc', name: 'notes', mimeType: 'application/vnd.google-apps.document' }
  ];
  const plan = Drive.catalogFor(root, refs);
  assert.deepStrictEqual(plan.downloadIds, ['db1']);
  assert.strictEqual(plan.refsFolder.id, 'refs');
  const ids = plan.refFiles.map(f => f.id).sort();
  assert.deepStrictEqual(ids, ['fs', 'soils', 'wells']);
  assert.ok(!ids.includes('zip'));
  assert.ok(!ids.includes('doc'));
});

check('a shared refs folder is the catalog and still does not download those files', () => {
  const root = [
    { id: 'soils', name: 'soils.geojson', mimeType: 'application/geo+json', size: '9' },
    { id: 'db1', name: 'db.json', mimeType: 'application/json', size: '3' }
  ];
  const plan = Drive.catalogFor(root, []);
  assert.strictEqual(plan.refsFolder, null);
  assert.deepStrictEqual(plan.downloadIds, ['db1']);
  assert.deepStrictEqual(plan.refFiles.map(f => f.name), ['soils.geojson']);
});

check('list does not download, and a file is fetched once', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.indexOf('alt=media') !== -1) return jsonRes('{"type":"FeatureCollection","features":[]}');
    if (url.indexOf('pageToken') !== -1) return jsonRes({ files: [] });
    return jsonRes({
      files: [
        { id: 'soils', name: 'soils.geojson', mimeType: 'application/geo+json', size: '44' },
        { id: 'sub', name: 'nested', mimeType: FOLDER }
      ],
      nextPageToken: 'next'
    });
  };
  const client = Drive.createClient({
    fetch: fetchImpl,
    getToken: async () => 'token-1'
  });
  const kids = await client.listChildren('folder');
  assert.strictEqual(kids.length, 2);
  assert.ok(calls.every(url => url.indexOf('alt=media') === -1));
  assert.ok(calls.some(url => url.indexOf('pageToken=next') !== -1));
  const before = calls.length;
  const handle = Drive.directoryHandle(client, { id: 'folder', name: 'Project', mimeType: FOLDER });
  const names = [];
  for await (const pair of handle.entries()) names.push(pair[0]);
  assert.deepStrictEqual(names, ['nested', 'soils.geojson']);
  assert.strictEqual(calls.length, before);
  const fh = await handle.getFileHandle('soils.geojson');
  const file = await fh.getFile();
  assert.strictEqual(await file.text(), '{"type":"FeatureCollection","features":[]}');
  assert.strictEqual(file.size, 44);
  await client.downloadText('soils');
  const downloads = calls.filter(url => url.indexOf('alt=media') !== -1);
  assert.strictEqual(downloads.length, 1);
  await assert.rejects(() => fh.createWritable(), /read-only/);
  await assert.rejects(() => handle.getFileHandle('missing.json', { create: true }), /read-only/);
});

check('a 401 refreshes the token once and retries', async () => {
  let token = 'stale';
  let downloads = 0;
  const client = Drive.createClient({
    fetch: async (url, init) => {
      const auth = init.headers.Authorization;
      if (url.indexOf('alt=media') !== -1) {
        downloads += 1;
        if (auth.indexOf('stale') !== -1) return jsonRes({ error: { message: 'Invalid Credentials' } }, 401);
        return jsonRes('ok-body');
      }
      return jsonRes({ files: [] });
    },
    getToken: async () => token,
    refreshToken: async () => { token = 'fresh'; }
  });
  assert.strictEqual(await client.downloadText('db1'), 'ok-body');
  assert.strictEqual(downloads, 2);
  assert.strictEqual(await client.downloadText('db1'), 'ok-body');
  assert.strictEqual(downloads, 2);
});

(async () => {
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log('ok  ' + t.name);
    } catch (e) {
      failed += 1;
      console.error('FAIL ' + t.name);
      console.error(e);
    }
  }
  if (failed) {
    console.error(failed + ' failed');
    process.exit(1);
  }
  console.log(tests.length + ' passed');
})();
