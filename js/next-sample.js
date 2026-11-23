/**
 * QR payloads for LabTrak paper.
 * A finished report names itself. A scan opens that same sample:
 * field in Field Control, concrete in Concrete, lab in the lab sample.
 * The handwritten sheet can still name the next sample in its section.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LabTrakNextSample = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function reportSection(section) {
    if (section === 'concrete' || section === 'lab' || section === 'field') return section;
    return '';
  }

  function sectionName(section) {
    if (section === 'concrete') return 'Concrete';
    if (section === 'lab') return 'Lab';
    return 'Field Control';
  }

  function codeUrl(pageUrl, flag, section, reportId) {
    const u = new URL(pageUrl, 'https://labtrak.local/');
    u.search = '';
    u.hash = '';
    u.searchParams.set(flag, '1');
    u.searchParams.set('section', section || '');
    u.searchParams.set('report', reportId || '');
    return u.href;
  }

  function payloadUrl(pageUrl, section, reportId) {
    return codeUrl(pageUrl, 'ltnext', section === 'concrete' ? 'concrete' : 'field', reportId);
  }

  function payloadThisUrl(pageUrl, section, reportId) {
    return codeUrl(pageUrl, 'ltreport', reportSection(section), reportId);
  }

  function sectionFromParts(rawSection) {
    return reportSection(rawSection);
  }

  function parseScan(text) {
    const raw = String(text || '').trim();
    if (!raw) return { type: 'sample', id: '' };
    if (raw.indexOf('LTREPORT|') === 0 || raw.indexOf('LTNEXT|') === 0) {
      const parts = raw.split('|');
      const type = raw.indexOf('LTREPORT|') === 0 ? 'this' : 'next';
      return { type: type, section: sectionFromParts(parts[1]), report: parts[2] || '' };
    }
    try {
      const u = new URL(raw);
      if (u.searchParams.get('ltreport') === '1' || u.searchParams.get('ltnext') === '1') {
        const type = u.searchParams.get('ltreport') === '1' ? 'this' : 'next';
        return { type: type, section: sectionFromParts(u.searchParams.get('section')), report: u.searchParams.get('report') || '' };
      }
      const sample = u.searchParams.get('sample');
      if (sample) return { type: 'sample', id: sample };
    } catch (e) { /* plain test number or id */ }
    return { type: 'sample', id: raw };
  }

  function fieldTestNumber(sample) {
    const digits = String(sample && sample.test_no || '').replace(/\D/g, '');
    if (!digits) return Number.MAX_SAFE_INTEGER;
    const n = parseInt(digits, 10);
    return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
  }

  function isFieldSectionSample(sample) {
    if (!sample || sample.deleted_at) return false;
    const cat = String(sample.test_category || '').toLowerCase();
    if (cat === 'concrete') return false;
    if (sample._approvalKind === 'concrete' || sample._queueKind === 'concrete') return false;
    if (Array.isArray(sample.cylinders) && (sample.testNo || sample.pourLocation || sample.mixDesign)) return false;
    return true;
  }

  function sortFieldSamples(samples) {
    return (samples || []).filter(isFieldSectionSample).slice().sort(function (a, b) {
      const dn = fieldTestNumber(a) - fieldTestNumber(b);
      if (dn) return dn;
      const dc = String(a.created_at || '').localeCompare(String(b.created_at || ''));
      if (dc) return dc;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
  }

  function concreteWhen(set) {
    return String(set && (set.castDate || set.cast_date || set.createdAt || set.created_at) || '');
  }

  function sortConcreteSets(sets) {
    return (sets || []).filter(function (set) { return set && set.id; }).slice().sort(function (a, b) {
      const dc = concreteWhen(a).localeCompare(concreteWhen(b));
      if (dc) return dc;
      return String(a.id).localeCompare(String(b.id));
    });
  }

  function nextAfter(items, reportId) {
    const id = String(reportId || '').trim();
    if (!id) return { status: 'none', item: null };
    const list = items || [];
    const idx = list.findIndex(function (item) { return String(item && item.id) === id; });
    if (idx < 0) return { status: 'missing', item: null };
    if (idx >= list.length - 1) return { status: 'none', item: null };
    return { status: 'next', item: list[idx + 1] };
  }

  function noneMessage(section) {
    return 'No next sample in ' + sectionName(section) + '.';
  }

  function missingMessage(section) {
    return 'That report is not in ' + sectionName(section) + '.';
  }

  return {
    sectionName: sectionName,
    payloadUrl: payloadUrl,
    payloadThisUrl: payloadThisUrl,
    parseScan: parseScan,
    isFieldSectionSample: isFieldSectionSample,
    sortFieldSamples: sortFieldSamples,
    sortConcreteSets: sortConcreteSets,
    nextAfter: nextAfter,
    noneMessage: noneMessage,
    missingMessage: missingMessage
  };
});
