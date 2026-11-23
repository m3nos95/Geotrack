/*
 * Remember which GeoTrak reference layers are checked in this browser.
 *
 * The saved set is layer keys (file base names). A missing value means the
 * user has not chosen yet. An empty list means they turned every layer off.
 * Drive reload loads only the saved keys. Layers left off are not downloaded.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GeoLayers = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var STORAGE_KEY = 'geotrak_checked_layers';

  function layerKey(name) {
    return String(name || '')
      .replace(/[_-]?\d+\.(geo)?json$/i, '')
      .replace(/\.(geo)?json$/i, '')
      .trim();
  }

  function parseStored(raw) {
    if (raw == null || raw === '') return null;
    var arr;
    try { arr = JSON.parse(raw); } catch (e) { return null; }
    if (!Array.isArray(arr)) return null;
    var seen = {};
    var out = [];
    arr.forEach(function (item) {
      var key = layerKey(item);
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push(key);
    });
    out.sort();
    return out;
  }

  function serialize(keys) {
    return JSON.stringify(parseStored(JSON.stringify(keys || [])) || []);
  }

  function read(storage) {
    try { return parseStored(storage.getItem(STORAGE_KEY)); }
    catch (e) { return null; }
  }

  function write(storage, keys) {
    storage.setItem(STORAGE_KEY, serialize(keys));
  }

  function hasKey(stored, name) {
    if (!stored) return false;
    var key = layerKey(name);
    return stored.indexOf(key) !== -1 || stored.indexOf(String(name || '')) !== -1;
  }

  function filesToLoad(catalog, stored) {
    if (!stored || !stored.length) return [];
    var out = [];
    (catalog || []).forEach(function (file) {
      if (!file || !file.id || !file.name) return;
      if (!hasKey(stored, file.name)) return;
      out.push({ id: file.id, name: file.name });
    });
    return out;
  }

  function applyToLayers(layers, stored) {
    if (stored == null) return { applied: false };
    (layers || []).forEach(function (layer) {
      if (!layer) return;
      layer.on = hasKey(stored, layer.base || layer.name);
    });
    return { applied: true };
  }

  function keysForOnLayers(layers, extraNames) {
    var seen = {};
    var out = [];
    function add(name) {
      var key = layerKey(name);
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push(key);
    }
    (layers || []).forEach(function (layer) {
      if (!layer || layer.on === false) return;
      add(layer.base || layer.name);
    });
    (extraNames || []).forEach(add);
    out.sort();
    return out;
  }

  function nextSet(stored, layersOn, toggledName, on) {
    var seen = {};
    var base = stored == null ? (layersOn || []) : stored;
    base.forEach(function (name) {
      var key = layerKey(name);
      if (key) seen[key] = true;
    });
    var key = layerKey(toggledName);
    if (key) {
      if (on) seen[key] = true;
      else delete seen[key];
    }
    return Object.keys(seen).sort();
  }

  function catalogChecked(stored, name, loaded) {
    if (stored) return hasKey(stored, name);
    return !!loaded;
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    layerKey: layerKey,
    parseStored: parseStored,
    serialize: serialize,
    read: read,
    write: write,
    hasKey: hasKey,
    filesToLoad: filesToLoad,
    applyToLayers: applyToLayers,
    keysForOnLayers: keysForOnLayers,
    nextSet: nextSet,
    catalogChecked: catalogChecked
  };
});
