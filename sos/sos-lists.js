/* DelDOT live APL + Approved Aggregate Chart lookups.
   Shared by the browser app and Node (fetch-lists / tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SOSLists = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const APL_INDEX_URL = 'https://materialsandresearch.deldot.gov/index.php/Approved_Product_Lists';

  const APL_PDFS = {
    tack: {
      label: 'Tack Coat',
      url: 'https://materialsandresearch.deldot.gov/images/8/8c/Tack_Coat_APL.pdf',
    },
    striping: {
      label: 'Pavement Markings',
      url: 'https://materialsandresearch.deldot.gov/images/4/4a/Pavement_Marking_Approved_Products_List.pdf',
    },
    crack: {
      label: 'Hot Applied Joint and Crack Sealants',
      url: 'https://materialsandresearch.deldot.gov/images/d/d0/Joint_and_Crack_Sealant_Approved_Products_List.pdf',
    },
    curing: {
      label: 'Concrete Curing Compounds',
      url: 'https://materialsandresearch.deldot.gov/images/1/16/Concrete_Curing_Compound_Approved_Products_List.pdf',
    },
    dws: {
      label: 'Detectable Warning Surfaces',
      url: 'https://materialsandresearch.deldot.gov/images/d/dc/DWS_and_DTSI_APL.pdf',
    },
    ttcSigns: {
      label: 'Temporary Warning Signs',
      url: 'https://materialsandresearch.deldot.gov/images/e/ea/Temporary_Warning_Signs_APL.pdf',
    },
    ttcBarricades: {
      label: 'Temporary Barricades',
      url: 'https://materialsandresearch.deldot.gov/images/0/0e/Temporary_Barricades_APL.pdf',
    },
    tma: {
      label: 'Truck and Trailer Mounted Attenuators',
      url: 'https://materialsandresearch.deldot.gov/images/0/04/Truck_and_Trailer_Mounted_Attenuators_APL.pdf',
    },
  };

  function squeeze(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }

  function foldName(s) {
    return squeeze(s)
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/\b(ppg\/?\s*)/g, '')
      .replace(/,?\s*(llc|l\.l\.c\.|inc\.?|incorporated|co\.?|company|corp\.?|corporation|ltd\.?)\.?\s*/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function nameMatch(a, b) {
    const x = foldName(a);
    const y = foldName(b);
    if (!x || !y) return false;
    if (x === y) return true;
    if (x.length >= 4 && y.includes(x)) return true;
    if (y.length >= 4 && x.includes(y)) return true;
    const xs = x.split(' ').filter(w => w.length > 2);
    const ys = new Set(y.split(' ').filter(w => w.length > 2));
    if (xs.length >= 2 && xs.filter(w => ys.has(w)).length >= 2) return true;
    return false;
  }

  function locMatch(a, b) {
    const x = squeeze(a).toLowerCase();
    const y = squeeze(b).toLowerCase();
    if (!x || !y) return true;
    const city = (s) => s.replace(/,/g, ' ').replace(/\s+[a-z]{2}\b(\s+\d{5})?$/i, '').replace(/[^a-z]+/g, ' ').trim();
    const cx = city(x);
    const cy = city(y);
    if (cx && cy) return cx === cy || cx.includes(cy) || cy.includes(cx);
    return x.includes(y) || y.includes(x);
  }

  function normGrade(s) {
    return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function extractGrade(product) {
    const s = String(product || '');
    const m = s.match(/\b([A-Z]{1,4}-?\d{0,3}[A-Z]{0,3}(?:-?[A-Z]{1,3})?)\b/i);
    if (m && /tack|crs|css|cqs|em-?50|cntt/i.test(s + ' ' + m[1])) return m[1];
    const tack = s.match(/\b(CRS-?\d[A-Z]*|CSS-?\d[A-Z]*|CQS-?\d[A-Z]*P?|EM-?50-?TT|CNTT)\b/i);
    return tack ? tack[1] : '';
  }

  function parseLastModified(text) {
    const m = String(text || '').match(/Date Last Modified[:\s]*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4})/i);
    return m ? m[1] : '';
  }

  function parseTackAplText(text) {
    const blob = squeeze(String(text || '').replace(/[\r\n]+/g, ' '));
    const entries = [];
    const locRe = /\(([^)]+,\s*[A-Z]{2})\)/g;
    let m;
    while ((m = locRe.exec(blob))) {
      const loc = squeeze(m[1]);
      const before = blob.slice(Math.max(0, m.index - 90), m.index);
      const words = squeeze(before).split(/\s+/);
      const take = [];
      for (let i = words.length - 1; i >= 0; i--) {
        const w = words[i].replace(/,$/, '');
        if (!w || /^\d/.test(w) || /\d\/\d/.test(w)) break;
        if (/^(date|dates|grades|approval|approved|source|last|modified|coat|coats|emulsified|department)$/i.test(w)) break;
        take.unshift(w);
        if (take.length >= 8) break;
      }
      let name = take.join(' ').replace(/\s+Inc\.?$/i, '');
      name = name.replace(/^(?:(?:Approved|Grades|Approval|Date|Source)\s+)+/i, '').trim();
      if (!/[A-Za-z]{3}/.test(name)) continue;
      if (/^(approved|grades|source|section)$/i.test(name)) continue;
      const after = blob.slice(m.index + m[0].length);
      const rest = after.match(/^\s*([A-Za-z0-9][A-Za-z0-9 ,./-]*?)\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/);
      if (!rest) continue;
      const grades = rest[1].split(/[,/]+/).map(g => squeeze(g)).filter(g => /[A-Z]/i.test(g) && !/^source$/i.test(g));
      if (!grades.length) continue;
      entries.push({ name, loc, grades, approved: rest[2] });
    }
    return {
      kind: 'tack',
      modified: parseLastModified(text),
      entries,
    };
  }

  function parseManufacturerProductText(text, kind) {
    const entries = [];
    const re = /([A-Za-z][A-Za-z0-9 .,'&/()-]{2,}?)\s+([A-Za-z0-9][A-Za-z0-9 .,'&/()°-]*?)\s+(?:PMM-|JS-|CS-|RPM-|CADD-|NA\b|N\/A)/g;
    const blob = String(text || '').replace(/\u00ad/g, '');
    let m;
    while ((m = re.exec(blob))) {
      const name = squeeze(m[1]).replace(/^Manufacturer\s+/i, '');
      const product = squeeze(m[2]);
      if (/^(item|approved|date|notes|section|delaware)/i.test(name)) continue;
      if (name.length > 60) continue;
      entries.push({ name, product });
    }
    const names = [...new Set(entries.map(e => e.name))];
    return {
      kind,
      modified: parseLastModified(text),
      entries,
      manufacturers: names,
    };
  }

  function chartStatus(raw) {
    const s = String(raw || '').toLowerCase();
    if (/reject|fail|unsat|not approved|expired|no\b/.test(s)) return 'rejected';
    if (/approv|pass|ok\b|yes|current/.test(s)) return 'approved';
    if (/pend|hold|wait/.test(s)) return 'pending';
    return '';
  }

  function parseExcelDate(raw) {
    const s = squeeze(raw);
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (/^\d+(\.\d+)?$/.test(s)) {
      const n = Number(s);
      if (n > 20000 && n < 80000) {
        const utc = new Date(Math.round((n - 25569) * 86400 * 1000));
        return utc.toISOString().slice(0, 10);
      }
    }
    const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (m) {
      let y = Number(m[3]);
      if (y < 100) y += y >= 70 ? 1900 : 2000;
      return `${y}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
    }
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return '';
  }

  function headerKey(cell) {
    const s = squeeze(cell).toLowerCase();
    if (/source|producer|quarry|pit|plant|company|supplier|pit name/.test(s) && !/alt/.test(s)) return 'name';
    if (/location|city|town|county|site/.test(s)) return 'loc';
    if (/material|product|type|item|size|gradation|gabc|borrow|stone/.test(s) && !/date/.test(s)) return 'material';
    if (/status|approved|reject|result|pass|fail/.test(s)) return 'status';
    if (/test\s*date|sampled|date tested|approval date|date/.test(s)) return 'testDate';
    if (/sample|lab\s*#|id/.test(s)) return 'sampleId';
    if (/addr/.test(s)) return 'addr';
    if (/note|comment|remark/.test(s)) return 'notes';
    return '';
  }

  function looksLikeAggregateChart(filename, rows) {
    if (/aggregat|gabc.?chart|approved.?source|source.?chart/i.test(filename || '')) return true;
    const grid = rows || [];
    for (let r = 0; r < Math.min(grid.length, 12); r++) {
      const joined = (grid[r] || []).map(c => String(c || '').toLowerCase()).join(' | ');
      if (joined.includes('specification') && joined.includes('item description')) return false;
      const keys = (grid[r] || []).map(headerKey).filter(Boolean);
      if (keys.includes('name') && (keys.includes('status') || keys.includes('testDate'))) return true;
    }
    return false;
  }

  function parseAggregateChartGrid(rows, meta) {
    const grid = (rows || []).map(r => (Array.isArray(r) ? r : [r]));
    let header = -1;
    let map = {};
    for (let r = 0; r < Math.min(grid.length, 20); r++) {
      const keys = (grid[r] || []).map(headerKey);
      const named = keys.filter(Boolean);
      if (named.includes('name') && named.length >= 2) {
        header = r;
        keys.forEach((k, i) => { if (k) map[k] = i; });
        break;
      }
    }
    const entries = [];
    if (header < 0) return { kind: 'aggregate', file: (meta && meta.filename) || '', entries };
    for (let r = header + 1; r < grid.length; r++) {
      const row = grid[r] || [];
      const name = squeeze(row[map.name]);
      if (!name || /^source$|^producer$|^total$/i.test(name)) continue;
      const statusRaw = map.status != null ? row[map.status] : '';
      const dateRaw = map.testDate != null ? row[map.testDate] : '';
      let status = chartStatus(statusRaw);
      if (!status && parseExcelDate(dateRaw)) status = 'approved';
      if (!status) status = 'pending';
      entries.push({
        name,
        loc: map.loc != null ? squeeze(row[map.loc]) : '',
        material: map.material != null ? squeeze(row[map.material]) : '',
        status,
        testDate: parseExcelDate(dateRaw),
        sampleId: map.sampleId != null ? squeeze(row[map.sampleId]) : '',
        notes: map.notes != null ? squeeze(row[map.notes]) : '',
      });
    }
    return {
      kind: 'aggregate',
      file: (meta && meta.filename) || '',
      loadedAt: new Date().toISOString(),
      entries,
    };
  }

  function materialMatch(chartMaterial, itemMaterial) {
    const a = String(chartMaterial || '').toLowerCase();
    const b = String(itemMaterial || '').toLowerCase();
    if (!a || !b) return true;
    const tags = [
      [/gabc|graded aggregate|crusher run/, /gabc|graded aggregate|crusher run/],
      [/crush|rca|recycled concrete/, /crush|rca|recycled concrete/],
      [/borrow.*c|type c/, /borrow.*c|type c/],
      [/borrow.*a|type a/, /borrow.*a|type a/],
      [/borrow.*b|type b/, /borrow.*b|type b/],
      [/no\.?\s*57|#?57/, /57/],
      [/no\.?\s*3|#?3 stone/, /no\.?\s*3|#?3/],
      [/channel bed|cbf/, /channel bed|cbf/],
      [/riprap/, /riprap/],
      [/topsoil/, /topsoil/],
    ];
    for (const [x, y] of tags) {
      if (x.test(a) && y.test(b)) return true;
    }
    return a.includes(b) || b.includes(a);
  }

  function lookupTack(list, name, loc, product) {
    const entries = (list && list.entries) || list || [];
    const companyHits = entries.filter(e => nameMatch(e.name, name));
    if (!companyHits.length) return { listed: null };
    const locHits = companyHits.filter(e => locMatch(e.loc, loc));
    if (loc && companyHits.some(e => e.loc) && !locHits.length) {
      return { listed: false, locationMismatch: true, entry: companyHits[0], matches: companyHits };
    }
    const pool = locHits.length ? locHits : companyHits;
    const grade = extractGrade(product);
    if (grade) {
      const ok = pool.filter(e => (e.grades || []).some(g => normGrade(g) === normGrade(grade)));
      if (!ok.length) {
        return {
          listed: false,
          gradeMismatch: true,
          entry: pool[0],
          grades: [...new Set(pool.flatMap(e => e.grades || []))],
        };
      }
      return { listed: true, entry: ok[0], grade };
    }
    return { listed: true, entry: pool[0] };
  }

  function lookupManufacturer(list, name) {
    const entries = (list && list.entries) || [];
    const hit = entries.find(e => {
      const hay = typeof e === 'string' ? e : [e.name, e.product].filter(Boolean).join(' ');
      return nameMatch(hay, name);
    });
    if (hit) return { listed: true, entry: hit };
    const names = (list && list.manufacturers) || [];
    const n = names.find(x => nameMatch(x, name));
    if (n) return { listed: true, entry: { name: n } };
    return { listed: (entries.length || names.length) ? false : null };
  }

  function lookupCrack(list, name, product) {
    const entries = (list && list.entries) || [];
    const hits = entries.filter(e => nameMatch(e.name, name));
    if (!hits.length) return { listed: entries.length ? false : null };
    if (product) {
      const prod = hits.filter(e => foldName(e.product).includes(foldName(product)) || foldName(product).includes(foldName(e.product)));
      if (prod.length) return { listed: true, entry: prod[0] };
    }
    return { listed: true, entry: hits[0] };
  }

  function lookupAggregate(chart, name, loc, material) {
    const entries = (chart && chart.entries) || chart || [];
    if (!entries.length) return { found: false };
    let hits = entries.filter(e => nameMatch(e.name, name));
    if (!hits.length) return { found: false };
    const locHits = loc ? hits.filter(e => locMatch(e.loc, loc)) : hits;
    if (locHits.length) hits = locHits;
    const matHits = material ? hits.filter(e => materialMatch(e.material, material)) : hits;
    if (matHits.length) hits = matHits;
    hits = [...hits].sort((a, b) => String(b.testDate || '').localeCompare(String(a.testDate || '')));
    const best = hits[0];
    return { found: true, status: best.status, testDate: best.testDate, row: best, matches: hits };
  }

  function emptyBundle() {
    return {
      fetchedAt: '',
      aplIndexUrl: APL_INDEX_URL,
      tack: { kind: 'tack', entries: [], modified: '' },
      striping: { kind: 'striping', entries: [], manufacturers: [], modified: '' },
      crack: { kind: 'crack', entries: [], modified: '' },
      curing: { kind: 'curing', entries: [], manufacturers: [], modified: '' },
      aggregate: { kind: 'aggregate', file: '', entries: [] },
    };
  }

  function mergeBundle(base, extra) {
    const out = Object.assign(emptyBundle(), base || {});
    if (!extra) return out;
    ['tack', 'striping', 'crack', 'curing'].forEach(k => {
      if (extra[k] && ((extra[k].entries && extra[k].entries.length) || extra[k].modified)) out[k] = extra[k];
    });
    if (extra.aggregate && extra.aggregate.entries) out.aggregate = extra.aggregate;
    if (extra.fetchedAt) out.fetchedAt = extra.fetchedAt;
    return out;
  }

  function summary(bundle) {
    const b = bundle || emptyBundle();
    const bits = [];
    if (b.tack && b.tack.entries && b.tack.entries.length) {
      bits.push(`Tack APL ${b.tack.entries.length} sources` + (b.tack.modified ? ` (${b.tack.modified})` : ''));
    }
    if (b.striping && (b.striping.manufacturers || []).length) {
      bits.push(`Striping APL ${(b.striping.manufacturers || []).length} manufacturers`);
    }
    if (b.crack && b.crack.entries && b.crack.entries.length) {
      bits.push(`Crack seal ${b.crack.entries.length} products`);
    }
    if (b.aggregate && b.aggregate.entries && b.aggregate.entries.length) {
      const n = b.aggregate.entries.length;
      const ap = b.aggregate.entries.filter(e => e.status === 'approved').length;
      bits.push(`Aggregate chart ${n} rows (${ap} approved)` + (b.aggregate.file ? ` · ${b.aggregate.file}` : ''));
    }
    return bits.join(' · ') || 'No live lists loaded';
  }

  return {
    APL_INDEX_URL,
    APL_PDFS,
    foldName,
    nameMatch,
    locMatch,
    extractGrade,
    parseTackAplText,
    parseManufacturerProductText,
    parseAggregateChartGrid,
    looksLikeAggregateChart,
    lookupTack,
    lookupManufacturer,
    lookupCrack,
    lookupAggregate,
    emptyBundle,
    mergeBundle,
    summary,
  };
});
