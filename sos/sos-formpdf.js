/* Parse a contractor Source of Supply form that arrived as PDF instead of .xls.
   Browser: pdf.js extracts text, then this module builds the same grid SOSEngine
   already reads. Node: pass extracted text (pypdf) into parseFormText. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./sos-data.js'), require('./sos-engine.js'));
  } else {
    root.SosFormPdf = factory(root.SOSData, root.SOSEngine);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (DATA, ENGINE) {
  'use strict';

  const STATES = 'DE|MD|PA|NJ|VA|NC|NY|OH|IN|GA|AL|UT|AZ|IL|MI|WI|CA|SC|WV|CT';
  const CITY_RE = new RegExp(
    '\\b([A-Z][A-Za-z.\'-]+(?:\\s+[A-Z][A-Za-z.\'-]+)?),\\s*(' + STATES + ')(?:\\s+\\d{5}(?:-\\d{4})?)?',
    'g'
  );
  const STREET_RE = /(?:P\.?\s*O\.?\s*Box\s+\d+|\d{1,5}\s+[A-Za-z0-9][A-Za-z0-9.'#-]*(?:\s+[A-Za-z0-9.'#-]*){0,4}\s+(?:Rd|Road|Ave|Avenue|St\.?|Street|Blvd|Boulevard|Ln|Lane|Dr\.?|Drive|Ct|Court|Pkwy|Pike|Way|Circle|Pl|Place))\b/gi;
  const PHONE_RE = /(?:\+?1[-.\s]*)?\(?\d{3}\)?[-.\s]*\d{3}[-.\s]*\d{4}/g;
  const BAD_CITY = /^(stone|asphalt|concrete|soil|type|class|superpave|paint|erosion|rebar|expansion|grading|traffic|temporary|drainage|pipe|specs?|material|supplier|manufacturer|item|source)$/i;
  const BAD_CITY_TOKEN = /^(dr|rd|ct|ave|st|ln|blvd|hwy|court|street|road|drive|lane|avenue|quarry|run|systems|material|dot|nag|box|inc|llc|co|course|crusher|gyration|inlet|epoxy|resin|joint|capped|sealer|acrylic|silicone|curbing|blanket|mulch|tack|coat|drums|flagger|signs?|truck|tma|highway|safe|stop|plastic|warning|county|white|yellow|graded|aggregate|base|structural|select|earthwork)$/i;
  const HEADER_STOPS = [
    /Agreement\s*\/?\s*Permit\s*\/?\s*Contract\s*\/?\s*Application\s*#?/,
    /Title of Contract/,
    /Source of Supply/,
    /Sub-Contractor/,
    /(?<!Sub-)Contractor/,
    /Address/,
    /E-?Mails?/,
    /DelDOT Contact/,
    /District/,
    /Date/,
    /Delaware Department/,
    /Specification\s*#/,
    /Item Description/,
  ];

  function squeeze(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }

  function escapeRe(s) {
    return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function catalogEntry(spec) {
    const digits = String(spec || '').replace(/\D/g, '');
    if (!digits) return null;
    const cat = (DATA && DATA.SPEC_CATALOG) || {};
    return cat['#' + digits] || cat[digits] || null;
  }

  function catalogDesc(spec) {
    const cat = catalogEntry(spec);
    return cat && cat.desc ? cat.desc : '';
  }

  function specFamily(spec, desc, material) {
    const cat = catalogEntry(spec);
    const catalogFam = cat && cat.family;
    if (ENGINE && ENGINE.familyFromSpec) {
      const fromText = ENGINE.familyFromSpec(
        '#' + String(spec).replace(/\D/g, ''),
        desc || '',
        material || '',
        {},
        []
      );
      // A PDF chunk often includes the next stacked product (Silencure, CRS-1).
      // Do not rewrite a known curb / Superpave / pipe pay item as that accessory.
      if (catalogFam && catalogFam !== fromText
          && ['curing', 'expansion', 'tack'].includes(fromText)
          && !['curing', 'expansion', 'tack'].includes(catalogFam)) {
        return catalogFam;
      }
      return fromText || catalogFam || '';
    }
    return catalogFam || '';
  }

  const EXTRA_PLANTS = [
    { name: 'Hoskinson Gravel Pit', tags: ['Borrow', 'Stone'], pattern: /hoskinson(?:\s+gravel(?:\s+pit)?)?/i },
    { name: 'Ennis Flint', tags: ['APL'], pattern: /ennis[\s-]*(?:paint|flint)(?:\s+inc\.?)?/i },
    { name: 'Epoplex', tags: ['APL'], pattern: /epoplex/i },
    { name: 'Gerdau', tags: ['Rebar'], pattern: /gerdau/i },
    { name: 'Plasticade', tags: ['Traffic Control'], pattern: /plasticade/i },
    { name: 'Trinity Highway', tags: ['Traffic Control', 'APL'], pattern: /trinity\s+highway/i },
    { name: 'J&K Foam Fabricating', tags: ['Concrete', 'Expansion'], pattern: /j\s*&\s*k\s*foam(?:\s+fabricating(?:\s+inc\.?)?)?/i },
    { name: 'Middletown Materials', tags: ['Borrow', 'GABC', 'Stone'], pattern: /middletown\s+materials/i },
    { name: 'Bear Materials', tags: ['Concrete'], pattern: /bear\s+(?:materials|concrete)/i },
    { name: 'WR Meadows', tags: ['Concrete', 'Curing Compound', 'Expansion', 'APL'], pattern: /w\.?\s*r\.?\s*meadows/i },
    { name: 'Neenah Foundry', tags: ['Drainage'], pattern: /neenah(?:\s+foundry)?/i },
    { name: 'Gillespie Precast', tags: ['Precast', 'Drainage'], pattern: /gillespie\s+precast/i },
    { name: 'Rinker Materials', tags: ['RCP', 'Precast'], pattern: /rinker\s+materials/i },
    { name: 'Heritage Concrete', tags: ['Concrete'], pattern: /heritage\s+concrete/i },
    { name: 'North American Green', tags: ['Erosion Control', 'APL'], pattern: /north\s+american\s+green/i },
    { name: 'Asphalt Paving Systems', tags: ['Tack Coat', 'Asphalt', 'APL'], pattern: /asphalt\s+paving\s+systems/i },
    { name: 'Asphalt Emulsion Industries', tags: ['Tack Coat', 'Asphalt', 'APL'], pattern: /asphalt\s+emulsion(?:\s+industries)?/i },
    { name: 'ChemMasters', tags: ['Concrete', 'Curing Compound', 'APL'], pattern: /chemmasters/i },
    { name: 'JD Russell', tags: ['Concrete', 'Expansion'], pattern: /j\.?\s*d\.?\s*russell/i },
    { name: 'ADS', tags: ['Pipe', 'HDPE'], pattern: /\bads\b/i },
    { name: 'Tri County Materials', tags: ['GABC', 'Stone', 'Asphalt'], pattern: /tri[\s-]*county\s+materials/i },
    { name: 'Diamond Materials', tags: ['Asphalt', 'GABC'], pattern: /diamond\s+materials/i },
    { name: 'Martin Marietta', tags: ['GABC', 'Stone'], pattern: /martin\s+marietta/i },
    { name: 'Allan Myers', tags: ['GABC', 'Stone', 'Asphalt'], pattern: /allan\s+myers/i },
    { name: 'Contractors Materials', tags: ['Borrow', 'GABC', 'Topsoil'], pattern: /contractors?\s+materials/i },
  ];

  function plantCatalog() {
    const seen = new Map();
    EXTRA_PLANTS.forEach((p) => { seen.set(p.name.toLowerCase(), p); });
    ((DATA && DATA.SOURCE_SEEDS) || []).forEach((s) => {
      const name = String(s.name || '').trim();
      if (!name || name.length < 4) return;
      const key = name.toLowerCase();
      if (seen.has(key)) {
        const cur = seen.get(key);
        if ((!cur.tags || !cur.tags.length) && s.tags) cur.tags = s.tags;
        return;
      }
      seen.set(key, {
        name,
        tags: s.tags || [],
        pattern: new RegExp(escapeRe(name).replace(/\\s\+/g, '\\s+').replace(/\s+/g, '\\s+'), 'i'),
      });
    });
    return [...seen.values()].sort((a, b) => b.name.length - a.name.length);
  }

  function looksLikeIssuedLetter(text) {
    return /material sources have been reviewed/i.test(String(text || ''));
  }

  function looksLikeContractorForm(text) {
    const t = String(text || '').replace(/\s+/g, ' ');
    if (looksLikeIssuedLetter(t)) return false;
    return /spec\w{0,6}cation/i.test(t) && /item description/i.test(t);
  }

  function grab(text, labelRe) {
    const src = String(text || '');
    const start = src.search(labelRe);
    if (start < 0) return '';
    let rest = src.slice(start).replace(labelRe, '');
    rest = rest.replace(/^\s*:?\s*/, '');
    let end = rest.length;
    HEADER_STOPS.forEach((re) => {
      const m = rest.search(re);
      if (m >= 0 && m < end) end = m;
    });
    return squeeze(rest.slice(0, end)).replace(/^[:\s]+|[:\s]+$/g, '').slice(0, 180);
  }

  function mapDistrict(raw) {
    const t = squeeze(raw);
    if (/central|kent|canal/i.test(t)) return 'Canal';
    if (/new\s*castle|north/i.test(t)) return 'North';
    if (/sussex|south/i.test(t)) return 'South';
    return t;
  }

  function parseContractValue(raw) {
    const t = squeeze(raw);
    const dashed = t.match(/T\s*(\d{4})\s*-?\s*(\d{3})\s*-?\s*(\d{2})/i);
    if (dashed) return 'T' + dashed[1] + dashed[2] + dashed[3];
    const ca = t.match(/\bCA-?(\d{3,5})\b/i);
    if (ca) return 'CA' + ca[1];
    const n = t.match(/\b(\d{3,10})\b/);
    return n ? n[1] : '';
  }

  function contractIds(text) {
    const compact = String(text || '').toUpperCase().replace(/[\s._/-]/g, '');
    const ids = [];
    const seen = new Set();
    function add(v) {
      if (v && !seen.has(v)) { seen.add(v); ids.push(v); }
    }
    let m;
    const tRe = /T(\d{4})(\d{3})(\d{2})/g;
    while ((m = tRe.exec(compact))) add('T' + m[1] + m[2] + m[3]);
    const caRe = /CA(\d{3,5})/g;
    while ((m = caRe.exec(compact))) add('CA' + m[1]);
    return ids;
  }

  function parseProject(text) {
    const contractRaw = grab(text, /Agreement\s*\/?\s*Permit\s*\/?\s*Contract\s*\/?\s*Application\s*#?/);
    const contract = parseContractValue(contractRaw) || parseContractValue(text.slice(0, 400));
    let title = grab(text, /Title of Contract/);
    title = title.replace(/\s*Source of Supply.*$/i, '').trim();
    const contractor = grab(text, /(?<!Sub-)Contractor/).replace(/^Contractor:\s*/i, '');
    const address = grab(text, /Address/).replace(/^Address:\s*/i, '');
    const contact = grab(text, /DelDOT Contact/).replace(/^DelDOT Contact:\s*/i, '');
    const district = mapDistrict(grab(text, /District/).replace(/^District:\s*/i, ''));
    const docKind = ENGINE && ENGINE.detectDocKind ? ENGINE.detectDocKind(contract) : 'application';
    const ids = contractIds(contract + ' ' + text.slice(0, 800));
    if (contract && !ids.includes(contract)) ids.unshift(contract);
    return {
      contract,
      title,
      contractor,
      address,
      contractorAddr: address,
      email: grab(text, /E-?Mails?/),
      subContractor: grab(text, /Sub-Contractor/),
      date: grab(text, /Date/).replace(/^Date:\s*/i, ''),
      district,
      contact,
      docKind,
      appNums: ids,
    };
  }

  function isStripingProductCode(digits) {
    if (ENGINE && ENGINE.isStripingProductCode) return ENGINE.isStripingProductCode(digits);
    return /^(884|980)\d{3}$/.test(String(digits || ''));
  }

  function isLikelySpec(digits, before) {
    if (!/^\d{6}$/.test(digits)) return false;
    if (isStripingProductCode(digits)) return false;
    const series = Number(digits.slice(0, 3));
    const inRange = (series >= 201 && series <= 911) || series === 999;
    const known = !!catalogEntry(digits);
    const sameLine = String(before || '').split(/\n/).pop() || '';
    if (new RegExp('\\b(?:' + STATES + ')\\s+$').test(sameLine)) {
      return known;
    }
    if (known) return true;
    return inRange;
  }

  function findSpecs(text) {
    const src = String(text || '');
    const hits = [];
    const seen = new Set();
    const re = /(?<!\d)(\d{6})(?!\d)/g;
    let m;
    while ((m = re.exec(src))) {
      const digits = m[1];
      const before = src.slice(Math.max(0, m.index - 8), m.index);
      if (!isLikelySpec(digits, before)) continue;
      if (seen.has(digits)) continue;
      seen.add(digits);
      hits.push({ spec: digits, index: m.index, end: m.index + 6 });
    }
    return hits;
  }

  function findPlants(text) {
    const src = String(text || '');
    const all = [];
    plantCatalog().forEach((p) => {
      const r = new RegExp(p.pattern.source, 'ig');
      let m;
      while ((m = r.exec(src))) {
        all.push({
          name: p.name,
          tags: p.tags || [],
          index: m.index,
          end: m.index + m[0].length,
        });
      }
    });
    all.sort((a, b) => a.index - b.index || (b.end - a.index) - (a.end - a.index));
    const kept = [];
    all.forEach((h) => {
      if (kept.some((k) => h.index < k.end && h.end > k.index)) return;
      kept.push(h);
    });
    return kept;
  }

  function findLocations(text) {
    const src = String(text || '');
    const out = [];
    CITY_RE.lastIndex = 0;
    let m;
    while ((m = CITY_RE.exec(src))) {
      const city = squeeze(m[1]);
      const last = city.split(/\s+/).pop() || '';
      const bad = BAD_CITY.test(last) || BAD_CITY.test(city)
        || city.split(/\s+/).some((w) => BAD_CITY_TOKEN.test(w));
      if (bad) {
        CITY_RE.lastIndex = m.index + 1;
        continue;
      }
      const loc = (city + ' ' + m[2].toUpperCase()).replace(/\s+/g, ' ').trim();
      if (loc.length > 36) {
        CITY_RE.lastIndex = m.index + 1;
        continue;
      }
      out.push({
        loc,
        index: m.index,
        raw: m[0],
      });
    }
    if (/elk\s+mills/i.test(src) && !out.some((l) => /elk\s+mills/i.test(l.loc))) {
      out.push({ loc: 'Elk Mills MD', index: src.search(/elk\s+mills/i), raw: 'Elk Mills' });
    }
    return out;
  }

  function findStreets(text) {
    const src = String(text || '');
    const out = [];
    STREET_RE.lastIndex = 0;
    let m;
    while ((m = STREET_RE.exec(src))) {
      out.push(squeeze(m[0]));
    }
    return out;
  }

  function findPhones(text) {
    const src = String(text || '');
    const out = [];
    PHONE_RE.lastIndex = 0;
    let m;
    while ((m = PHONE_RE.exec(src))) out.push(m[0]);
    return out;
  }

  function plantFitsFamily(plant, family) {
    const tags = (plant.tags || []).map((t) => String(t).toLowerCase());
    if (!tags.length || !family) return true;
    // Curing / expansion / DWS manufacturers are not ready-mix plants.
    if (family === 'pcc' && (tags.includes('curing compound') || tags.includes('expansion'))) return false;
    if (family === 'pcc' && tags.includes('apl') && /nitterhouse|hanover/i.test(plant.name || '')) return false;
    if (family === 'rcp' && (tags.includes('hdpe') || /polyethylene|\bhdpe\b|\bads\b/i.test(plant.name || ''))) return false;
    const want = {
      aggregate: ['gabc', 'stone', 'rap'],
      borrow: ['borrow', 'topsoil', 'gabc', 'stone'],
      'hma-mix': ['asphalt'],
      tack: ['tack coat'],
      rcp: ['rcp', 'precast', 'pipe'],
      hdpe: ['hdpe', 'pipe'],
      precast: ['precast', 'drainage'],
      castings: ['drainage', 'apl'],
      pcc: ['concrete'],
      striping: ['apl'],
      erosion: ['erosion control', 'apl'],
      landscape: ['erosion control', 'apl'],
      expansion: ['expansion', 'apl'],
      curing: ['curing compound', 'apl'],
      ttc: ['traffic control', 'apl', 'signage'],
      'apl-product': ['apl', 'erosion control', 'concrete'],
      hardware: ['rebar'],
      signs: ['signage', 'apl', 'traffic control'],
    }[family];
    if (!want) return true;
    return tags.some((t) => want.includes(t));
  }

  function locForPlant(plant, locs) {
    if (!locs.length) return '';
    if (/allan myers/i.test(plant.name)) {
      const elk = locs.find((l) => /elk\s+mills/i.test(l.loc));
      if (elk) return elk.loc;
    }
    if (/martin marietta/i.test(plant.name)) {
      const ne = locs.find((l) => /north\s*east|northeast/i.test(l.loc));
      if (ne) return ne.loc;
    }
    return locs[0].loc;
  }

  function parseItems(text) {
    const hits = findSpecs(text);
    const leftover = [];
    const items = [];
    hits.forEach((hit, i) => {
      const end = hits[i + 1] ? hits[i + 1].index : Math.min(text.length, hit.end + 500);
      const chunk = text.slice(hit.end, end);
      const blob = squeeze(chunk);
      const desc = catalogDesc(hit.spec) || fallbackDesc(chunk);
      const family = specFamily(hit.spec, desc, chunk);
      const plants = findPlants(blob);
      const locs = findLocations(blob);
      const streets = findStreets(blob);
      const phones = findPhones(blob);
      const fitting = plants.filter((p) => plantFitsFamily(p, family));
      const rejected = plants.filter((p) => !plantFitsFamily(p, family));
      rejected.forEach((p) => leftover.push({
        name: p.name,
        tags: p.tags,
        loc: locForPlant(p, locs),
        addr: streets[0] || '',
        phone: phones[0] || '',
      }));

      let used = fitting.slice();
      if (!used.length && leftover.length) {
        const idx = leftover.findIndex((p) => plantFitsFamily(p, family));
        if (idx >= 0) used = [leftover.splice(idx, 1)[0]];
      }
      const primary = used[0] || null;
      const alt = used[1] || null;
      const primaryLoc = primary
        ? (primary.loc || locForPlant(primary, locs))
        : (locs[0] ? locs[0].loc : '');
      let altLoc = '';
      if (alt) {
        const rest = locs.filter((l) => l.loc !== primaryLoc);
        altLoc = locForPlant(alt, rest.length ? rest : locs);
        if (altLoc === primaryLoc && rest.length) altLoc = rest[0].loc;
      } else if (locs[1]) {
        altLoc = locs[1].loc;
      }
      let material = desc;
      const productBits = [];
      const pre = /\b((?:884|980)\d{3})\b(?:\s*\((white|yellow)\))?/ig;
      let pm;
      while ((pm = pre.exec(blob))) {
        const color = pm[2]
          ? ` (${pm[2][0].toUpperCase()}${pm[2].slice(1).toLowerCase()})`
          : '';
        productBits.push(pm[1] + color);
      }
      if (productBits.length) material = productBits.join('; ');
      items.push({
        spec: hit.spec,
        desc,
        material,
        supplier: primary ? primary.name : '',
        manufacturer: (primary && primary.addr) || streets[0] || '',
        alt: alt ? alt.name : '',
        loc: primaryLoc,
        altLoc,
        phone: phones[0] || '',
        family,
      });
    });

    // Continuation rows: locations with no plant belong to the previous source
    // of the same material family (RCP sizes, stacked Superpave, etc.).
    const inheritFamilies = {
      rcp: 1, precast: 1, 'hma-mix': 1, aggregate: 1, borrow: 1,
      striping: 1, landscape: 1, erosion: 1, 'apl-product': 1,
    };
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.supplier) continue;
      const prev = items[i - 1];
      if (!prev || !prev.supplier) continue;
      if (it.family && prev.family && it.family !== prev.family) continue;
      if (it.family && !inheritFamilies[it.family]) continue;
      it.supplier = prev.supplier;
      it.alt = it.alt || prev.alt;
      if (!it.loc) it.loc = prev.loc;
      if (!it.altLoc) it.altLoc = prev.altLoc;
      if (!it.manufacturer) it.manufacturer = prev.manufacturer;
    }
    for (let i = 0; i < items.length - 1; i++) {
      const it = items[i];
      const next = items[i + 1];
      if (!it.supplier || it.loc || !next.loc) continue;
      if (next.supplier && next.supplier !== it.supplier) continue;
      if (it.family && next.family && it.family !== next.family) continue;
      it.loc = next.loc;
      if (!it.altLoc) it.altLoc = next.altLoc;
    }

    leftover.forEach((p) => {
      const target = items.find((it) => !it.supplier && plantFitsFamily(p, it.family))
        || items.find((it) => plantFitsFamily(p, it.family) && !it.supplier);
      if (!target) return;
      p.used = true;
      if (!target.supplier) {
        target.supplier = p.name;
        target.loc = target.loc || p.loc;
        target.manufacturer = target.manufacturer || p.addr;
      } else if (!target.alt) {
        target.alt = p.name;
        target.altLoc = target.altLoc || p.loc;
      }
    });

    emitMissingAccessories(text, items, leftover);
    return items;
  }

  function tackGradeFromText(text) {
    const t = String(text || '');
    const m = t.match(/\b(CRS-?1H?|EM-?50(?:-?TT)?|CNTT)\b/i);
    if (!m) return 'Tack Coat';
    let g = m[1];
    if (/crs-?1h/i.test(g)) g = 'CRS-1H';
    else if (/crs-?1/i.test(g)) g = 'CRS-1';
    else if (/em-?50/i.test(g)) g = 'EM-50-TT';
    else g = 'CNTT';
    return g + ' Tack Coat';
  }

  function pushAccessory(items, row) {
    if (!row || items.some((it) => String(it.spec) === String(row.spec) && it.family === row.family
      && String(it.supplier || '') === String(row.supplier || ''))) return;
    items.push(row);
  }

  function emitMissingAccessories(text, items, leftover) {
    const src = String(text || '');
    const hasFam = (f) => items.some((it) => it.family === f);
    const hasSpec = (digits) => items.some((it) => String(it.spec).replace(/\D/g, '') === String(digits).replace(/\D/g, ''));
    const take = (pred) => {
      const i = leftover.findIndex((p) => !p.used && pred(p));
      if (i < 0) return null;
      leftover[i].used = true;
      return leftover[i];
    };
    const plantFromText = (family, extraPred) => {
      const found = findPlants(src).filter((p) => plantFitsFamily(p, family) && (!extraPred || extraPred(p)));
      return found[0] || null;
    };

    if (!hasFam('curing') && /silencure|1600[-\s]?white|curing compound/i.test(src)) {
      const p = take((x) => /curing compound/i.test((x.tags || []).join(' ')) || /chemmasters|meadows/i.test(x.name))
        || plantFromText('curing');
      if (p) {
        const named = /silencure/i.test(src) ? 'Silencure DOT Curing Compound' : 'Curing Compound';
        pushAccessory(items, {
          spec: '',
          desc: named,
          material: named,
          supplier: p.name,
          manufacturer: p.addr || '',
          alt: '',
          loc: p.loc || '',
          altLoc: '',
          phone: p.phone || '',
          family: 'curing',
        });
      }
    }
    if (!hasFam('expansion') && /reflex|rubber expansion|preformed expansion/i.test(src)) {
      const p = take((x) => /expansion/i.test((x.tags || []).join(' ')) || /russell|j\s*&\s*k foam/i.test(x.name))
        || plantFromText('expansion');
      if (p) {
        const named = /reflex/i.test(src) ? 'Reflex Rubber Expansion' : 'Expansion Joint Material';
        pushAccessory(items, {
          spec: '',
          desc: named,
          material: named,
          supplier: p.name,
          manufacturer: p.addr || '',
          alt: '',
          loc: p.loc || '',
          altLoc: '',
          phone: p.phone || '',
          family: 'expansion',
        });
      }
    }
    if (!hasFam('tack') && /tack\s*coat|crs-?1(?!\d)|em-?50|\bcntt\b/i.test(src)) {
      const p = take((x) => /tack/i.test((x.tags || []).join(' ')) || /russell standard|asphalt emulsion|asphalt paving systems/i.test(x.name))
        || plantFromText('tack', (pl) => /tack/i.test((pl.tags || []).join(' ')));
      pushAccessory(items, {
        spec: '',
        desc: 'Tack Coat',
        material: tackGradeFromText(src),
        supplier: p ? p.name : '',
        manufacturer: p ? (p.addr || '') : '',
        alt: '',
        loc: p ? (p.loc || '') : '',
        altLoc: '',
        phone: p ? (p.phone || '') : '',
        family: 'tack',
      });
    }
    if (!hasSpec('302005') && /\b(?:de(?:laware)?\s*)?(?:no\.?|#)\s*57\b/i.test(src)) {
      const p = take((x) => plantFitsFamily(x, 'aggregate'))
        || plantFromText('aggregate');
      pushAccessory(items, {
        spec: '302005',
        desc: 'DELAWARE NO. 57 STONE',
        material: 'DELAWARE NO. 57 STONE',
        supplier: p ? p.name : '',
        manufacturer: p ? (p.addr || '') : '',
        alt: '',
        loc: p ? (p.loc || '') : '',
        altLoc: '',
        phone: p ? (p.phone || '') : '',
        family: 'aggregate',
      });
    }
    if (!hasFam('hdpe') && /polyethylene|\bhdpe\b|corrugated poly/i.test(src)) {
      const p = take((x) => /hdpe|\bads\b/i.test((x.tags || []).join(' ') + ' ' + x.name))
        || plantFromText('hdpe');
      if (p) {
        pushAccessory(items, {
          spec: '601221',
          desc: 'CORRUGATED POLYETHYLENE PIPE',
          material: 'CORRUGATED POLYETHYLENE PIPE',
          supplier: p.name,
          manufacturer: p.addr || '',
          alt: '',
          loc: p.loc || '',
          altLoc: '',
          phone: p.phone || '',
          family: 'hdpe',
        });
      }
    }
  }

  function fallbackDesc(chunk) {
    let t = squeeze(chunk);
    t = t.split(/Address\s*&\s*Contact|Material Requirements\?|Spec(?:if|fi)cation/i)[0];
    plantCatalog().forEach((p) => {
      t = t.replace(new RegExp(p.pattern.source, 'ig'), ' ');
    });
    t = t.replace(CITY_RE, ' ').replace(STREET_RE, ' ').replace(PHONE_RE, ' ');
    t = t.replace(/\b(supplier|manufacturer|alternate manufacturer|item description)\b/ig, ' ');
    t = squeeze(t).replace(/\b\d{3,}\b/g, ' ').replace(/^[-–,]+|[-–,]+$/g, '');
    t = squeeze(t).slice(0, 80);
    if (DATA && DATA.cleanSpecLibraryDesc) t = DATA.cleanSpecLibraryDesc(t) || t;
    return t;
  }

  function parseFormText(text, meta) {
    const raw = String(text || '');
    const filename = (meta && meta.filename) || '';
    if (looksLikeIssuedLetter(raw)) {
      return {
        kind: 'issued-letter',
        project: {},
        items: [],
        appNums: [],
        error: 'That PDF is an issued M&R letter, not the contractor Source of Supply form.',
      };
    }
    const compact = squeeze(raw);
    if (!compact) {
      return {
        kind: 'unknown',
        project: {},
        items: [],
        appNums: [],
        error: 'This PDF has no selectable text. Phone photos usually fail — drop the .xls if you have it, or a PDF printed/saved from the form.',
      };
    }
    if (!looksLikeContractorForm(raw)) {
      return {
        kind: 'unknown',
        project: {},
        items: [],
        appNums: contractIds(raw),
        error: 'Could not read a contractor Source of Supply form from ' + (filename || 'this PDF') + '.',
      };
    }
    const project = parseProject(raw);
    const items = parseItems(raw);
    return {
      kind: 'contractor-form',
      project,
      items,
      appNums: project.appNums || [],
    };
  }

  function emptyRow() {
    const a = [];
    for (let i = 0; i < 12; i++) a.push('');
    return a;
  }

  function gridFromForm(parsed) {
    const p = (parsed && parsed.project) || {};
    const rows = [];
    const r0 = emptyRow();
    r0[6] = 'Agreement /Permit/Contract/Application #:';
    r0[7] = p.contract || '';
    rows.push(r0);
    const r1 = emptyRow();
    r1[6] = 'Title of Contract:';
    r1[7] = p.title || '';
    rows.push(r1);
    const r2 = emptyRow();
    r2[0] = 'Source of Supply';
    r2[7] = 'Contractor: ' + (p.contractor || '');
    rows.push(r2);
    const r3 = emptyRow();
    r3[0] = 'Materials & Research';
    r3[7] = 'Address: ' + (p.address || p.contractorAddr || '');
    rows.push(r3);
    const r4 = emptyRow();
    r4[7] = 'E-Mail: ' + (p.email || '');
    rows.push(r4);
    const r5 = emptyRow();
    r5[0] = 'Delaware Department of Transportation';
    r5[7] = 'Sub-Contractor: ' + (p.subContractor || '');
    rows.push(r5);
    const r6 = emptyRow();
    r6[7] = 'Date:' + (p.date || '');
    rows.push(r6);
    const r7 = emptyRow();
    r7[1] = 'District: ' + (p.district || '');
    rows.push(r7);
    const r8 = emptyRow();
    r8[7] = 'DelDOT Contact: ' + (p.contact || '');
    rows.push(r8);
    rows.push(['Specification #', '', 'Item Description', 'Plan sheet included with', 'Material', 'Supplier', '', 'Manufacturer', 'Alternate Manufacturer']);
    rows.push(['', '', '', 'Material Requirements?', '', '', '', 'Address & Contact', 'Address & Contact']);
    (parsed.items || []).forEach((it) => {
      const spec = /^\d+$/.test(it.spec) ? Number(it.spec) : it.spec;
      rows.push(['', spec, it.desc || '', '', it.material || it.desc || '', it.supplier || '', '', it.manufacturer || '', it.alt || '']);
      if (it.loc || it.altLoc || it.phone) {
        const cont = emptyRow();
        cont[5] = it.loc || '';
        cont[7] = it.phone || it.loc || '';
        cont[8] = it.altLoc || '';
        rows.push(cont);
      }
      rows.push(Array(9).fill(''));
    });
    return rows;
  }

  function itemsToText(items) {
    const rows = [];
    (items || []).forEach((item) => {
      const str = item.str || '';
      if (!str) return;
      const tr = item.transform || [1, 0, 0, 1, 0, 0];
      const y = Math.round((tr[5] || 0) / 2) * 2;
      const x = tr[4] || 0;
      let row = rows.find((r) => Math.abs(r.y - y) <= 4);
      if (!row) {
        row = { y, bits: [] };
        rows.push(row);
      }
      row.bits.push({ x, str });
    });
    rows.sort((a, b) => b.y - a.y);
    return rows.map((r) => {
      r.bits.sort((a, b) => a.x - b.x);
      return r.bits.map((b) => b.str).join(' ');
    }).join('\n');
  }

  function extractWithPdfJs(bytes, disableWorker) {
    const opts = { data: bytes };
    if (disableWorker) opts.disableWorker = true;
    return pdfjsLib.getDocument(opts).promise.then(function (pdf) {
      const pageNos = [];
      for (let i = 1; i <= pdf.numPages; i++) pageNos.push(i);
      return pageNos.reduce(function (chain, n) {
        return chain.then(function (parts) {
          return pdf.getPage(n).then(function (page) {
            return page.getTextContent().then(function (tc) {
              parts.push(itemsToText(tc.items || []));
              return parts;
            });
          });
        });
      }, Promise.resolve([])).then(function (parts) {
        return parts.join('\n');
      });
    });
  }

  function extractPdfText(data) {
    if (typeof pdfjsLib === 'undefined') {
      return Promise.reject(new Error('PDF reader is not loaded. Check your network connection and refresh.'));
    }
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    return extractWithPdfJs(bytes, false).catch(function () {
      return extractWithPdfJs(bytes, true);
    });
  }

  function parsePdf(arrayBuffer, meta) {
    return extractPdfText(arrayBuffer).then(function (text) {
      const parsed = parseFormText(text, meta || {});
      parsed.text = text;
      return parsed;
    });
  }

  return {
    parseFormText,
    parseProject,
    parseItems,
    gridFromForm,
    parsePdf,
    extractPdfText,
    looksLikeIssuedLetter,
    looksLikeContractorForm,
    mapDistrict,
    isLikelySpec,
    itemsToText,
  };
});
