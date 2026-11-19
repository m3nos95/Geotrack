/*
 * GeoSystem .GEO reader shared by GeoTrak and BoreLog.
 *
 * A .GEO project is a folder (often zipped): GSCOMB.MDT, LIMCOMB.MDT,
 * 9999.$P$ (project), 0001.$P$ (one boring), and ########.GS / .LIM lab files.
 * Sample numbers in .$P$ and in the MDT index are the same number. GDMID
 * points at a DESCRIPTION line; it is not the lab-file number.
 * A boring .$P$ may store each sample behind a one-byte index, with grain
 * size and Atterberg results on that same index. DEPTH on that index is the
 * top of the sample. The next depth, often an "End Boring" point, is the bottom.
 * When the MDT index is missing, a .GS / .LIM file is attached to the sample
 * whose stored results match that file.
 *
 * Browser builds must not read a statewide pack. import-geo-zips.py streams
 * that archive on disk and writes db.json beside it.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GeoImport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var BROWSER_IMPORT_LIMIT = 80 * 1024 * 1024;
  var INBOX_KEY = 'geotrak_geo_inbox';
  var INBOX_MAX = 2 * 1024 * 1024;
  var NUL = String.fromCharCode(0);
  var USFT = 0.3048006096012192;

  var KNOWN_KEYS = {
    PROJECT: 1, STATE_CONTRACT: 1, PROJ_NUM: 1, PROJ_LOC: 1, FEDERAL_CONTRACT: 1, CONTRACTOR: 1,
    BORING: 1, LOCATION: 1, NORTH: 1, NORTHING: 1, EAST: 1, EASTING: 1,
    STATION: 1, STA: 1, OFFSET: 1, OFF: 1,
    LATITUDE: 1, LAT: 1, LONGITUDE: 1, LONG: 1, LON: 1, LAT_DD: 1, LONG_DD: 1,
    BDATE: 1, CDATE: 1, HAMMER_WT: 1, HAMMER_DROP: 1, DSAMPLER: 1, DSAMP_DIA: 1,
    DRILL_CONTRAC: 1, DRILL_RIG: 1, DRILLER: 1, CHECKED_BY: 1, SUPERVISOR: 1, NOTES: 1,
    DEPTH: 1, SAMP_NUM: 1, SAMPLENUM: 1, SAMPLE_NUM: 1, SAMPLE_NO: 1, SAMP_TYPE: 1, SAMPLE_TYPE: 1,
    SAMP_REC: 1, SAMPLE_REC: 1, RECOVERY: 1,
    BLOWS1: 1, BLOWS2: 1, BLOWS3: 1, BLOWS4: 1,
    GDMID: 1, GDM_ID: 1, AASHTO_CLASS: 1, AASHTO: 1, DESCRIPTION: 1, WDEPTH1: 1,
    ELEV: 1, ELEVATION: 1, COUNTY: 1, ROUTE: 1, JOB: 1, JOB_NO: 1, JOB_NUM: 1, JOBNUMBER: 1, CLIENT: 1,
    CONTRACT: 1, CONTRACT_NO: 1, STATE_CONTRAC: 1, PROJECT_NUM: 1
  };

  function tooBigMessage(name) {
    return '"' + (name || 'That file') + '" is too large to import in the browser. ' +
      'Leave the archive on disk and run import-geo-zips.bat beside it. ' +
      'That writes db.json next to the archive. It does not put the pack in git or in LabTrak.';
  }

  function baseName(path) {
    var s = String(path || '').replace(/\\/g, '/');
    var i = s.lastIndexOf('/');
    return i >= 0 ? s.slice(i + 1) : s;
  }

  function isGeoName(name) {
    var b = baseName(name).toLowerCase();
    if (/\.\$p\$$/.test(b)) return true;
    var dot = b.lastIndexOf('.');
    var ext = dot >= 0 ? b.slice(dot + 1) : '';
    return ext === 'mdt' || ext === 'gs' || ext === 'lim' || ext === 'ndx' || ext === 'pdt' || ext === 'xml';
  }

  function projectKey(path) {
    var parts = String(path || '').replace(/\\/g, '/').split('/').filter(Boolean);
    if (!parts.length) return '.';
    for (var i = 0; i < parts.length; i++) {
      if (/\.geo$/i.test(parts[i])) return parts.slice(0, i + 1).join('/');
    }
    if (parts.length === 1) return '.';
    return parts.slice(0, -1).join('/');
  }

  function folderLabel(key) {
    var parts = String(key || '').split('/').filter(Boolean);
    var last = parts.length ? parts[parts.length - 1] : '';
    return last.replace(/\.geo$/i, '') || 'GeoSystem Import';
  }

  function round1(v) {
    if (v == null || !isFinite(v)) return null;
    return Math.round(v * 10) / 10;
  }

  function round7(v) {
    if (v == null || !isFinite(v)) return null;
    return +Number(v).toFixed(7);
  }

  function num(v) {
    if (v == null) return null;
    var f = parseFloat(String(v).replace(/,/g, ''));
    return isFinite(f) ? f : null;
  }

  function inBox(lat, lon) {
    return lat != null && lon != null && lat >= 36 && lat <= 42 && lon >= -77 && lon <= -73;
  }

  /* NAD83 Delaware Lambert, US survey feet. False easting is 200000 meters. */
  function delawareFtToLatLon(easting, northing) {
    var a = 6378137;
    var f = 1 / 298.257222101;
    var e2 = f * (2 - f);
    var e = Math.sqrt(e2);
    var deg = Math.PI / 180;
    function m(phi) { return Math.cos(phi) / Math.sqrt(1 - e2 * Math.sin(phi) * Math.sin(phi)); }
    function tOf(phi) {
      var s = Math.sin(phi);
      return Math.tan(Math.PI / 4 - phi / 2) / Math.pow((1 - e * s) / (1 + e * s), e / 2);
    }
    var phi1 = (38 + 26 / 60) * deg;
    var phi2 = (39 + 50 / 60) * deg;
    var phi0 = 38 * deg;
    var lam0 = -(75 + 25 / 60) * deg;
    var m1 = m(phi1), m2 = m(phi2);
    var t0 = tOf(phi0), t1 = tOf(phi1), t2 = tOf(phi2);
    var n = Math.log(m1 / m2) / Math.log(t1 / t2);
    var F = m1 / (n * Math.pow(t1, n));
    var rho0 = a * F * Math.pow(t0, n);
    var E = easting * USFT;
    var N = northing * USFT;
    var x = E - 200000;
    var y = rho0 - N;
    var rho = (n < 0 ? -1 : 1) * Math.sqrt(x * x + y * y);
    var theta = Math.atan2(x, y);
    var ti = Math.pow(rho / (a * F), 1 / n);
    var phi = Math.PI / 2 - 2 * Math.atan(ti);
    for (var i = 0; i < 12; i++) {
      var s = Math.sin(phi);
      phi = Math.PI / 2 - 2 * Math.atan(ti * Math.pow((1 - e * s) / (1 + e * s), e / 2));
    }
    return { lat: phi / deg, lon: (theta / n + lam0) / deg };
  }

  function locate(easting, northing) {
    var direct = delawareFtToLatLon(easting, northing);
    if (inBox(direct.lat, direct.lon)) return { lat: round7(direct.lat), lon: round7(direct.lon), e: easting, n: northing, swapped: false };
    var flip = delawareFtToLatLon(northing, easting);
    if (inBox(flip.lat, flip.lon)) return { lat: round7(flip.lat), lon: round7(flip.lon), e: northing, n: easting, swapped: true };
    return { lat: null, lon: null, e: easting, n: northing, swapped: false };
  }

  function splitPArray(str) {
    if (str == null || str === '') return [];
    var parts = String(str).split(/\s{3,}/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (parts.length > 1) return parts;
    return String(str).trim().split(/\s+/).filter(Boolean);
  }

  function isKey(tok) {
    return Object.prototype.hasOwnProperty.call(KNOWN_KEYS, String(tok || '').toUpperCase());
  }

  function parseIndexedPDollar(raw) {
    var KEY_RE = /^[A-Z][A-Z0-9_]{0,40}$/;
    var result = {};
    var indexed = {};
    var i = 0;
    var n = raw.length;
    function keyAt(pos) {
      if (pos >= n || raw.charAt(pos) === NUL) return null;
      var j = pos;
      while (j < n && raw.charAt(j) !== NUL) j++;
      var token = raw.slice(pos, j);
      if (!KEY_RE.test(token)) return null;
      if (j + 2 < n && raw.charAt(j) === NUL && raw.charAt(j + 1) === NUL && raw.charAt(j + 2) === NUL) {
        return { token: token, next: j + 3 };
      }
      return null;
    }
    while (i < n) {
      while (i < n && raw.charAt(i) === NUL) i++;
      if (i >= n) break;
      var key = keyAt(i);
      if (!key) { i++; continue; }
      i = key.next;
      var map = {};
      var scalars = [];
      var sawIndex = false;
      while (i < n) {
        while (i < n && raw.charAt(i) === NUL) i++;
        if (i >= n || keyAt(i)) break;
        var start = i;
        while (i < n && raw.charAt(i) !== NUL) i++;
        var val = raw.slice(start, i);
        if (i < n && raw.charAt(i) === NUL) i++;
        if (i < n && raw.charAt(i) !== NUL && (i + 1 >= n || raw.charAt(i + 1) === NUL)) {
          sawIndex = true;
          map[raw.charCodeAt(i)] = val;
          i++;
          continue;
        }
        scalars.push(val);
        if (!sawIndex) break;
      }
      if (sawIndex) {
        indexed[key.token] = map;
        var max = 0;
        Object.keys(map).forEach(function (k) {
          var kn = parseInt(k, 10);
          if (kn > max) max = kn;
        });
        var arr = [];
        for (var s = 1; s <= max; s++) arr.push(map[s] != null ? map[s] : '');
        result[key.token] = arr.join('   ');
      } else if (scalars.length) {
        result[key.token] = scalars.join('   ');
      }
    }
    if (Object.keys(indexed).length) result.__indexed = indexed;
    return result;
  }

  function parseGeoPDollar(text) {
    var raw = String(text || '').replace(/^\uFEFF/, '');
    var tokens;
    if (raw.indexOf(NUL) >= 0 && /[A-Z][A-Z0-9_]*\x00\x00\x00/.test(raw)) return parseIndexedPDollar(raw);
    if (raw.indexOf(NUL) >= 0) {
      tokens = raw.split(NUL).map(function (t) { return t.trim(); }).filter(Boolean);
    } else {
      tokens = raw.split(/\s{3,}|\r?\n/).map(function (t) { return t.trim(); }).filter(Boolean);
    }
    var result = {};
    var i = 0;
    while (i < tokens.length) {
      if (isKey(tokens[i])) {
        var key = tokens[i].toUpperCase();
        var vals = [];
        i++;
        while (i < tokens.length && !isKey(tokens[i])) {
          vals.push(tokens[i]);
          i++;
        }
        result[key] = vals.join('   ');
      } else {
        i++;
      }
    }
    return result;
  }

  function parseGeoMDT(text) {
    var entries = [];
    var lines = String(text || '').split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || line === '-1') continue;
      var m = line.match(/^(\d+)\s*,\s*(.+?)\s*,\s*(\d+)\s*\(\s*([0-9.]+)\s*['′]?\s*\/\s*([0-9.]+)\s*(?:in\.?)?\s*\)/i);
      if (!m) m = line.match(/^(\d+)\s*,\s*(.+?)\s*,\s*(\d+)\s*\(\s*([0-9.]+)\s*\/\s*([0-9.]+)\s*\)/);
      if (!m) continue;
      entries.push({
        fileIdx: parseInt(m[1], 10),
        boring: m[2].trim(),
        sampleNo: parseInt(m[3], 10),
        depthTo: parseFloat(m[4]),
        recovery: parseFloat(m[5])
      });
    }
    return entries;
  }

  function normBoring(name) {
    return String(name || '').trim().toUpperCase().replace(/\s+/g, '');
  }

  function decodeXml(s) {
    return String(s || '')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  function parseXml(xml) {
    var src = String(xml || '').replace(/<\?xml[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '');
    var i = 0;
    function skip() { while (i < src.length && /\s/.test(src.charAt(i))) i++; }
    function nodes() {
      var out = [];
      while (i < src.length) {
        skip();
        if (i >= src.length || src.charAt(i) !== '<') {
          var start = i;
          while (i < src.length && src.charAt(i) !== '<') i++;
          var text = src.slice(start, i).trim();
          if (text) out.push({ type: 'text', text: decodeXml(text) });
          continue;
        }
        if (src.charAt(i + 1) === '/') break;
        out.push(tag());
      }
      return out;
    }
    function tag() {
      i++;
      var nm = src.slice(i).match(/^([A-Za-z_][\w:.-]*)/);
      if (!nm) return { type: 'el', name: '', attrs: {}, children: [] };
      var name = nm[1];
      i += name.length;
      var attrs = {};
      while (i < src.length) {
        skip();
        if (src.charAt(i) === '>' || src.charAt(i) === '/') break;
        var am = src.slice(i).match(/^([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/);
        if (!am) { i++; continue; }
        attrs[am[1]] = decodeXml(am[2] != null ? am[2] : am[3]);
        i += am[0].length;
      }
      skip();
      if (src.charAt(i) === '/') {
        i += 2;
        return { type: 'el', name: name, attrs: attrs, children: [] };
      }
      if (src.charAt(i) === '>') i++;
      var children = nodes();
      if (src.slice(i, i + 2) === '</') {
        var close = src.slice(i).match(/^<\/\s*[A-Za-z_][\w:.-]*\s*>/);
        if (close) i += close[0].length;
      }
      return { type: 'el', name: name, attrs: attrs, children: children };
    }
    return nodes();
  }

  function findAll(nodes, name) {
    var want = name.toLowerCase();
    var out = [];
    function walk(list) {
      for (var i = 0; i < list.length; i++) {
        var n = list[i];
        if (!n || n.type !== 'el') continue;
        if (String(n.name).toLowerCase() === want) out.push(n);
        if (n.children) walk(n.children);
      }
    }
    walk(nodes || []);
    return out;
  }

  function childText(el, name) {
    var kids = (el && el.children) || [];
    var want = name.toLowerCase();
    for (var i = 0; i < kids.length; i++) {
      if (kids[i].type === 'el' && String(kids[i].name).toLowerCase() === want) {
        return (kids[i].children || []).filter(function (c) { return c.type === 'text'; }).map(function (c) { return c.text; }).join('').trim();
      }
    }
    return '';
  }

  function attr(el, name) {
    if (!el || !el.attrs) return '';
    var want = name.toLowerCase();
    var keys = Object.keys(el.attrs);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].toLowerCase() === want) return el.attrs[keys[i]];
    }
    return '';
  }

function elText(el) {
  return ((el && el.children) || []).filter(function (c) { return c.type === 'text'; }).map(function (c) { return c.text; }).join('').trim();
}

function firstChild(el, name) {
    var kids = (el && el.children) || [];
    var want = name.toLowerCase();
    for (var i = 0; i < kids.length; i++) {
      if (kids[i].type === 'el' && String(kids[i].name).toLowerCase() === want) return kids[i];
    }
    return null;
  }

  function sievePoint(tp) {
    var sieve = firstChild(tp, 'Sieve') || findAll(tp.children || [], 'Sieve')[0];
    var opening = firstChild(tp, 'OpeningSize') || findAll(tp.children || [], 'OpeningSize')[0];
    if (!opening && sieve) opening = firstChild(sieve, 'OpeningSize') || findAll(sieve.children || [], 'OpeningSize')[0];
    var wt = sieve ? attr(sieve, 'wtretained') : '';
    var sz = opening ? attr(opening, 'readable_size') : '';
    if (!sz || wt === '') return null;
    return { sz: sz, wt: num(wt) };
  }

  function sieveBlocks(tree) {
    var tests = findAll(tree, 'SieveTest');
    var blocks = [];
    tests.forEach(function (test) {
      var current = null;
      (test.children || []).forEach(function (k) {
        if (!k || k.type !== 'el') return;
        var nm = String(k.name).toLowerCase();
        if (nm === 'sample') {
          current = { el: k, points: [] };
          findAll(k.children || [], 'TestPoint').forEach(function (tp) { current.points.push(tp); });
          blocks.push(current);
        } else if (nm === 'testpoint' && current) {
          current.points.push(k);
        }
      });
    });
    if (blocks.length) return blocks;
    return findAll(tree, 'Sample').map(function (sample) {
      return { el: sample, points: findAll(sample.children || [], 'TestPoint') };
    });
  }

  function parseGeoGS(xmlText) {
    var blocks = sieveBlocks(parseXml(xmlText));
    if (!blocks.length) return null;
    var total = num(childText(blocks[0].el, 'SampleWt'));
    var wash = blocks[1] ? num(childText(blocks[1].el, 'SampleWt')) : null;
    var sieveMap = {};
    blocks.forEach(function (block) {
      block.points.forEach(function (tp) {
        var pt = sievePoint(tp);
        if (pt && pt.wt != null) sieveMap[pt.sz] = pt.wt;
      });
    });
    function gv(v) { return v == null || !isFinite(v) ? '' : v; }
    function pick() {
      for (var i = 0; i < arguments.length; i++) {
        if (sieveMap[arguments[i]] != null) return sieveMap[arguments[i]];
      }
      return null;
    }
    return {
      total_wt: gv(total),
      wash_wt: gv(wash),
      sieves: {
        in2: '',
        in1: gv(pick('1"', '1\\"', "1'")),
        in38: gv(pick('3/8"', '3/8\\"', '3/8')),
        no4: gv(pick('#4')),
        no10: gv(pick('#10')),
        no40: gv(pick('#40')),
        no200: gv(pick('#200'))
      }
    };
  }

  function parseGeoLIM(xmlText) {
    var tree = parseXml(xmlText);
    var out = {
      nm_inputs: { tare: '', wet: '', dry: '' },
      ll_inputs: { bottle: '', tare: '', wet: '', dry: '', blows: '', nv: false },
      pl_inputs: { bottle: '', tare: '', wet: '', dry: '', np: false }
    };
    var nwc = findAll(tree, 'NATURAL_WATER_CONTENT')[0];
    if (nwc) {
      var wet = attr(nwc, 'wet'), dry = attr(nwc, 'dry'), tare = attr(nwc, 'tare');
      if (wet && dry && tare) out.nm_inputs = { tare: num(tare), wet: num(wet), dry: num(dry) };
    }
    var ll = findAll(tree, 'LIQUID_LIMIT')[0];
    if (ll) {
      var llText = (ll.children || []).map(function (c) { return c.text || ''; }).join(' ');
      if (/NV/i.test(llText) && !firstChild(ll, 'LLTestPoint') && !findAll(ll.children || [], 'MOISTURE_DATA').length) {
        out.ll_inputs.nv = true;
      } else {
        var md = findAll(ll.children || [], 'MOISTURE_DATA')[0];
        var blows = findAll(ll.children || [], 'Blows')[0];
        if (md) {
          var blowsN = parseInt(elText(blows), 10);
          out.ll_inputs = {
            bottle: '',
            tare: num(attr(md, 'tare')),
            wet: num(attr(md, 'wet')),
            dry: num(attr(md, 'dry')),
            blows: isFinite(blowsN) ? blowsN : '',
            nv: false
          };
        } else if (/NV/i.test(llText)) out.ll_inputs.nv = true;
      }
    }
    var pl = findAll(tree, 'PLASTIC_LIMIT')[0];
    if (pl) {
      var plText = (pl.children || []).map(function (c) { return c.text || ''; }).join(' ');
      var pmd = findAll(pl.children || [], 'MOISTURE_DATA')[0];
      if (pmd && !(/NP/i.test(plText) && !attr(pmd, 'wet'))) {
        out.pl_inputs = {
          bottle: '',
          tare: num(attr(pmd, 'tare')),
          wet: num(attr(pmd, 'wet')),
          dry: num(attr(pmd, 'dry')),
          np: false
        };
      } else if (/NP/i.test(plText)) out.pl_inputs.np = true;
    }
    return out;
  }

  function calcMoisture(tare, wet, dry) {
    tare = parseFloat(tare); wet = parseFloat(wet); dry = parseFloat(dry);
    if (!isFinite(tare) || !isFinite(wet) || !isFinite(dry)) return null;
    var denom = dry - tare;
    if (denom <= 0) return null;
    return ((wet - dry) / denom) * 100;
  }

  function calcAtterbergPct(tare, wet, dry) {
    return calcMoisture(tare, wet, dry);
  }

  function calcSieve(d) {
    d = d || {};
    var total = parseFloat(d.total_wt) || 0;
    var washWt = parseFloat(d.wash_wt) || 0;
    var s = d.sieves || {};
    function g(k) { return parseFloat(s[k]) || 0; }
    var cum10 = g('no10');
    var cum40 = g('no40');
    var cum200 = g('no200');
    var cum4 = g('no4');
    var cumPctRetAt10 = total > 0 ? (cum10 / total) * 100 : 0;
    var pctPassWash = 100 - cumPctRetAt10;
    var ret40 = cum40;
    var ret200 = cum200 - cum40;
    var pctRet40 = washWt > 0 ? (ret40 / washWt) * pctPassWash : 0;
    var pctRet200 = washWt > 0 ? (ret200 / washWt) * pctPassWash : 0;
    var pctPass10 = total > 0 ? 100 - cumPctRetAt10 : 100;
    var pctPass4 = total > 0 ? 100 - (cum4 / total) * 100 : 100;
    var pctPass40 = 100 - (cumPctRetAt10 + pctRet40);
    var pctPass200 = Math.max(0, Math.min(100, 100 - (cumPctRetAt10 + pctRet40 + pctRet200)));
    var gravel = total > 0 ? Math.max(0, 100 - pctPass4) : 0;
    var coarseSand = total > 0 ? Math.max(0, pctPass4 - pctPass40) : 0;
    var fineSand = total > 0 ? Math.max(0, pctPass40 - pctPass200) : 0;
    return {
      pctPass10: pctPass10, pctPass40: pctPass40, pctPass200: pctPass200,
      gravel: gravel, coarseSand: coarseSand, fineSand: fineSand, fines: pctPass200,
      hasData: total > 0
    };
  }

  function aashto(p200, p10, p40, ll, pi) {
    var LL = ll != null && isFinite(ll) ? parseFloat(ll) : 0;
    var PI = pi != null && isFinite(pi) ? parseFloat(pi) : 0;
    var P200 = p200 != null && isFinite(p200) ? parseFloat(p200) : 0;
    var P40 = p40 != null && isFinite(p40) ? parseFloat(p40) : 100;
    var P10 = p10 != null && isFinite(p10) ? parseFloat(p10) : 100;
    var grp = '', gi = 0;
    if (P200 <= 35) {
      if (P10 <= 50 && P40 <= 30 && P200 <= 15 && PI <= 6) grp = 'A-1-a';
      else if (P40 <= 50 && P200 <= 25 && PI <= 6) grp = 'A-1-b';
      else if (P200 <= 10 && PI === 0) grp = 'A-3';
      else if (P200 <= 35 && LL <= 40 && PI <= 10) grp = 'A-2-4';
      else if (P200 <= 35 && LL > 40 && PI <= 10) grp = 'A-2-5';
      else if (P200 <= 35 && LL <= 40 && PI > 10) {
        grp = 'A-2-6'; gi = Math.max(0, Math.round(0.01 * (P200 - 15) * (PI - 10)));
      } else if (P200 <= 35 && LL > 40 && PI > 10) {
        grp = 'A-2-7'; gi = Math.max(0, Math.round(0.01 * (P200 - 15) * (PI - 10)));
      } else grp = 'A-2-4';
    } else if (LL <= 40 && PI <= 10) {
      grp = 'A-4'; gi = Math.max(0, Math.round((P200 - 35) * (0.2 + 0.005 * (LL - 40)) + 0.01 * (P200 - 15) * (PI - 10)));
    } else if (LL > 40 && PI <= 10) {
      grp = 'A-5'; gi = Math.max(0, Math.round((P200 - 35) * (0.2 + 0.005 * (LL - 40)) + 0.01 * (P200 - 15) * (PI - 10)));
    } else if (LL <= 40 && PI > 10) {
      grp = 'A-6'; gi = Math.max(0, Math.round((P200 - 35) * (0.2 + 0.005 * (LL - 40)) + 0.01 * (P200 - 15) * (PI - 10)));
    } else if (LL > 40 && PI > 10) {
      grp = (PI <= LL - 30) ? 'A-7-5' : 'A-7-6';
      gi = Math.max(0, Math.round((P200 - 35) * (0.2 + 0.005 * (LL - 40)) + 0.01 * (P200 - 15) * (PI - 10)));
    }
    return { group: grp, gi: gi, full: gi > 0 ? grp + '(' + gi + ')' : grp };
  }

  function uscsClassification(data) {
    var fines = parseFloat(data.fines) || 0;
    var gravel = parseFloat(data.gravel) || 0;
    var sand = (parseFloat(data.coarseSand) || 0) + (parseFloat(data.fineSand) || 0);
    var ll = data.ll != null && data.ll !== 'NV' ? parseFloat(data.ll) : null;
    var pi = data.pi != null && data.pi !== 'NP' ? parseFloat(data.pi) : null;
    var aLine = (ll != null && pi != null && isFinite(ll) && isFinite(pi)) ? 0.73 * (ll - 20) : null;
    var isClayey = (pi != null && aLine != null) ? pi >= aLine : false;
    if (fines >= 50) {
      if (ll == null || pi == null || !isFinite(ll) || !isFinite(pi)) return 'ML/CL';
      if (ll < 50) return isClayey ? 'CL' : 'ML';
      return isClayey ? 'CH' : 'MH';
    }
    var primary = gravel > sand ? 'G' : 'S';
    if (fines < 5) return primary === 'G' ? 'GP' : 'SP';
    var secondary = isClayey ? 'C' : 'M';
    if (fines <= 12) {
      var grad = primary === 'G' ? 'GP' : 'SP';
      return grad + '-' + primary + secondary;
    }
    return primary + secondary;
  }

  function blowStored(v) {
    if (v == null || String(v).trim() === '') return null;
    var s = String(v).trim();
    if (/^(WH|WR|WOH)/i.test(s)) return s.toUpperCase();
    var f = parseFloat(s);
    if (!isFinite(f)) return s;
    return Math.round(f);
  }

  function blowNum(v) {
    if (v == null) return null;
    if (typeof v === 'number' && isFinite(v)) return v;
    if (/^(WH|WR|WOH)/i.test(String(v))) return 0;
    var f = parseFloat(v);
    return isFinite(f) ? Math.round(f) : null;
  }

  function nValue(blows) {
    var a = blowNum(blows[1]);
    var b = blowNum(blows[2]);
    if (a == null || b == null) return null;
    return a + b;
  }

  function sampleKind(num, desc) {
    var u = String(num == null ? '' : num).toUpperCase();
    if (/^R[\-_ ]?\d+/.test(u) || /rock\s*core/i.test(desc || '')) return 'rock_core';
    if (/^U[\-_ ]?\d+/.test(u) || /shelby/i.test(desc || '')) return 'shelby';
    return 'split_spoon';
  }

  function pdArray(pd, keys) {
    for (var i = 0; i < keys.length; i++) {
      var v = pd[keys[i]];
      if (v != null && String(v).trim() !== '') return splitPArray(v);
    }
    return [];
  }

  function firstPd(pd, keys) {
    for (var i = 0; i < keys.length; i++) {
      if (pd[keys[i]] != null && String(pd[keys[i]]).trim() !== '') return String(pd[keys[i]]).trim();
    }
    return '';
  }

  function fmtGeoDate(ds) {
    if (!ds) return '';
    var m = String(ds).match(/^(\d+)\/(\d+)\/(\d+)$/);
    if (!m) return ds;
    var yr = parseInt(m[3], 10);
    yr = yr < 50 ? 2000 + yr : (yr < 100 ? 1900 + yr : yr);
    function p(n) { return String(n).padStart(2, '0'); }
    return yr + '-' + p(m[1]) + '-' + p(m[2]);
  }

  function endBoring(desc) {
    return /end\s*(of\s*)?boring/i.test(String(desc || '').trim());
  }

  function cleanDesc(desc) {
    var t = String(desc || '').trim();
    if (!t || endBoring(t) || !/[a-zA-Z]/.test(t)) return '';
    return t;
  }

  function emptyLab() {
    return {
      nm_inputs: { tare: '', wet: '', dry: '' },
      ll_inputs: { bottle: '', tare: '', wet: '', dry: '', blows: '', nv: false },
      pl_inputs: { bottle: '', tare: '', wet: '', dry: '', np: false },
      sieve_inputs: { total_wt: '', wash_wt: '', sieves: { in2: '', in1: '', in38: '', no4: '', no10: '', no40: '', no200: '' } }
    };
  }

  function fileByBase(files) {
    var map = {};
    files.forEach(function (f) {
      map[baseName(f.name || f.path).toUpperCase()] = f;
    });
    return map;
  }

  function textOf(f) {
    return f && f.text != null ? String(f.text) : '';
  }

  function ixMap(pd, keys) {
    var ix = pd && pd.__indexed;
    if (!ix) return null;
    for (var i = 0; i < keys.length; i++) if (ix[keys[i]]) return ix[keys[i]];
    return null;
  }

  function ixText(map, slot) {
    if (!map || map[slot] == null) return '';
    return String(map[slot]).trim();
  }

  function ixNum(map, slot) {
    var t = ixText(map, slot);
    if (!t) return null;
    if (/^(NV|NP)$/i.test(t)) return t.toUpperCase();
    var f = parseFloat(t);
    return isFinite(f) ? f : t;
  }

  function nextIndexedDepth(depthMap, slot, top, recoveryIn) {
    var slotN = parseInt(slot, 10);
    var later = Object.keys(depthMap || {}).map(function (k) { return parseInt(k, 10); })
      .filter(function (k) { return k > slotN; })
      .sort(function (a, b) { return a - b; });
    if (later.length) {
      var nxt = num(depthMap[later[0]]);
      if (nxt != null && top != null && nxt > top) return nxt;
    }
    if (top == null) return null;
    return top + Math.max((recoveryIn || 24) / 12, 0.5);
  }

  function indexedDesc(descMap, gdMap, slot) {
    if (!descMap) return '';
    var lines = Object.keys(descMap).map(function (k) { return parseInt(k, 10); })
      .sort(function (a, b) { return a - b; })
      .map(function (k) { return descMap[k]; });
    var gd = gdMap && gdMap[slot] != null ? parseInt(gdMap[slot], 10) : null;
    if (gd != null && lines[gd] != null) return lines[gd];
    return descMap[slot] || '';
  }

  function holeBottom(pd) {
    var depthMap = ixMap(pd, ['DEPTH']);
    var sampMap = ixMap(pd, ['SAMP_NUM', 'SAMPLENUM', 'SAMPLE_NUM', 'SAMPLE_NO']);
    if (!depthMap) return null;
    var bottom = null;
    Object.keys(depthMap).forEach(function (slot) {
      if (sampMap && sampMap[slot] != null) return;
      var v = num(depthMap[slot]);
      if (v != null && (bottom == null || v > bottom)) bottom = v;
    });
    return bottom == null ? null : round1(bottom);
  }

  function fillIndexedByNum(pd, byNum) {
    var sampMap = ixMap(pd, ['SAMP_NUM', 'SAMPLENUM', 'SAMPLE_NUM', 'SAMPLE_NO']);
    if (!sampMap) return false;
    var depthMap = ixMap(pd, ['DEPTH']) || {};
    var recMap = ixMap(pd, ['SAMP_REC', 'SAMPLE_REC', 'RECOVERY']) || {};
    var b1 = ixMap(pd, ['BLOWS1']) || {};
    var b2 = ixMap(pd, ['BLOWS2']) || {};
    var b3 = ixMap(pd, ['BLOWS3']) || {};
    var b4 = ixMap(pd, ['BLOWS4']) || {};
    var gdMap = ixMap(pd, ['GDMID', 'GDM_ID']) || {};
    var classMap = ixMap(pd, ['AASHTO_CLASS', 'AASHTO']) || {};
    var typeMap = ixMap(pd, ['SAMP_TYPE', 'SAMPLE_TYPE']) || {};
    var descMap = ixMap(pd, ['DESCRIPTION']) || {};
    var p200 = ixMap(pd, ['PER200']) || {};
    var p10 = ixMap(pd, ['PER10']) || {};
    var p40 = ixMap(pd, ['PER40']) || {};
    var p4 = ixMap(pd, ['PER4']) || {};
    var ll = ixMap(pd, ['LL']) || {};
    var pi = ixMap(pd, ['PI']) || {};
    var pl = ixMap(pd, ['PL']) || {};
    var nm = ixMap(pd, ['NM']) || {};
    var uscs = ixMap(pd, ['USCS']) || {};
    Object.keys(sampMap).forEach(function (slot) {
      var sNum = parseInt(sampMap[slot], 10);
      if (!isFinite(sNum)) return;
      var top = num(depthMap[slot]);
      var recovery = num(recMap[slot]);
      byNum[sNum] = {
        idx: parseInt(slot, 10) - 1,
        blows: [ixText(b1, slot), ixText(b2, slot), ixText(b3, slot), ixText(b4, slot)],
        aashto: ixText(classMap, slot),
        desc: indexedDesc(descMap, gdMap, slot),
        recovery: recovery,
        depth: nextIndexedDepth(depthMap, slot, top, recovery),
        depthTop: top,
        type: ixText(typeMap, slot),
        stored: {
          p200: ixNum(p200, slot),
          p10: ixNum(p10, slot),
          p40: ixNum(p40, slot),
          p4: ixNum(p4, slot),
          ll: ixNum(ll, slot),
          pi: ixNum(pi, slot),
          pl: ixNum(pl, slot),
          nm: ixNum(nm, slot),
          uscs: ixText(uscs, slot)
        }
      };
    });
    return true;
  }

  function labSignature(group) {
    var sieve = group.GS ? parseGeoGS(textOf(group.GS)) : null;
    var sv = sieve ? calcSieve(sieve) : null;
    var at = group.LIM ? parseGeoLIM(textOf(group.LIM)) : null;
    var nmv = null, llv = null, plv = null;
    if (at) {
      nmv = calcMoisture(at.nm_inputs.tare, at.nm_inputs.wet, at.nm_inputs.dry);
      llv = at.ll_inputs.nv ? 'NV' : calcAtterbergPct(at.ll_inputs.tare, at.ll_inputs.wet, at.ll_inputs.dry);
      plv = at.pl_inputs.np ? 'NP' : calcAtterbergPct(at.pl_inputs.tare, at.pl_inputs.wet, at.pl_inputs.dry);
    }
    var present = {};
    if (sieve && sieve.sieves && sv) {
      if (sieve.sieves.no200 !== '' && sieve.sieves.no200 != null) present.p200 = sv.pctPass200;
      if (sieve.sieves.no10 !== '' && sieve.sieves.no10 != null) present.p10 = sv.pctPass10;
      if (sieve.sieves.no40 !== '' && sieve.sieves.no40 != null) present.p40 = sv.pctPass40;
      if (sieve.sieves.no4 !== '' && sieve.sieves.no4 != null) present.p4 = sv.pctPass4;
    }
    return { sieve: sieve, at: at, nm: nmv, ll: llv, pl: plv, present: present };
  }

  function labScore(sample, sig) {
    var checks = 0, bad = 0, dist = 0;
    function consider(fileVal, sampleVal) {
      if (fileVal == null || sampleVal == null || sampleVal === '') return;
      checks++;
      if (typeof fileVal === 'number' && typeof sampleVal === 'number') {
        var d = Math.abs(fileVal - sampleVal);
        dist += d;
        if (d > 0.6) bad++;
      } else if (String(fileVal).toUpperCase() !== String(sampleVal).toUpperCase()) bad++;
    }
    if (sig.present.p200 != null) consider(sig.present.p200, sample.p200);
    if (sig.present.p10 != null) consider(sig.present.p10, sample.p10);
    if (sig.present.p40 != null) consider(sig.present.p40, sample.p40);
    if (sig.present.p4 != null) consider(sig.present.p4, sample.p4);
    if (sig.nm != null) consider(sig.nm, sample.nm);
    if (sig.ll != null) consider(sig.ll, sample.ll);
    if (sig.pl != null) consider(sig.pl, sample.pl);
    if (!checks || bad) return null;
    return { checks: checks, dist: dist };
  }

  function reported(stored, calc) {
    if (stored == null || stored === '') return calc;
    return typeof stored === 'number' ? round1(stored) : stored;
  }

  function attachLooseLabs(borings, byName, used) {
    var groups = {};
    Object.keys(byName).forEach(function (name) {
      var m = /^(\d+)\.(GS|LIM)$/i.exec(name);
      if (!m) return;
      var stem = m[1];
      if (used[stem]) return;
      if (!groups[stem]) groups[stem] = { stem: stem };
      groups[stem][m[2].toUpperCase()] = byName[name];
    });
    var pools = [];
    borings.forEach(function (b) { (b.s || []).forEach(function (s) { pools.push(s); }); });
    var unmatched = [];
    var attached = 0;
    Object.keys(groups).sort().forEach(function (stem) {
      var sig = labSignature(groups[stem]);
      var best = -1, bestScore = null, ties = 0;
      pools.forEach(function (s, i) {
        if (s.gs_file || s.lim_file) return;
        var sc = labScore(s, sig);
        if (!sc) return;
        if (!bestScore || sc.checks > bestScore.checks || (sc.checks === bestScore.checks && sc.dist + 0.05 < bestScore.dist)) {
          best = i; bestScore = sc; ties = 0;
        } else if (bestScore && sc.checks === bestScore.checks && Math.abs(sc.dist - bestScore.dist) <= 0.05) {
          ties++;
        }
      });
      var g = groups[stem];
      if (best < 0 || ties) {
        if (g.GS) unmatched.push(baseName(g.GS.name || g.GS.path));
        if (g.LIM) unmatched.push(baseName(g.LIM.name || g.LIM.path));
        return;
      }
      var s = pools[best];
      if (g.GS) {
        if (sig.sieve) s.sieve_inputs = sig.sieve;
        s.gs_file = baseName(g.GS.name || g.GS.path);
      }
      if (g.LIM && sig.at) {
        s.nm_inputs = sig.at.nm_inputs;
        s.ll_inputs = sig.at.ll_inputs;
        s.pl_inputs = sig.at.pl_inputs;
        s.lim_file = baseName(g.LIM.name || g.LIM.path);
      }
      if (s.p200 == null && sig.present.p200 != null) s.p200 = round1(sig.present.p200);
      if (s.p10 == null && sig.present.p10 != null) s.p10 = round1(sig.present.p10);
      if (s.p40 == null && sig.present.p40 != null) s.p40 = round1(sig.present.p40);
      if (s.nm == null && sig.nm != null && isFinite(sig.nm)) s.nm = round1(sig.nm);
      if (s.ll == null && sig.ll != null) s.ll = typeof sig.ll === 'number' ? round1(sig.ll) : sig.ll;
      if ((s.pl == null || s.pl === '') && sig.pl != null) s.pl = typeof sig.pl === 'number' ? round1(sig.pl) : sig.pl;
      if ((s.pi == null || s.pi === '') && typeof s.ll === 'number' && typeof s.pl === 'number') s.pi = round1(s.ll - s.pl);
      if ((s.ll === 'NV' || s.pl === 'NP') && (s.pi == null || s.pi === '')) s.pi = 'NP';
      attached++;
    });
    return { unmatched: unmatched, attached: attached };
  }

  var CONTRACT_FIELD_KEYS = ['STATE_CONTRACT', 'STATE_CONTRAC', 'PROJ_NUM', 'PROJECT_NUM', 'JOB_NO', 'JOB_NUM', 'JOBNUMBER', 'CONTRACT_NO', 'CONTRACT'];

  function contractToken(text) {
    // The index is often "T202270302Bethany" with no break after the number.
    var m = String(text || '').match(/T\d{6,12}(?:\.\d+)?/i);
    return m ? m[0].toUpperCase() : '';
  }

  function looksLikePath(text) {
    var s = String(text || '');
    return /[\\/]/.test(s) || /^[A-Za-z]:/.test(s);
  }

  function explicitContract(raw) {
    var cut = String(raw || '').split('$')[0].trim();
    if (!cut || looksLikePath(cut)) return contractToken(cut);
    return cut;
  }

  function contractFromFields(pd) {
    return explicitContract(firstPd(pd || {}, CONTRACT_FIELD_KEYS));
  }

  function realProjectName(text, contract) {
    var s = String(text || '').replace(/\.geo$/i, '').trim();
    if (!s || looksLikePath(s)) return '';
    var token = contract || contractToken(s);
    if (token && s.toUpperCase() === String(token).toUpperCase()) return '';
    if (token) {
      var at = s.toUpperCase().indexOf(String(token).toUpperCase());
      if (at === 0) s = s.slice(token.length);
      else if (at > 0 && !/[A-Za-z0-9]/.test(s.charAt(at - 1))) s = s.slice(0, at) + ' ' + s.slice(at + token.length);
      s = s.replace(/^[\s._-]+|[\s._-]+$/g, '').replace(/\s+/g, ' ').trim();
    }
    if (!s || looksLikePath(s)) return '';
    return s;
  }

  function xmlSet(text, tag) {
    var m = String(text || '').match(new RegExp('<' + tag + '\\b[^>]*\\bset="([^"]*)"', 'i'));
    return m ? m[1] : '';
  }

  function readLabSettings(files) {
    var gs = '';
    var common = '';
    (files || []).forEach(function (f) {
      var n = baseName(f.name || f.path);
      if (/^gssettings.*\.xml$/i.test(n)) gs = textOf(f);
      if (/^commonsettings.*\.xml$/i.test(n)) common = textOf(f);
    });
    var decimals = parseInt(xmlSet(gs, 'PercentageDecimals'), 10);
    if (!isFinite(decimals) || decimals < 0 || decimals > 4) decimals = 1;
    return {
      percentageDecimals: decimals,
      number200OneDecimal: /^yes$/i.test(xmlSet(gs, 'ReportNumber200To1DecimalPlace')),
      classification: xmlSet(common, 'PreferredClassification')
    };
  }

  function roundPct(v, digits) {
    if (v == null || !isFinite(v)) return null;
    var p = Math.pow(10, digits < 0 ? 0 : digits);
    return Math.round(v * p) / p;
  }

  function parseOneProject(key, files, warnings) {
    var byName = fileByBase(files);
    var gsEntries = parseGeoMDT(textOf(byName['GSCOMB.MDT']));
    var limEntries = parseGeoMDT(textOf(byName['LIMCOMB.MDT']));
    var index = {};
    limEntries.forEach(function (e) {
      index[normBoring(e.boring) + '||' + e.sampleNo] = { fileIdx: null, depthTo: e.depthTo, recovery: e.recovery, boring: e.boring, sampleNo: e.sampleNo };
    });
    gsEntries.forEach(function (e) {
      index[normBoring(e.boring) + '||' + e.sampleNo] = { fileIdx: e.fileIdx, depthTo: e.depthTo, recovery: e.recovery, boring: e.boring, sampleNo: e.sampleNo };
    });

    var projFields = {};
    var boringFiles = [];
    files.forEach(function (f) {
      var name = baseName(f.name || f.path);
      if (!/\.\$p\$$/i.test(name)) return;
      var pd = parseGeoPDollar(textOf(f));
      var boring = firstPd(pd, ['BORING']);
      if (/^9999/i.test(name) || (!boring && firstPd(pd, ['PROJECT']))) {
        Object.keys(pd).forEach(function (k) {
          if (k.charAt(0) === '_') return;
          if (projFields[k] == null || projFields[k] === '') projFields[k] = pd[k];
        });
      } else if (boring) {
        boringFiles.push({ name: boring, pd: pd });
      }
    });

    var ndx = files.filter(function (f) { return /\.ndx$/i.test(baseName(f.name || f.path)); })[0];
    var pdt = files.filter(function (f) { return /\.pdt$/i.test(baseName(f.name || f.path)); })[0];
    var ndxStem = ndx ? baseName(ndx.name || ndx.path).replace(/\.ndx$/i, '') : '';
    var pdtStem = pdt ? baseName(pdt.name || pdt.path).replace(/\.pdt$/i, '') : '';
    var labSettings = readLabSettings(files);
    var contract = contractFromFields(projFields);
    if (!contract) {
      for (var ci = 0; ci < boringFiles.length; ci++) {
        contract = contractFromFields(boringFiles[ci].pd);
        if (contract) break;
      }
    }
    if (!contract) {
      contract = contractToken(ndxStem) || contractToken(pdtStem) || contractToken(folderLabel(key)) || contractToken(firstPd(projFields, ['PROJECT']));
    }
    var projectText = firstPd(projFields, ['PROJECT']);
    if (!projectText || looksLikePath(projectText)) {
      for (var ni = 0; ni < boringFiles.length; ni++) {
        var named = firstPd(boringFiles[ni].pd, ['PROJECT']);
        if (named && !looksLikePath(named)) { projectText = named; break; }
      }
    }
    var name = realProjectName(projectText, contract) || realProjectName(folderLabel(key), contract) || realProjectName(ndxStem, contract) || realProjectName(pdtStem, contract);
    if (!name && !contract) {
      var fallback = projectText || folderLabel(key) || ndxStem || pdtStem;
      name = looksLikePath(fallback) ? '' : fallback;
    }
    var location = firstPd(projFields, ['PROJ_LOC']);
    var projWarnings = [];
    var usedStems = {};

    var boringNames = boringFiles.map(function (b) { return b.name; });
    if (!boringNames.length) {
      var seen = {};
      Object.keys(index).forEach(function (k) {
        var b = index[k].boring;
        if (!seen[b]) { seen[b] = 1; boringNames.push(b); }
      });
    }
    if (!boringNames.length && !firstPd(projFields, ['PROJECT']) && !ndx) return null;

    var borings = boringNames.map(function (boringName) {
      var found = null;
      for (var i = 0; i < boringFiles.length; i++) {
        if (normBoring(boringFiles[i].name) === normBoring(boringName)) { found = boringFiles[i]; break; }
      }
      var pd = found ? found.pd : {};
      var bWarnings = [];
      var depths = pdArray(pd, ['DEPTH']);
      var sampNums = pdArray(pd, ['SAMP_NUM', 'SAMPLENUM', 'SAMPLE_NUM', 'SAMPLE_NO']);
      var recs = pdArray(pd, ['SAMP_REC', 'SAMPLE_REC', 'RECOVERY']);
      var b1 = pdArray(pd, ['BLOWS1']);
      var b2 = pdArray(pd, ['BLOWS2']);
      var b3 = pdArray(pd, ['BLOWS3']);
      var b4 = pdArray(pd, ['BLOWS4']);
      var gdmids = pdArray(pd, ['GDMID', 'GDM_ID']);
      var classes = pdArray(pd, ['AASHTO_CLASS', 'AASHTO']);
      var types = pdArray(pd, ['SAMP_TYPE', 'SAMPLE_TYPE']);
      var descs = splitPArray(pd.DESCRIPTION || '');
      var byNum = {};
      if (!fillIndexedByNum(pd, byNum)) {
        sampNums.forEach(function (n, idx) {
          var sNum = parseInt(n, 10);
          if (!isFinite(sNum)) return;
          var gd = gdmids[idx] != null ? parseInt(gdmids[idx], 10) : null;
          var desc = (gd != null && descs[gd] != null) ? descs[gd] : (descs[idx] || '');
          byNum[sNum] = {
            idx: idx,
            blows: [b1[idx] || '', b2[idx] || '', b3[idx] || '', b4[idx] || ''],
            aashto: classes[idx] || '',
            desc: desc,
            recovery: num(recs[idx]),
            depth: num(depths[idx]),
            type: types[idx] || ''
          };
        });
      }

      var numbers = Object.keys(byNum).map(function (n) { return parseInt(n, 10); });
      Object.keys(index).forEach(function (k) {
        var e = index[k];
        if (normBoring(e.boring) !== normBoring(boringName)) return;
        if (numbers.indexOf(e.sampleNo) < 0) numbers.push(e.sampleNo);
      });
      if (!numbers.length) {
        var count = Math.max(depths.length, b1.length, descs.length, gdmids.length);
        for (var n = 1; n <= count; n++) numbers.push(n);
      }
      numbers.sort(function (a, b) {
        var da = (index[normBoring(boringName) + '||' + a] || {}).depthTo;
        var db = (index[normBoring(boringName) + '||' + b] || {}).depthTo;
        if (byNum[a] && byNum[a].depth != null) da = byNum[a].depth;
        if (byNum[b] && byNum[b].depth != null) db = byNum[b].depth;
        if (isFinite(da) && isFinite(db) && da !== db) return da - db;
        return a - b;
      });

      var samples = [];
      var eob = holeBottom(pd);
      var prev = 0;
      var wdepth = num(pd.WDEPTH1);
      numbers.forEach(function (sNum) {
        var sd = byNum[sNum] || {};
        var hit = index[normBoring(boringName) + '||' + sNum] || null;
        var descRaw = sd.desc || '';
        var depthTo = hit && isFinite(hit.depthTo) ? hit.depthTo : sd.depth;
        var recovery = sd.recovery != null ? sd.recovery : (hit && isFinite(hit.recovery) ? hit.recovery : 24);
        var blowList = sd.blows || ['', '', '', ''];
        var blowsBlank = !blowList.some(function (b) { return String(b || '').trim(); });
        if (endBoring(descRaw) && blowsBlank) {
          if (isFinite(depthTo)) eob = round1(depthTo);
          return;
        }
        if (!isFinite(depthTo) || depthTo <= prev) {
          var bump = Math.max((recovery || 24) / 12, 0.5);
          var was = depthTo;
          depthTo = prev + bump;
          bWarnings.push('Sample ' + sNum + ' depth ' + (was == null ? 'missing' : was) + ' did not move down the hole; stored bottom ' + round1(depthTo) + ' ft.');
        }
        var depthFrom = sd.depthTop != null ? sd.depthTop : prev;
        prev = depthTo;
        var lab = emptyLab();
        var fileIdx = hit ? hit.fileIdx : null;
        var gsName = '';
        var limName = '';
        if (fileIdx != null) {
          var stem = String(fileIdx).padStart(8, '0');
          usedStems[stem] = 1;
          var gs = byName[stem + '.GS'];
          var lim = byName[stem + '.LIM'];
          if (gs) {
            gsName = baseName(gs.name || gs.path);
            var sieve = parseGeoGS(textOf(gs));
            if (sieve) lab.sieve_inputs = sieve;
          }
          if (lim) {
            limName = baseName(lim.name || lim.path);
            var at = parseGeoLIM(textOf(lim));
            lab.nm_inputs = at.nm_inputs;
            lab.ll_inputs = at.ll_inputs;
            lab.pl_inputs = at.pl_inputs;
          }
        }
        var sv = calcSieve(lab.sieve_inputs);
        var nm = calcMoisture(lab.nm_inputs.tare, lab.nm_inputs.wet, lab.nm_inputs.dry);
        var ll = lab.ll_inputs.nv ? 'NV' : calcAtterbergPct(lab.ll_inputs.tare, lab.ll_inputs.wet, lab.ll_inputs.dry);
        var pl = lab.pl_inputs.np ? 'NP' : calcAtterbergPct(lab.pl_inputs.tare, lab.pl_inputs.wet, lab.pl_inputs.dry);
        var pi = null;
        if (ll === 'NV' || pl === 'NP') pi = 'NP';
        else if (ll != null && pl != null) pi = ll - pl;
        var llN = typeof ll === 'number' ? ll : null;
        var piN = typeof pi === 'number' ? pi : null;
        var cls = null;
        if (sv.hasData) cls = aashto(sv.pctPass200, sv.pctPass10, sv.pctPass40, llN, piN);
        var aashtoFile = sd.aashto || '';
        var aashtoFull = aashtoFile || (cls ? cls.full : null);
        var uscs = sv.hasData ? uscsClassification({
          fines: sv.fines, gravel: sv.gravel, coarseSand: sv.coarseSand, fineSand: sv.fineSand,
          ll: ll === 'NV' ? null : llN, pi: pi === 'NP' ? null : piN
        }) : null;
        var st = sd.stored || null;
        var pctDigits = labSettings.percentageDecimals;
        var p200Digits = labSettings.number200OneDecimal ? 1 : pctDigits;
        var p10v = sv.hasData ? roundPct(sv.pctPass10, pctDigits) : null;
        var p200v = sv.hasData ? roundPct(sv.pctPass200, p200Digits) : null;
        var nmv = round1(nm);
        var llv = ll == null ? null : (typeof ll === 'number' ? round1(ll) : ll);
        var piv = pi == null ? null : (typeof pi === 'number' ? round1(pi) : pi);
        var plv = pl == null ? null : (typeof pl === 'number' ? round1(pl) : pl);
        var p40v = null;
        var p4v = null;
        if (st) {
          p10v = reported(st.p10, p10v);
          p200v = reported(st.p200, p200v);
          p40v = reported(st.p40, p40v);
          p4v = reported(st.p4, p4v);
          nmv = reported(st.nm, nmv);
          llv = reported(st.ll, llv);
          piv = reported(st.pi, piv);
          plv = reported(st.pl, plv);
          if (st.uscs) uscs = st.uscs;
          if (st.aashto) aashtoFull = st.aashto;
        }
        var blows = [blowStored(sd.blows ? sd.blows[0] : ''), blowStored(sd.blows ? sd.blows[1] : ''), blowStored(sd.blows ? sd.blows[2] : ''), blowStored(sd.blows ? sd.blows[3] : '')];
        var desc = cleanDesc(descRaw);
        samples.push({
          num: sNum,
          kind: sampleKind(sd.type || sNum, desc),
          d: round1(depthTo),
          desc: desc,
          ll: llv,
          pi: piv,
          pl: plv,
          nm: nmv,
          uscs: uscs,
          aashto: aashtoFull,
          aashto_file: aashtoFile,
          p10: p10v,
          p40: p40v,
          p4: p4v,
          p200: p200v,
          gs_file: gsName || null,
          lim_file: limName || null,
          blows: blows,
          n: nValue(blows),
          depth_from: round1(depthFrom),
          depth_to: round1(depthTo),
          recovery_in: recovery,
          sieve_inputs: lab.sieve_inputs,
          nm_inputs: lab.nm_inputs,
          ll_inputs: lab.ll_inputs,
          pl_inputs: lab.pl_inputs,
          water_level: isFinite(wdepth) && wdepth >= depthFrom && wdepth < depthTo
        });
      });

      var ownContract = contractFromFields(pd);
      var east = num(firstPd(pd, ['EAST', 'EASTING']));
      var north = num(firstPd(pd, ['NORTH', 'NORTHING']));
      var lat = num(firstPd(pd, ['LATITUDE', 'LAT', 'LAT_DD']));
      var lon = num(firstPd(pd, ['LONGITUDE', 'LONG', 'LON', 'LONG_DD']));
      var e = east, n = north;
      if (!(inBox(lat, lon))) {
        lat = null; lon = null;
        if (east != null && north != null) {
          var loc = locate(east, north);
          lat = loc.lat; lon = loc.lon; e = loc.e; n = loc.n;
          if (loc.swapped) bWarnings.push('North and east looked swapped; stored the order that lands in Delaware.');
          else if (lat == null) bWarnings.push('North/east did not land in Delaware. Easting and northing are kept; the map point is blank.');
        }
      } else {
        lat = round7(lat); lon = round7(lon);
      }
      return {
        b: firstPd(pd, ['BORING']) || boringName,
        lat: lat, lon: lon, e: e, n: n, eob: eob,
        station: firstPd(pd, ['STATION', 'STA']),
        offset: firstPd(pd, ['OFFSET', 'OFF']),
        location: firstPd(pd, ['LOCATION']),
        date_started: fmtGeoDate(firstPd(pd, ['BDATE'])),
        date_completed: fmtGeoDate(firstPd(pd, ['CDATE'])),
        hammer_wt: firstPd(pd, ['HAMMER_WT']),
        hammer_fall: firstPd(pd, ['HAMMER_DROP']),
        d_sampler: firstPd(pd, ['DSAMPLER']),
        d_od: firstPd(pd, ['DSAMP_DIA']),
        contractor: firstPd(projFields, ['CONTRACTOR']) || firstPd(pd, ['DRILL_CONTRAC']),
        rig: firstPd(pd, ['DRILL_RIG']),
        driller: firstPd(pd, ['DRILLER']),
        logged_by: firstPd(pd, ['CHECKED_BY']),
        supervisor: firstPd(pd, ['SUPERVISOR']),
        remarks: firstPd(pd, ['NOTES']),
        contract: ownContract || contract,
        warnings: bWarnings,
        s: samples
      };
    });

    if (!byName['GSCOMB.MDT'] && !byName['LIMCOMB.MDT']) {
      var loose = attachLooseLabs(borings, byName, usedStems);
      if (loose.unmatched.length && !loose.attached) {
        projWarnings.push('No GSCOMB.MDT or LIMCOMB.MDT — depths come from the boring file, and sieve files are not attached.');
      } else if (loose.unmatched.length) {
        projWarnings.push('No GSCOMB.MDT or LIMCOMB.MDT — these lab files did not match a sample: ' + loose.unmatched.join(', ') + '.');
      }
    }

    return {
      name: name,
      contract: contract,
      labSettings: labSettings,
      location: location,
      federal: firstPd(projFields, ['FEDERAL_CONTRACT']),
      borings: borings,
      warnings: projWarnings
    };
  }

  function parseGeoBundle(files) {
    var list = (files || []).filter(function (f) { return f && isGeoName(f.name || f.path || ''); });
    var warnings = [];
    var errors = [];
    if (!list.length) {
      return {
        projects: [],
        warnings: warnings,
        errors: ['No GeoSystem project files in that drop. Choose the .GEO folder (GSCOMB.MDT and .$P$ files) or a zip of that folder.']
      };
    }
    var groups = {};
    var order = [];
    list.forEach(function (f) {
      var key = projectKey(f.path || f.name);
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push(f);
    });
    var projects = [];
    order.forEach(function (key) {
      var p = parseOneProject(key, groups[key], warnings);
      if (p && p.borings.length) projects.push(p);
      else if (p) projects.push(p);
    });
    if (!projects.length) errors.push('Those files did not contain a boring or a project name.');
    projects.forEach(function (p) { warnings = warnings.concat(p.warnings || []); });
    return { projects: projects, warnings: warnings, errors: errors };
  }

  function dbBoring(b) {
    return {
      b: b.b, lat: b.lat, lon: b.lon, e: b.e, n: b.n, eob: b.eob == null ? null : b.eob,
      s: (b.s || []).map(function (s) {
        return {
          num: s.num, kind: s.kind, d: s.d, desc: s.desc,
          ll: s.ll, pi: s.pi, nm: s.nm, uscs: s.uscs, aashto: s.aashto,
          p10: s.p10, p200: s.p200, blows: s.blows, n: s.n
        };
      })
    };
  }

  function toDbProjects(projects) {
    return (projects || []).map(function (p) {
      return {
        name: p.name,
        contract: p.contract || '',
        location: p.location || '',
        borings: (p.borings || []).map(dbBoring)
      };
    });
  }

  function mergeProjectsIntoDb(db, projects) {
    if (!db || typeof db !== 'object') db = { borings: [], cores: [], jobs: {} };
    db.borings = db.borings || [];
    db.cores = db.cores || [];
    db.jobs = db.jobs || {};
    var added = 0;
    var replaced = [];
    (projects || []).forEach(function (p) {
      if (!p || !p.name) return;
      var before = db.borings.length;
      db.borings = db.borings.filter(function (r) { return r.job !== p.name; });
      if (db.borings.length !== before) replaced.push(p.name);
      (p.borings || []).forEach(function (b) {
        var row = dbBoring(b);
        row.job = p.name;
        db.borings.push(row);
        added++;
      });
      db.jobs[p.name] = {
        contract: p.contract || '',
        location: p.location || '',
        imported: new Date().toISOString().slice(0, 10),
        source: 'geosystem'
      };
    });
    return { added: added, replaced: replaced };
  }

  function previewRows(bundle) {
    var rows = [];
    ((bundle && bundle.projects) || []).forEach(function (p) {
      (p.borings || []).forEach(function (b) {
        rows.push({
          job: p.name,
          contract: p.contract || '',
          boring: b.b,
          samples: (b.s || []).length,
          e: b.e, n: b.n,
          onMap: b.lat != null && b.lon != null,
          notes: (b.warnings || []).concat(p.warnings || []).join(' ')
        });
      });
      if (!(p.borings || []).length) {
        rows.push({ job: p.name, contract: p.contract || '', boring: '', samples: 0, e: null, n: null, onMap: false, notes: (p.warnings || []).join(' ') });
      }
    });
    return rows;
  }

  function looksLikeZip(buf) {
    var u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf || []);
    return u8.length >= 4 && u8[0] === 0x50 && u8[1] === 0x4b && (u8[2] === 0x03 || u8[2] === 0x05 || u8[2] === 0x07);
  }

  function inflateRaw(u8) {
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
      return Promise.resolve(require('zlib').inflateRawSync(Buffer.from(u8)));
    }
    if (typeof DecompressionStream === 'function') {
      var stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Response(stream).arrayBuffer().then(function (b) { return new Uint8Array(b); });
    }
    return Promise.reject(new Error('This browser cannot open a zipped .GEO folder. Unzip it, then drop the folder.'));
  }

  function unzipToTexts(buf) {
    var u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf || []);
    var view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    function u16(o) { return view.getUint16(o, true); }
    function u32(o) { return view.getUint32(o, true); }
    var eocd = -1;
    var start = Math.max(0, u8.length - 22 - 65535);
    for (var i = u8.length - 22; i >= start; i--) {
      if (u32(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) return Promise.resolve({ files: [], tooBig: false, message: 'That zip could not be read.' });
    var count = u16(eocd + 10);
    var cdOff = u32(eocd + 16);
    if (cdOff === 0xFFFFFFFF) {
      return Promise.resolve({ files: [], tooBig: true, message: tooBigMessage('This zip') });
    }
    var entries = [];
    var total = 0;
    var pos = cdOff;
    for (var n = 0; n < count; n++) {
      if (pos + 46 > u8.length || u32(pos) !== 0x02014b50) break;
      var method = u16(pos + 10);
      var compSize = u32(pos + 20);
      var uncomp = u32(pos + 24);
      var nameLen = u16(pos + 28);
      var extraLen = u16(pos + 30);
      var commentLen = u16(pos + 32);
      var localOff = u32(pos + 42);
      var name = '';
      for (var c = 0; c < nameLen; c++) name += String.fromCharCode(u8[pos + 46 + c]);
      if (uncomp === 0xFFFFFFFF || compSize === 0xFFFFFFFF || localOff === 0xFFFFFFFF) {
        return Promise.resolve({ files: [], tooBig: true, message: tooBigMessage(name || 'This zip') });
      }
      total += uncomp;
      if (total > BROWSER_IMPORT_LIMIT || uncomp > BROWSER_IMPORT_LIMIT) {
        return Promise.resolve({ files: [], tooBig: true, message: tooBigMessage(name || 'This zip') });
      }
      entries.push({ name: name, method: method, compSize: compSize, uncomp: uncomp, localOff: localOff });
      pos += 46 + nameLen + extraLen + commentLen;
    }
    var chain = Promise.resolve([]);
    entries.forEach(function (ent) {
      chain = chain.then(function (acc) {
        if (ent.name.endsWith('/')) return acc;
        if (!isGeoName(ent.name)) return acc;
        var local = ent.localOff;
        if (local + 30 > u8.length || u32(local) !== 0x04034b50) return acc;
        var nLen = u16(local + 26);
        var xLen = u16(local + 28);
        var dataStart = local + 30 + nLen + xLen;
        var slice = u8.subarray(dataStart, dataStart + ent.compSize);
        var done = function (raw) {
          var bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
          var text = '';
          for (var k = 0; k < bytes.length; k++) text += String.fromCharCode(bytes[k]);
          acc.push({ name: baseName(ent.name), path: ent.name.replace(/\\/g, '/'), text: text });
          return acc;
        };
        if (ent.method === 0) return done(slice);
        if (ent.method === 8) return inflateRaw(slice).then(done);
        return acc;
      });
    });
    return chain.then(function (files) {
      return { files: files, tooBig: false, message: '' };
    });
  }

  function storage() {
    try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; }
  }

  function peekInbox() {
    var ls = storage();
    if (!ls) return [];
    try {
      var raw = ls.getItem(INBOX_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return parsed && parsed.projects ? parsed.projects : [];
    } catch (e) { return []; }
  }

  function clearInbox() {
    var ls = storage();
    if (!ls) return;
    try { ls.removeItem(INBOX_KEY); } catch (e) { /* ignore */ }
  }

  function stashInbox(projects) {
    var ls = storage();
    if (!ls) return { ok: false, reason: 'This browser cannot hold the map copy. Use the Jobs tab in GeoTrak.' };
    var dbProjects = toDbProjects(projects);
    var payload = JSON.stringify({ v: 1, projects: dbProjects });
    if (payload.length > INBOX_MAX) {
      return { ok: false, reason: 'This project is too big to hand to the map from here. Open GeoTrak → Jobs and drop the same folder.' };
    }
    try {
      ls.setItem(INBOX_KEY, payload);
      return { ok: true, reason: '' };
    } catch (e) {
      return { ok: false, reason: 'The browser could not hold the map copy. Open GeoTrak → Jobs and drop the same folder.' };
    }
  }

  function readStdin() {
    return new Promise(function (resolve, reject) {
      var chunks = [];
      process.stdin.on('data', function (c) { chunks.push(c); });
      process.stdin.on('end', function () { resolve(Buffer.concat(chunks).toString('utf8')); });
      process.stdin.on('error', reject);
    });
  }

  function mainCli(argv) {
    var stdin = argv.indexOf('--stdin') >= 0;
    var outIdx = argv.indexOf('--out');
    var out = outIdx >= 0 ? argv[outIdx + 1] : '';
    if (!stdin || !out) {
      console.error('Usage: node import-geo.js --stdin --out db.json');
      process.exit(2);
    }
    var fs = require('fs');
    return readStdin().then(function (text) {
      var db = { borings: [], cores: [], jobs: {} };
      if (fs.existsSync(out)) {
        try { db = JSON.parse(fs.readFileSync(out, 'utf8')); } catch (e) { db = { borings: [], cores: [], jobs: {} }; }
      }
      var lines = text.split(/\n/);
      var projects = [];
      for (var i = 0; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        var msg = JSON.parse(lines[i]);
        var bundle = parseGeoBundle(msg.files || []);
        projects = projects.concat(bundle.projects || []);
      }
      var merged = mergeProjectsIntoDb(db, projects);
      fs.writeFileSync(out, JSON.stringify(db));
      console.log(JSON.stringify({ borings: db.borings.length, jobs: Object.keys(db.jobs).length, added: merged.added }));
    }).catch(function (err) {
      console.error(err && err.stack ? err.stack : err);
      process.exit(1);
    });
  }

  if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
    mainCli(process.argv.slice(2));
  }

  return {
    BROWSER_IMPORT_LIMIT: BROWSER_IMPORT_LIMIT,
    INBOX_KEY: INBOX_KEY,
    tooBigMessage: tooBigMessage,
    looksLikeZip: looksLikeZip,
    unzipToTexts: unzipToTexts,
    parseGeoPDollar: parseGeoPDollar,
    parseGeoMDT: parseGeoMDT,
    parseGeoGS: parseGeoGS,
    parseGeoLIM: parseGeoLIM,
    parseGeoBundle: parseGeoBundle,
    mergeProjectsIntoDb: mergeProjectsIntoDb,
    toDbProjects: toDbProjects,
    previewRows: previewRows,
    delawareFtToLatLon: delawareFtToLatLon,
    peekInbox: peekInbox,
    clearInbox: clearInbox,
    stashInbox: stashInbox,
    calcSieve: calcSieve,
    aashto: aashto
  };
});
