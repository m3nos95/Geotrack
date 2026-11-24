/*
 * Google Drive folder access for published GeoTrak.
 *
 * The Pages site holds no secret. The OAuth client id and shared folder URL
 * are one office record. A login receives them only with a GeoTrak grant.
 * There is no client secret. Drive API v3 is read-only.
 * File bytes are fetched only when downloadText or getFile is called.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GeoDrive = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
  var FOLDER_MIME = 'application/vnd.google-apps.folder';
  var API = 'https://www.googleapis.com/drive/v3';
  var CLIENT_ID_KEY = 'geotrak_drive_client_id';
  var FOLDER_ID_KEY = 'geotrak_drive_folder_id';
  var FOLDER_NAME_KEY = 'geotrak_drive_folder_name';
  var SOURCE_KEY = 'geotrak_project_source';

  function parseFolderId(input) {
    var s = String(input || '').trim();
    if (!s) return '';
    var folders = s.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (folders) return folders[1];
    var q = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (q) return q[1];
    if (/^[a-zA-Z0-9_-]{10,}$/.test(s) && s.indexOf('http') !== 0 && s.indexOf('/') === -1) return s;
    return '';
  }

  function escapeQuery(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  function childrenQuery(folderId) {
    return "'" + escapeQuery(folderId) + "' in parents and trashed=false";
  }

  function sharedFoldersQuery() {
    return "sharedWithMe=true and mimeType='" + FOLDER_MIME + "' and trashed=false";
  }

  function rootFoldersQuery() {
    return "'root' in parents and mimeType='" + FOLDER_MIME + "' and trashed=false";
  }

  function isFolder(file) {
    return !!(file && file.mimeType === FOLDER_MIME);
  }

  function isGoogleApp(file) {
    var mime = (file && file.mimeType) || '';
    return mime.indexOf('application/vnd.google-apps.') === 0 && mime !== FOLDER_MIME;
  }

  function isFeatureStoreName(name) {
    return /^feature-store\.(json|csv)$/i.test(name || '');
  }

  function isRefDataFile(file) {
    if (!file || isFolder(file) || isGoogleApp(file)) return false;
    if (/^db\.json$/i.test(file.name || '')) return false;
    if (isFeatureStoreName(file.name)) return true;
    return /\.(geo)?json$/i.test(file.name || '');
  }

  function fileMeta(file) {
    if (!file) return null;
    var size = file.size == null || file.size === '' ? null : Number(file.size);
    return {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType || '',
      size: size != null && isFinite(size) ? size : null
    };
  }

  function refFilesFrom(children) {
    var out = [];
    var list = children || [];
    for (var i = 0; i < list.length; i++) {
      if (isRefDataFile(list[i])) out.push(fileMeta(list[i]));
    }
    return out;
  }

  function planDriveOpen(rootChildren) {
    var children = rootChildren || [];
    var refsFolder = null;
    var dbFile = null;
    var loose = [];
    var extras = [];
    for (var i = 0; i < children.length; i++) {
      var file = children[i];
      if (isFolder(file) && /^refs$/i.test(file.name || '') && !refsFolder) refsFolder = fileMeta(file);
      else if (!isFolder(file) && /^db\.json$/i.test(file.name || '') && !dbFile) dbFile = fileMeta(file);
      else if (!isFolder(file) && isFeatureStoreName(file.name)) extras.push(fileMeta(file));
      else if (!isFolder(file) && isRefDataFile(file)) loose.push(fileMeta(file));
    }
    return {
      refsFolder: refsFolder,
      dbFile: dbFile,
      refFiles: refsFolder ? [] : loose.concat(extras),
      rootExtras: extras
    };
  }

  /* Names and ids only. downloadIds is the file read when the folder opens (db.json). */
  function catalogFor(rootChildren, refsChildren) {
    var plan = planDriveOpen(rootChildren);
    var refFiles = plan.refsFolder ? refFilesFrom(refsChildren).concat(plan.rootExtras) : plan.refFiles;
    var downloadIds = [];
    if (plan.dbFile) downloadIds.push(plan.dbFile.id);
    return {
      dbFile: plan.dbFile,
      refsFolder: plan.refsFolder,
      refFiles: refFiles,
      downloadIds: downloadIds
    };
  }

  function formatBytes(n) {
    var v = Number(n);
    if (!isFinite(v) || v < 0) return '';
    if (v < 1024) return Math.round(v) + ' B';
    if (v < 1048576) return (v / 1024).toFixed(v < 10240 ? 1 : 0) + ' KB';
    if (v < 1073741824) return (v / 1048576).toFixed(v < 10485760 ? 1 : 0) + ' MB';
    return (v / 1073741824).toFixed(2) + ' GB';
  }

  function listUrl(query, pageToken) {
    var url = API + '/files?q=' + encodeURIComponent(query) +
      '&fields=nextPageToken,files(id,name,mimeType,size)' +
      '&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true&spaces=drive';
    if (pageToken) url += '&pageToken=' + encodeURIComponent(pageToken);
    return url;
  }

  function createClient(opts) {
    opts = opts || {};
    var fetchImpl = opts.fetch;
    var getToken = opts.getToken;
    var refreshToken = opts.refreshToken;
    var textCache = {};
    var listCache = {};
    if (typeof fetchImpl !== 'function') throw new Error('Drive client needs fetch');
    if (typeof getToken !== 'function') throw new Error('Drive client needs getToken');

    async function errorMessage(res) {
      var text = '';
      try { text = await res.text(); } catch (e) { text = ''; }
      try {
        var body = JSON.parse(text);
        if (body && body.error && body.error.message) return body.error.message;
      } catch (e2) { /* plain text */ }
      return text || ('Google Drive HTTP ' + res.status);
    }

    async function authFetch(url, attempt) {
      var token = await getToken();
      var res = await fetchImpl(url, { headers: { Authorization: 'Bearer ' + token } });
      if (res.status === 401 && !attempt && typeof refreshToken === 'function') {
        await refreshToken();
        return authFetch(url, 1);
      }
      return res;
    }

    async function listQuery(query, listOpts) {
      var files = [];
      var pageToken = '';
      do {
        var res = await authFetch(listUrl(query, pageToken));
        if (!res.ok) throw new Error(await errorMessage(res));
        var body = await res.json();
        var batch = (body && body.files) || [];
        for (var i = 0; i < batch.length; i++) files.push(fileMeta(batch[i]));
        pageToken = (body && body.nextPageToken) || '';
      } while (pageToken);
      files.sort(function (a, b) {
        var af = isFolder(a) ? 0 : 1;
        var bf = isFolder(b) ? 0 : 1;
        if (af !== bf) return af - bf;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
      return files;
    }

    async function listChildren(folderId, listOpts) {
      var fresh = !!(listOpts && listOpts.fresh);
      if (!fresh && listCache[folderId]) return listCache[folderId].slice();
      var files = await listQuery(childrenQuery(folderId));
      listCache[folderId] = files;
      return files.slice();
    }

    async function findChild(folderId, name) {
      var files = await listChildren(folderId);
      var want = String(name || '').toLowerCase();
      for (var i = 0; i < files.length; i++) {
        if (String(files[i].name || '').toLowerCase() === want) return files[i];
      }
      return null;
    }

    async function getFile(id) {
      var url = API + '/files/' + encodeURIComponent(id) + '?fields=id,name,mimeType,size&supportsAllDrives=true';
      var res = await authFetch(url);
      if (!res.ok) throw new Error(await errorMessage(res));
      return fileMeta(await res.json());
    }

    async function downloadText(id) {
      if (Object.prototype.hasOwnProperty.call(textCache, id)) return textCache[id];
      var url = API + '/files/' + encodeURIComponent(id) + '?alt=media&supportsAllDrives=true';
      var res = await authFetch(url);
      if (!res.ok) throw new Error(await errorMessage(res));
      var text = await res.text();
      textCache[id] = text;
      return text;
    }

    return {
      listQuery: listQuery,
      listChildren: listChildren,
      findChild: findChild,
      getFile: getFile,
      downloadText: downloadText
    };
  }

  function fileHandle(client, file) {
    var meta = fileMeta(file);
    return {
      kind: 'file',
      name: meta.name,
      driveFileId: meta.id,
      getFile: async function () {
        var text = await client.downloadText(meta.id);
        var size = meta.size == null ? text.length : meta.size;
        return {
          name: meta.name,
          size: size,
          lastModified: Date.now(),
          text: function () { return Promise.resolve(text); },
          arrayBuffer: function () { return Promise.resolve(new TextEncoder().encode(text).buffer); }
        };
      },
      createWritable: function () {
        return Promise.reject(new Error('Google Drive is read-only'));
      }
    };
  }

  function directoryHandle(client, folder) {
    var meta = fileMeta(folder);
    var handle = {
      source: 'drive',
      readOnly: true,
      kind: 'directory',
      name: meta.name,
      id: meta.id,
      queryPermission: function () { return Promise.resolve('granted'); },
      requestPermission: function () { return Promise.resolve('granted'); },
      getFileHandle: async function (name, openOpts) {
        var child = await client.findChild(meta.id, name);
        if (!child || isFolder(child)) {
          throw new Error((openOpts && openOpts.create) ? 'Google Drive is read-only' : ('Not found: ' + name));
        }
        return fileHandle(client, child);
      },
      getDirectoryHandle: async function (name, openOpts) {
        var child = await client.findChild(meta.id, name);
        if (!child || !isFolder(child)) {
          throw new Error((openOpts && openOpts.create) ? 'Google Drive is read-only' : ('Not found: ' + name));
        }
        return directoryHandle(client, child);
      },
      entries: function () {
        var list = null;
        var i = 0;
        var iter = {
          next: async function () {
            if (!list) list = await client.listChildren(meta.id);
            if (i >= list.length) return { done: true, value: undefined };
            var child = list[i++];
            var childHandle = isFolder(child) ? directoryHandle(client, child) : fileHandle(client, child);
            return { done: false, value: [child.name, childHandle] };
          }
        };
        iter[Symbol.asyncIterator] = function () { return iter; };
        return iter;
      }
    };
    return handle;
  }

  var OFFICE_LOCAL_KEYS = [CLIENT_ID_KEY, FOLDER_ID_KEY, FOLDER_NAME_KEY];

  function officeGrant(accessRole, isLabAdmin) {
    var role = String(accessRole || '');
    if (role === 'none') return '';
    if (role === 'admin' || role === 'user') return role;
    if (isLabAdmin) return 'admin';
    return '';
  }

  function canReadOffice(grant) {
    return grant === 'user' || grant === 'admin';
  }

  function canWriteOffice(grant) {
    return grant === 'admin';
  }

  function officeRecord(input) {
    var src = input || {};
    var clientId = String(src.clientId != null ? src.clientId : (src.client_id || '')).trim();
    var explicitUrl = String(src.folderUrl != null ? src.folderUrl : (src.folder_url || '')).trim();
    var folderId = parseFolderId(explicitUrl) || parseFolderId(src.folderId || src.folder_id || '');
    var folderUrl = explicitUrl || (folderId ? ('https://drive.google.com/drive/folders/' + folderId) : '');
    var folderName = String(src.folderName != null ? src.folderName : (src.folder_name || '')).trim();
    return {
      clientId: clientId,
      folderUrl: folderUrl,
      folderId: folderId,
      folderName: folderName || folderId
    };
  }

  function clearOfficeLocal(storage) {
    if (!storage) return;
    OFFICE_LOCAL_KEYS.forEach(function (key) {
      try { storage.removeItem(key); } catch (e) {}
    });
  }

  function displayFolderName(name, folderId) {
    var bare = String(name || '').trim()
      .replace(/^Drive:\s*/i, '')
      .replace(/\s*\(needs reconnect\)$/i, '')
      .replace(/\/+$/, '')
      .trim();
    if (!bare) return '';
    if (folderId && bare === String(folderId).trim()) return '';
    if (/^[A-Za-z0-9_-]{20,}$/.test(bare) && /[0-9]/.test(bare) && /[a-z]/.test(bare) && /[A-Z]/.test(bare)) return '';
    return bare;
  }

  return {
    DRIVE_SCOPE: DRIVE_SCOPE,
    FOLDER_MIME: FOLDER_MIME,
    CLIENT_ID_KEY: CLIENT_ID_KEY,
    FOLDER_ID_KEY: FOLDER_ID_KEY,
    FOLDER_NAME_KEY: FOLDER_NAME_KEY,
    SOURCE_KEY: SOURCE_KEY,
    parseFolderId: parseFolderId,
    escapeQuery: escapeQuery,
    childrenQuery: childrenQuery,
    sharedFoldersQuery: sharedFoldersQuery,
    rootFoldersQuery: rootFoldersQuery,
    isFolder: isFolder,
    isGoogleApp: isGoogleApp,
    isRefDataFile: isRefDataFile,
    fileMeta: fileMeta,
    refFilesFrom: refFilesFrom,
    planDriveOpen: planDriveOpen,
    catalogFor: catalogFor,
    formatBytes: formatBytes,
    createClient: createClient,
    directoryHandle: directoryHandle,
    OFFICE_LOCAL_KEYS: OFFICE_LOCAL_KEYS,
    officeGrant: officeGrant,
    canReadOffice: canReadOffice,
    canWriteOffice: canWriteOffice,
    officeRecord: officeRecord,
    clearOfficeLocal: clearOfficeLocal,
    displayFolderName: displayFolderName
  };
});
