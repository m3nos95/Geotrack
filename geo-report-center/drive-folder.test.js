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

check('the office record keeps the client id and folder URL, and has no client secret', () => {
  const row = Drive.officeRecord({
    clientId: '123-abc.apps.googleusercontent.com',
    folderUrl: 'https://drive.google.com/drive/folders/abcDEF_123-xyz?usp=sharing',
    folderName: 'GeoTrak refs',
    clientSecret: 'must-not-stick',
    client_secret: 'also-no'
  });
  assert.strictEqual(row.clientId, '123-abc.apps.googleusercontent.com');
  assert.strictEqual(row.folderId, 'abcDEF_123-xyz');
  assert.strictEqual(row.folderUrl, 'https://drive.google.com/drive/folders/abcDEF_123-xyz?usp=sharing');
  assert.strictEqual(row.folderName, 'GeoTrak refs');
  assert.strictEqual(row.clientSecret, undefined);
  assert.strictEqual(JSON.stringify(row).indexOf('must-not-stick'), -1);
  const fromId = Drive.officeRecord({ folderId: 'abcDEF_123-xyz' });
  assert.strictEqual(fromId.folderUrl, 'https://drive.google.com/drive/folders/abcDEF_123-xyz');
});

check('only a GeoTrak grant can read the office Drive settings, and only an admin can save them', () => {
  assert.strictEqual(Drive.officeGrant('none', true), '');
  assert.strictEqual(Drive.officeGrant('user', true), 'user');
  assert.strictEqual(Drive.officeGrant('admin', false), 'admin');
  assert.strictEqual(Drive.officeGrant('', true), 'admin');
  assert.strictEqual(Drive.officeGrant('', false), '');
  assert.strictEqual(Drive.canReadOffice(''), false);
  assert.strictEqual(Drive.canReadOffice('user'), true);
  assert.strictEqual(Drive.canReadOffice('admin'), true);
  assert.strictEqual(Drive.canWriteOffice('user'), false);
  assert.strictEqual(Drive.canWriteOffice('admin'), true);
  const store = {
    box: { geotrak_drive_client_id: 'leftover', geotrak_drive_folder_id: 'abc', geotrak_drive_folder_name: 'Refs' },
    getItem: function (k) { return this.box[k] || null; },
    removeItem: function (k) { delete this.box[k]; }
  };
  Drive.clearOfficeLocal(store);
  assert.deepStrictEqual(store.box, {});
});

check('a Drive folder id is not a name that can be drawn on the map', () => {
  assert.strictEqual(Drive.displayFolderName('PleHZ50J4WsuqMNW68Tc/', 'PleHZ50J4WsuqMNW68Tc'), '');
  assert.strictEqual(Drive.displayFolderName('Drive: PleHZ50J4WsuqMNW68Tc/', 'PleHZ50J4WsuqMNW68Tc'), '');
  assert.strictEqual(Drive.displayFolderName('PleHZ50J4WsuqMNW68Tc'), '');
  assert.strictEqual(Drive.displayFolderName('Statewide refs/', 'PleHZ50J4WsuqMNW68Tc'), 'Statewide refs');
  assert.strictEqual(Drive.displayFolderName('GeoTrak project/', ''), 'GeoTrak project');
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
