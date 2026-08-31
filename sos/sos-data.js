/* DelDOT Source of Supply — catalogs, APL lists, and letter language.
   Shared by the browser app and Node tests (no DOM). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SOSData = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const APL_URL = 'https://deldot.gov/Business/prodlists/';
  const APL_FOOTNOTE =
    '*Approved Products List Item (APL) – only products listed on the APL are approved for use. ' + APL_URL;

  const CONTACTS = {
    sampling: {
      name: 'Ray Glanden',
      phone: '302-233-2381',
      org: 'Materials & Research',
    },
    samplingCanal: {
      name: 'Rich Taylor',
      phone: '302-593-7158',
      org: 'Materials & Research',
    },
    samplingNorth: {
      name: 'Damian Blakely',
      phone: '302-593-7158',
      org: 'Materials & Research',
    },
    results: {
      name: 'Aaron Wieczorek',
      phone: '302-760-2583',
    },
    letterAuthor: {
      name: 'Steven Peretiatko',
      title: 'Materials Technician',
      phone: '302-760-2375',
    },
    secretary: 'Shanté A. Hastings',
  };

  /** Material groups used to decide who is copied on a letter. Editable in the CC tab. */
  const CC_MATERIAL_GROUPS = [
    { id: 'soil-stone', label: 'Soil / stone / GABC / borrow', families: ['borrow', 'aggregate', 'riprap', 'topsoil', 'geotextile'] },
    { id: 'hma', label: 'Hot mix / Superpave / tack', families: ['hma-mix', 'tack'] },
    { id: 'pcc', label: 'PCC curb / sidewalk', families: ['pcc'] },
    { id: 'pipe-precast', label: 'RCP / precast / pipe', families: ['rcp', 'precast', 'hdpe', 'utility', 'castings'] },
    { id: 'striping', label: 'Pavement marking', families: ['striping'] },
    { id: 'other-apl', label: 'Crack seal / curing / TTC / APL', families: ['crack-seal', 'curing', 'ttc', 'signs', 'apl-product', 'erosion', 'expansion'] },
  ];

  const CC_DISTRICTS = [
    { id: 'south', label: 'South' },
    { id: 'north', label: 'North' },
    { id: 'canal', label: 'Canal' },
  ];

  /**
   * Default CC assignments. Change the name if someone leaves; checkboxes decide
   * which letter items pull that person onto cc. role: 'results' also fills the
   * "contact … for test results" sentence on must-be-tested soil/stone.
   */
  const CC_ASSIGNMENT_SEEDS = [
    {
      id: 'cc-aaron',
      name: 'Aaron Wieczorek',
      org: 'DelDOT',
      phone: '302-760-2583',
      role: 'results',
      always: false,
      groups: ['soil-stone'],
      districts: [],
    },
    {
      id: 'cc-mark',
      name: 'Mark Schafer',
      org: 'DelDOT',
      phone: '',
      role: '',
      always: false,
      groups: ['hma'],
      districts: [],
    },
  ];

  const STANDARD_CC = CC_ASSIGNMENT_SEEDS.filter(a => a.always).map(a => a.name);

  function normalizeCcName(name) {
    return String(name || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/^richard\b/, 'rich');
  }

  function filterRetiredCcPeople(people, retiredNames) {
    const retired = new Set((retiredNames || []).map(n => normalizeCcName(n)).filter(Boolean));
    if (!retired.size) return people || [];
    return (people || []).filter(p => {
      const name = typeof p === 'string' ? p : (p && p.name);
      return name && !retired.has(normalizeCcName(name));
    });
  }

  function ccPersonSortName(person) {
    return String(typeof person === 'string' ? person : (person && person.name) || '')
      .trim()
      .replace(/\s+/g, ' ');
  }

  function sortCcPeople(people, dir) {
    const sign = String(dir || 'asc').toLowerCase() === 'desc' ? -1 : 1;
    return (people || []).slice().sort((a, b) => {
      const cmp = ccPersonSortName(a).localeCompare(ccPersonSortName(b), undefined, {
        sensitivity: 'base',
        numeric: true,
      });
      if (cmp) return cmp * sign;
      const orgA = String(typeof a === 'string' ? '' : (a && a.org) || '');
      const orgB = String(typeof b === 'string' ? '' : (b && b.org) || '');
      return orgA.localeCompare(orgB, undefined, { sensitivity: 'base' }) * sign;
    });
  }

  const CC_LIBRARY_SEEDS = [
    { name: 'Hunter McCabe', org: 'DelDOT' },
    { name: 'Ray Glanden', org: 'DelDOT' },
    { name: 'Aaron Wieczorek', org: 'DelDOT' },
    { name: 'Raymond Morris', org: 'DelDOT' },
    { name: 'Matt Szelestei', org: 'DelDOT' },
    { name: 'Dave Bunting', org: 'DelDOT' },
    { name: 'David Short', org: 'DelDOT' },
    { name: 'Gerald Nagyiski', org: 'DelDOT' },
    { name: 'Ting Guo', org: 'DelDOT' },
    { name: 'Mark Schafer', org: 'DelDOT' },
    { name: 'Jason Denson', org: 'DelDOT' },
    { name: 'James Kwasnieski', org: 'DelDOT' },
    { name: 'Brian Johnson', org: 'DelDOT' },
    { name: 'Damian Blakely', org: 'DelDOT' },
    { name: 'Erik Ball', org: 'DelDOT' },
    { name: 'James Smith', org: 'DelDOT' },
    { name: 'Matthew Goins', org: 'DelDOT' },
    { name: 'John Mastrobuono', org: 'DelDOT' },
    { name: 'Rich Taylor', org: 'DelDOT' },
    { name: 'Steven Peretiatko', org: 'DelDOT', role: 'Materials Technician' },
  ];

  /** Common spec numbers → letter description (uppercase, as printed).
      Sized pipe / inlet / curb / sidewalk lines live here so the letter
      preview does not depend on a second script file. */
  const SPEC_CATALOG_SIZES = {
    "#601010": {
      "desc": "REINFORCED CONCRETE PIPE, 12\" CLASS III",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601011": {
      "desc": "REINFORCED CONCRETE PIPE, 15\", CLASS III",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601012": {
      "desc": "REINFORCED CONCRETE PIPE, 18\", CLASS III",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601013": {
      "desc": "REINFORCED CONCRETE PIPE, 21\", CLASS III",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601014": {
      "desc": "REINFORCED CONCRETE PIPE, 24\", CLASS III",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601015": {
      "desc": "REINFORCED CONCRETE PIPE, 27\", CLASS III",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601016": {
      "desc": "REINFORCED CONCRETE PIPE, 30\", CLASS III",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601017": {
      "desc": "REINFORCED CONCRETE PIPE, 33\", CLASS III",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601018": {
      "desc": "REINFORCED CONCRETE PIPE, 36\", CLASS III",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601019": {
      "desc": "REINFORCED CONCRETE PIPE, 42\", CLASS III",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601020": {
      "desc": "REINFORCED CONCRETE PIPE, 48\", CLASS III",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601021": {
      "desc": "REINFORCED CONCRETE PIPE, 54\", CLASS III",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601022": {
      "desc": "REINFORCED CONCRETE PIPE, 60\", CLASS III",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601023": {
      "desc": "REINFORCED CONCRETE PIPE, 66\", CLASS III",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601024": {
      "desc": "REINFORCED CONCRETE PIPE, 72\", CLASS III",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601025": {
      "desc": "REINFORCED CONCRETE PIPE, 78\", CLASS III",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601026": {
      "desc": "REINFORCED CONCRETE PIPE, 84\", CLASS III",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601027": {
      "desc": "REINFORCED CONCRETE PIPE, 90\", CLASS III",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601028": {
      "desc": "REINFORCED CONCRETE PIPE, 96\", CLASS III",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601029": {
      "desc": "REINFORCED CONCRETE PIPE, 102\", CLASS III",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601030": {
      "desc": "REINFORCED CONCRETE PIPE, 108\", CLASS III",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601031": {
      "desc": "REINFORCED CONCRETE PIPE, 12\" CLASS IV",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601032": {
      "desc": "REINFORCED CONCRETE PIPE, 15\", CLASS IV",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601033": {
      "desc": "REINFORCED CONCRETE PIPE, 18\", CLASS IV",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601034": {
      "desc": "REINFORCED CONCRETE PIPE, 21\", CLASS IV",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601035": {
      "desc": "REINFORCED CONCRETE PIPE, 24\", CLASS IV",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601036": {
      "desc": "REINFORCED CONCRETE PIPE, 27\", CLASS IV",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601037": {
      "desc": "REINFORCED CONCRETE PIPE, 30\", CLASS IV",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601038": {
      "desc": "REINFORCED CONCRETE PIPE, 33\", CLASS IV",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601039": {
      "desc": "REINFORCED CONCRETE PIPE, 36\", CLASS IV",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601040": {
      "desc": "REINFORCED CONCRETE PIPE, 42\", CLASS IV",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601041": {
      "desc": "REINFORCED CONCRETE PIPE, 48\", CLASS IV",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601042": {
      "desc": "REINFORCED CONCRETE PIPE, 54\", CLASS IV",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601043": {
      "desc": "REINFORCED CONCRETE PIPE, 60\" CLASS IV",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601044": {
      "desc": "REINFORCED CONCRETE PIPE, 66\", CLASS IV",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601045": {
      "desc": "REINFORCED CONCRETE PIPE, 72\", CLASS IV",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601046": {
      "desc": "REINFORCED CONCRETE PIPE, 78\" CLASS IV",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601047": {
      "desc": "REINFORCED CONCRETE PIPE, 84\", CLASS IV",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601048": {
      "desc": "REINFORCED CONCRETE PIPE, 90\", CLASS IV",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601049": {
      "desc": "REINFORCED CONCRETE PIPE, 96\", CLASS IV",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601050": {
      "desc": "REINFORCED CONCRETE PIPE, 102\", CLASS IV",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601051": {
      "desc": "REINFORCED CONCRETE PIPE, 108\", CLASS IV",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601052": {
      "desc": "REINFORCED CONCRETE PIPE, 12\", CLASS V",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601053": {
      "desc": "REINFORCED CONCRETE PIPE, 15\", CLASS V",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601054": {
      "desc": "REINFORCED CONCRETE PIPE, 18\", CLASS V",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601055": {
      "desc": "REINFORCED CONCRETE PIPE, 21\", CLASS V",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601056": {
      "desc": "REINFORCED CONCRETE PIPE, 24\", CLASS V",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601057": {
      "desc": "REINFORCED CONCRETE PIPE, 27\", CLASS V",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601058": {
      "desc": "REINFORCED CONCRETE PIPE, 30\", CLASS V",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601059": {
      "desc": "REINFORCED CONCRETE PIPE, 33\", CLASS V",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601060": {
      "desc": "REINFORCED CONCRETE PIPE, 36\", CLASS V",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601061": {
      "desc": "REINFORCED CONCRETE PIPE, 42\", CLASS V",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601062": {
      "desc": "REINFORCED CONCRETE PIPE, 48\", CLASS V",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601063": {
      "desc": "REINFORCED CONCRETE PIPE, 54\", CLASS V",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601064": {
      "desc": "REINFORCED CONCRETE PIPE, 60\", CLASS V",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601065": {
      "desc": "REINFORCED CONCRETE PIPE, 66\", CLASS V",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601066": {
      "desc": "REINFORCED CONCRETE PIPE, 72\", CLASS V",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601067": {
      "desc": "REINFORCED CONCRETE PIPE, 78\", CLASS V",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601068": {
      "desc": "REINFORCED CONCRETE PIPE, 84\", CLASS V",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601069": {
      "desc": "REINFORCED CONCRETE PIPE, 90\", CLASS V",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601070": {
      "desc": "REINFORCED CONCRETE PIPE, 96\", CLASS V",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601071": {
      "desc": "REINFORCED CONCRETE PIPE, 102\", CLASS V",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601072": {
      "desc": "REINFORCED CONCRETE PIPE, 108\", CLASS V",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601100": {
      "desc": "REINFORCED CONCRETE ELLIPTICAL PIPE, 14\" X 23\", CLASS III",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601101": {
      "desc": "REINFORCED CONCRETE ELLIPTICAL PIPE, 19\" X 30\", CLASS III",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601102": {
      "desc": "REINFORCED CONCRETE ELLIPTICAL PIPE, 22\" X 34\", CLASS III",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601103": {
      "desc": "REINFORCED CONCRETE ELLIPTICAL PIPE, 24\"X 38\", CLASS III",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601104": {
      "desc": "REINFORCED CONCRETE ELLIPTICAL PIPE, 27\" X 42\", CLASS III",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601105": {
      "desc": "REINFORCED CONCRETE ELLIPTICAL PIPE, 29\" X 45\", CLASS III",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601106": {
      "desc": "REINFORCED CONCRETE ELLIPTICAL PIPE, 32\" X 49\", CLASS III",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601107": {
      "desc": "REINFORCED CONCRETE ELLIPTICAL PIPE, 34\" X 53\", CLASS III",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601108": {
      "desc": "REINFORCED CONCRETE ELLIPTICAL PIPE, 38\" X 60\", CLASS III",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601109": {
      "desc": "REINFORCED CONCRETE ELLIPTICAL PIPE, 43\" X 68\", CLASS III",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601110": {
      "desc": "REINFORCED CONCRETE ELLIPTICAL PIPE, 48\" X 76\", CLASS III",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601111": {
      "desc": "REINFORCED CONCRETE ELLIPTICAL PIPE, 53\" X 83\", CLASS III",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601112": {
      "desc": "REINFORCED CONCRETE ELLIPTICAL PIPE, 58\" X 91\", CLASS III",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601113": {
      "desc": "REINFORCED CONCRETE ELLIPTICAL PIPE, 63\" X 98\", CLASS III",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601114": {
      "desc": "REINFORCED CONCRETE ELLIPTICAL PIPE, 68\" X 106\", CLASS III",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601115": {
      "desc": "REINFORCED CONCRETE ELLIPTICAL PIPE, 14\" X 23\", CLASS IV",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601116": {
      "desc": "REINFORCED CONCRETE ELLIPTICAL PIPE, 19\" X 30\", CLASS IV",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601117": {
      "desc": "REINFORCED CONCRETE ELLIPTICAL PIPE, 22\" X 34\", CLASS IV",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601118": {
      "desc": "REINFORCED CONCRETE ELLIPTICAL PIPE, 24\" X 38\", CLASS IV",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601119": {
      "desc": "REINFORCED CONCRETE ELLIPTICAL PIPE, 27\" X 42\", CLASS IV",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601120": {
      "desc": "REINFORCED CONCRETE ELLIPTICAL PIPE, 29\" X 45\", CLASS IV",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601121": {
      "desc": "REINFORCED CONCRETE ELLIPTICAL PIPE, 32\" X 49\", CLASS IV",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601122": {
      "desc": "REINFORCED CONCRETE ELLIPTICAL PIPE, 34\"X53\", CLASS IV",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601123": {
      "desc": "REINFORCED CONCRETE ELLIPTICAL PIPE, 38\" X 60\", CLASS IV",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601124": {
      "desc": "REINFORCED CONCRETE ELLIPTICAL PIPE, 43\" X 68\", CLASS IV",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601125": {
      "desc": "REINFORCED CONCRETE ELLIPTICAL PIPE, 48\" X 76\", CLASS IV",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601126": {
      "desc": "REINFORCED CONCRETE ELLIPTICAL PIPE, 53\" X 83\", CLASS IV",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601127": {
      "desc": "REINFORCED CONCRETE ELLIPTICAL PIPE, 58\" X 91\", CLASS IV",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601128": {
      "desc": "REINFORCED CONCRETE ELLIPTICAL PIPE, 63\" X 98\", CLASS IV",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601129": {
      "desc": "REINFORCED CONCRETE ELLIPTICAL PIPE, 68\" X 106\", CLASS IV",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601130": {
      "desc": "REINFORCED CONCRETE ELLIPTICAL PIPE, 14\"X23\", CLASS V",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601131": {
      "desc": "REINFORCED CONCRETE ELLIPTICAL PIPE, 19\"X30\", CLASS V",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601132": {
      "desc": "REINFORCED CONCRETE ELLIPTICAL PIPE, 22\"X34\", CLASS V",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601133": {
      "desc": "REINFORCED CONCRETE ELLIPTICAL PIPE, 24\"X38\", CLASS V",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601134": {
      "desc": "REINFORCED CONCRETE ELLIPTICAL PIPE, 27\"X42\", CLASS V",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601135": {
      "desc": "REINFORCED CONCRETE ELLIPTICAL PIPE, 29\"X45\", CLASS V",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601136": {
      "desc": "REINFORCED CONCRETE ELLIPTICAL PIPE, 32\"X49\", CLASS V",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601137": {
      "desc": "REINFORCED CONCRETE ELLIPTICAL PIPE, 34\"X53\", CLASS V",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601138": {
      "desc": "REINFORCED CONCRETE ELLIPTICAL PIPE, 38\"X60\", CLASS V",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601139": {
      "desc": "REINFORCED CONCRETE ELLIPTICAL PIPE, 43\"X68\", CLASS V",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601140": {
      "desc": "REINFORCED CONCRETE FLARED END SECTION, 12\"",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601141": {
      "desc": "REINFORCED CONCRETE FLARED END SECTION, 15\"",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601142": {
      "desc": "REINFORCED CONCRETE FLARED END SECTION, 18\"",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601143": {
      "desc": "REINFORCED CONCRETE FLARED END SECTION, 21\"",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601144": {
      "desc": "REINFORCED CONCRETE FLARED END SECTION, 24\"",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601145": {
      "desc": "REINFORCED CONCRETE FLARED END SECTION, 27\"",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601146": {
      "desc": "REINFORCED CONCRETE FLARED END SECTION, 30\"",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601147": {
      "desc": "REINFORCED CONCRETE FLARED END SECTION, 33\"",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601148": {
      "desc": "REINFORCED CONCRETE FLARED END SECTION, 36\"",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601149": {
      "desc": "REINFORCED CONCRETE FLARED END SECTION, 42\"",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601150": {
      "desc": "REINFORCED CONCRETE FLARED END SECTION, 48\"",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601151": {
      "desc": "REINFORCED CONCRETE FLARED END SECTION, 54\"",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601152": {
      "desc": "REINFORCED CONCRETE FLARED END SECTION, 60\"",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601153": {
      "desc": "REINFORCED CONCRETE FLARED END SECTION, 66\"",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601154": {
      "desc": "REINFORCED CONCRETE FLARED END SECTION, 72\"",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601155": {
      "desc": "REINFORCED CONCRETE FLARED END SECTION, 78\"",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601156": {
      "desc": "REINFORCED CONCRETE FLARED END SECTION, 84\"",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601157": {
      "desc": "REINFORCED CONCRETE FLARED END SECTION, 90\"",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601158": {
      "desc": "REINFORCED CONCRETE FLARED END SECTION, 96\"",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601170": {
      "desc": "REINFORCED CONCRETE FLARED END SECTION, 14\" X 23\"",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601171": {
      "desc": "REINFORCED CONCRETE FLARED END SECTION, 19\" X 30\"",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601172": {
      "desc": "REINFORCED CONCRETE FLARED END SECTION, 22\" X 34\"",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601173": {
      "desc": "REINFORCED CONCRETE FLARED END SECTION, 24\"X38\"",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601174": {
      "desc": "REINFORCED CONCRETE FLARED END SECTION, 27\"X42\"",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601175": {
      "desc": "REINFORCED CONCRETE FLARED END SECTION, 29\"X45\"",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601176": {
      "desc": "REINFORCED CONCRETE FLARED END SECTION, 32\"X49\"",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601177": {
      "desc": "REINFORCED CONCRETE FLARED END SECTION, 34\"X53\"",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601178": {
      "desc": "REINFORCED CONCRETE FLARED END SECTION, 38\"X60\"",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601179": {
      "desc": "REINFORCED CONCRETE FLARED END SECTION, 43\"X68\"",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601180": {
      "desc": "REINFORCED CONCRETE FLARED END SECTION, 48\"X76\"",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601240": {
      "desc": "CORRUGATED POLYETHYLENE FLARED END SECTION, 12\"",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601241": {
      "desc": "CORRUGATED POLYETHYLENE FLARED END SECTION, 15\"",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601242": {
      "desc": "CORRUGATED POLYETHYLENE FLARED END SECTION, 18\"",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601243": {
      "desc": "CORRUGATED POLYETHYLENE FLARED END SECTION, 24\"",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601244": {
      "desc": "CORRUGATED POLYETHYLENE FLARED END SECTION, 30\"",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#601245": {
      "desc": "CORRUGATED POLYETHYLENE FLARED END SECTION, 36\"",
      "family": "rcp",
      "tags": [
        "RCP"
      ]
    },
    "#602000": {
      "desc": "DRAINAGE INLET, 17.625\" X 11.625\"",
      "family": "precast",
      "tags": [
        "Precast",
        "Drainage"
      ]
    },
    "#602001": {
      "desc": "DRAINAGE INLET, 24\" X 24\"",
      "family": "precast",
      "tags": [
        "Precast",
        "Drainage"
      ]
    },
    "#602002": {
      "desc": "DRAINAGE INLET, 34\" X 18\"",
      "family": "precast",
      "tags": [
        "Precast",
        "Drainage"
      ]
    },
    "#602003": {
      "desc": "DRAINAGE INLET, 34\" X 24\"",
      "family": "precast",
      "tags": [
        "Precast",
        "Drainage"
      ]
    },
    "#602004": {
      "desc": "DRAINAGE INLET, 48\" X 30\"",
      "family": "precast",
      "tags": [
        "Precast",
        "Drainage"
      ]
    },
    "#602005": {
      "desc": "DRAINAGE INLET, 48\" X 48\"",
      "family": "precast",
      "tags": [
        "Precast",
        "Drainage"
      ]
    },
    "#602006": {
      "desc": "DRAINAGE INLET, 66\" X 30\"",
      "family": "precast",
      "tags": [
        "Precast",
        "Drainage"
      ]
    },
    "#602007": {
      "desc": "DRAINAGE INLET, 66\" X 48\"",
      "family": "precast",
      "tags": [
        "Precast",
        "Drainage"
      ]
    },
    "#602008": {
      "desc": "DRAINAGE INLET, 66\" X 66\"",
      "family": "precast",
      "tags": [
        "Precast",
        "Drainage"
      ]
    },
    "#602009": {
      "desc": "DRAINAGE INLET, 72\" X 24\"",
      "family": "precast",
      "tags": [
        "Precast",
        "Drainage"
      ]
    },
    "#602010": {
      "desc": "DRAINAGE INLET, 72\" X 48\"",
      "family": "precast",
      "tags": [
        "Precast",
        "Drainage"
      ]
    },
    "#602011": {
      "desc": "DRAINAGE INLET, 72\" X 72\"",
      "family": "precast",
      "tags": [
        "Precast",
        "Drainage"
      ]
    },
    "#602012": {
      "desc": "DRAINAGE INLET, SPECIAL",
      "family": "precast",
      "tags": [
        "Precast",
        "Drainage"
      ]
    },
    "#602013": {
      "desc": "DRAINAGE INLET, SPECIAL",
      "family": "precast",
      "tags": [
        "Precast",
        "Drainage"
      ]
    },
    "#602030": {
      "desc": "MANHOLE, 48\" X 30\"",
      "family": "precast",
      "tags": [
        "Precast",
        "Drainage"
      ]
    },
    "#602031": {
      "desc": "MANHOLE, 48\" X 48\"",
      "family": "precast",
      "tags": [
        "Precast",
        "Drainage"
      ]
    },
    "#602032": {
      "desc": "MANHOLE, 66\" X 30\"",
      "family": "precast",
      "tags": [
        "Precast",
        "Drainage"
      ]
    },
    "#602033": {
      "desc": "MANHOLE, 66\" X 48\"",
      "family": "precast",
      "tags": [
        "Precast",
        "Drainage"
      ]
    },
    "#602034": {
      "desc": "MANHOLE, 66\" X 66\"",
      "family": "precast",
      "tags": [
        "Precast",
        "Drainage"
      ]
    },
    "#602035": {
      "desc": "MANHOLE, ROUND",
      "family": "precast",
      "tags": [
        "Precast",
        "Drainage"
      ]
    },
    "#602036": {
      "desc": "MANHOLE, SPECIAL",
      "family": "precast",
      "tags": [
        "Precast",
        "Drainage"
      ]
    },
    "#602037": {
      "desc": "MANHOLE, SPECIAL",
      "family": "precast",
      "tags": [
        "Precast",
        "Drainage"
      ]
    },
    "#602060": {
      "desc": "JUNCTION BOX, 48\" X 30\"",
      "family": "precast",
      "tags": [
        "Precast",
        "Drainage"
      ]
    },
    "#602061": {
      "desc": "JUNCTION BOX, 48\" X 48\"",
      "family": "precast",
      "tags": [
        "Precast",
        "Drainage"
      ]
    },
    "#602062": {
      "desc": "JUNCTION BOX, 66\" X 30\"",
      "family": "precast",
      "tags": [
        "Precast",
        "Drainage"
      ]
    },
    "#602063": {
      "desc": "JUNCTION BOX, 66\" X 48\"",
      "family": "precast",
      "tags": [
        "Precast",
        "Drainage"
      ]
    },
    "#602064": {
      "desc": "JUNCTION BOX, 66\" X 66\"",
      "family": "precast",
      "tags": [
        "Precast",
        "Drainage"
      ]
    },
    "#602065": {
      "desc": "JUNCTION BOX, SPECIAL",
      "family": "precast",
      "tags": [
        "Precast",
        "Drainage"
      ]
    },
    "#602066": {
      "desc": "JUNCTION BOX, SPECIAL",
      "family": "precast",
      "tags": [
        "Precast",
        "Drainage"
      ]
    },
    "#602100": {
      "desc": "DRAINAGE INLET GRATE(S)",
      "family": "castings",
      "tags": [
        "Drainage",
        "APL"
      ]
    },
    "#602101": {
      "desc": "DRAINAGE INLET FRAME(S)",
      "family": "castings",
      "tags": [
        "Drainage",
        "APL"
      ]
    },
    "#602102": {
      "desc": "MANHOLE COVER(S)",
      "family": "castings",
      "tags": [
        "Drainage",
        "APL"
      ]
    },
    "#602103": {
      "desc": "MAHOLE FRAME(S)",
      "family": "castings",
      "tags": [
        "Drainage",
        "APL"
      ]
    },
    "#602505": {
      "desc": "PERSONNEL SAFETY GRATE",
      "family": "castings",
      "tags": [
        "Drainage",
        "APL"
      ]
    },
    "#612001": {
      "desc": "PRECAST CONCRETE RIGID FRAME",
      "family": "castings",
      "tags": [
        "Drainage",
        "APL"
      ]
    },
    "#701010": {
      "desc": "PCC CURB, TYPE 1-2",
      "family": "pcc",
      "tags": [
        "Concrete"
      ]
    },
    "#701011": {
      "desc": "PCC CURB, TYPE 1-4",
      "family": "pcc",
      "tags": [
        "Concrete"
      ]
    },
    "#701012": {
      "desc": "PCC CURB, TYPE 1-6",
      "family": "pcc",
      "tags": [
        "Concrete"
      ]
    },
    "#701013": {
      "desc": "PCC CURB, TYPE 1-8",
      "family": "pcc",
      "tags": [
        "Concrete"
      ]
    },
    "#701014": {
      "desc": "PCC CURB, TYPE 2",
      "family": "pcc",
      "tags": [
        "Concrete"
      ]
    },
    "#701015": {
      "desc": "I.PCC CURB AND GUTTER, TYPE 1-2",
      "family": "pcc",
      "tags": [
        "Concrete"
      ]
    },
    "#701016": {
      "desc": "I.PCC CURB AND GUTTER, TYPE 1-4",
      "family": "pcc",
      "tags": [
        "Concrete"
      ]
    },
    "#701017": {
      "desc": "I.PCC CURB AND GUTTER, TYPE 1-6",
      "family": "pcc",
      "tags": [
        "Concrete"
      ]
    },
    "#701018": {
      "desc": "I.PCC CURB AND GUTTER, TYPE 1-8",
      "family": "pcc",
      "tags": [
        "Concrete"
      ]
    },
    "#701019": {
      "desc": "I.PCC CURB AND GUTTER, TYPE 2",
      "family": "pcc",
      "tags": [
        "Concrete"
      ]
    },
    "#701020": {
      "desc": "I.PCC CURB AND GUTTER, TYPE 3-2",
      "family": "pcc",
      "tags": [
        "Concrete"
      ]
    },
    "#701021": {
      "desc": "I.PCC CURB AND GUTTER, TYPE 3-4",
      "family": "pcc",
      "tags": [
        "Concrete"
      ]
    },
    "#701022": {
      "desc": "I.PCC CURB AND GUTTER, TYPE 3-6",
      "family": "pcc",
      "tags": [
        "Concrete"
      ]
    },
    "#701023": {
      "desc": "I.PCC CURB AND GUTTER, TYPE 3-8",
      "family": "pcc",
      "tags": [
        "Concrete"
      ]
    },
    "#701025": {
      "desc": "PCC CURB TYPE 2 MODIFIED",
      "family": "pcc",
      "tags": [
        "Concrete"
      ]
    },
    "#701026": {
      "desc": "PCC MONOLITHIC MEDIAN",
      "family": "pcc",
      "tags": [
        "Concrete"
      ]
    },
    "#701027": {
      "desc": "PCC CURB, TYPE 1-2 MODIFIED",
      "family": "pcc",
      "tags": [
        "Concrete"
      ]
    },
    "#701028": {
      "desc": "I.PCC CURB AND GUTTER, TYPE 1-4, MODIFIED",
      "family": "pcc",
      "tags": [
        "Concrete"
      ]
    },
    "#701029": {
      "desc": "I.PCC CURB AND GUTTER, TYPE 1-4, MODIFIED",
      "family": "pcc",
      "tags": [
        "Concrete"
      ]
    },
    "#701031": {
      "desc": "CURB OPENING, 2' OPENING",
      "family": "pcc",
      "tags": [
        "Concrete"
      ]
    },
    "#701032": {
      "desc": "CURB OPENING, 4' OPENING",
      "family": "pcc",
      "tags": [
        "Concrete"
      ]
    },
    "#701033": {
      "desc": "PCC CURB, TYPE 1-2, MEDIAN GUARDRAIL",
      "family": "pcc",
      "tags": [
        "Concrete"
      ]
    },
    "#701500": {
      "desc": "PCC CURB, TYPE 1, MODIFIED",
      "family": "pcc",
      "tags": [
        "Concrete"
      ]
    },
    "#701512": {
      "desc": "PCC CURB AND GUTTER, TYPE 1-4 MODIFIED",
      "family": "pcc",
      "tags": [
        "Concrete"
      ]
    },
    "#705001": {
      "desc": "PCC SIDEWALK, 4\"",
      "family": "pcc",
      "tags": [
        "Concrete"
      ]
    },
    "#705002": {
      "desc": "PCC SIDEWALK, 6\"",
      "family": "pcc",
      "tags": [
        "Concrete"
      ]
    },
    "#705005": {
      "desc": "PCC SIDEWALK, 8\"",
      "family": "pcc",
      "tags": [
        "Concrete"
      ]
    },
    "#705007": {
      "desc": "DETECTABLE WARNING SURFACE",
      "family": "apl-product",
      "tags": [
        "Concrete",
        "APL"
      ]
    },
    "#705008": {
      "desc": "PEDESTRIAN CONNECTION, TYPE 1",
      "family": "pcc",
      "tags": [
        "Concrete"
      ]
    },
    "#705009": {
      "desc": "PEDESTRIAN CONNECTION, TYPE 2, 3, AND/OR 4",
      "family": "pcc",
      "tags": [
        "Concrete"
      ]
    },
    "#705010": {
      "desc": "PEDESTRIAN CONNECTION, TYPE 5",
      "family": "pcc",
      "tags": [
        "Concrete"
      ]
    },
    "#705011": {
      "desc": "PEDESTRIAN CONNECTION",
      "family": "pcc",
      "tags": [
        "Concrete"
      ]
    },
    "#705509": {
      "desc": "PATTERNED PCC SIDEWALK, 4\"",
      "family": "pcc",
      "tags": [
        "Concrete"
      ]
    },
    "#705519": {
      "desc": "PATTERNED PCC SIDEWALK, 6\"",
      "family": "pcc",
      "tags": [
        "Concrete"
      ]
    },
    "#705521": {
      "desc": "PATTERNED PCC SIDEWALK, 8\"",
      "family": "pcc",
      "tags": [
        "Concrete"
      ]
    },
    "#710163": {
      "desc": "M.J. GATE VALVE, 3\" WITH C.I. BOX AND COVER",
      "family": "castings",
      "tags": [
        "Drainage",
        "APL"
      ]
    },
    "#710164": {
      "desc": "M.J. GATE VALVE, 4\" WITH C.I. BOX AND COVER",
      "family": "castings",
      "tags": [
        "Drainage",
        "APL"
      ]
    },
    "#710165": {
      "desc": "M.J. GATE VALVE, 6\" WITH C.I. BOX AND COVER",
      "family": "castings",
      "tags": [
        "Drainage",
        "APL"
      ]
    },
    "#710167": {
      "desc": "M.J. GATE VALVE, 8\" WITH C.I. BOX AND COVER",
      "family": "castings",
      "tags": [
        "Drainage",
        "APL"
      ]
    },
    "#710169": {
      "desc": "M.J. GATE VALVE, 10\" WITH C.I. BOX AND COVER",
      "family": "castings",
      "tags": [
        "Drainage",
        "APL"
      ]
    },
    "#710170": {
      "desc": "M.J. GATE VALVE, 12\" WITH C.I. BOX AND COVER",
      "family": "castings",
      "tags": [
        "Drainage",
        "APL"
      ]
    },
    "#710391": {
      "desc": "STEEL PIPE GATE VALVE, 4\" WITH C.J. BOX AND COVER",
      "family": "castings",
      "tags": [
        "Drainage",
        "APL"
      ]
    },
    "#710410": {
      "desc": "3/4\" CURB STOP, WITH C.I. COVER, 18\" X 36\"",
      "family": "castings",
      "tags": [
        "Drainage",
        "APL"
      ]
    },
    "#710411": {
      "desc": "CONCRETE METER BOX WITH C.I. COVER, 18\" X 36\"",
      "family": "castings",
      "tags": [
        "Drainage",
        "APL"
      ]
    },
    "#710490": {
      "desc": "PVC METER BOX WITH C.I. COVER, 18\" X 24\"",
      "family": "castings",
      "tags": [
        "Drainage",
        "APL"
      ]
    },
    "#830011": {
      "desc": "PROVIDE AND INSTALL FRAME AND LID FOR JUNCTION WELL, TYPE 1",
      "family": "castings",
      "tags": [
        "Drainage",
        "APL"
      ]
    },
    "#830012": {
      "desc": "PROVIDE AND INSTALL FRAME AND LID FOR JUNCTION WELL, TYPE 4",
      "family": "castings",
      "tags": [
        "Drainage",
        "APL"
      ]
    },
    "#830013": {
      "desc": "PROVIDE AND INSTALL FRAME AND LID FOR JUNCTION WELL, TYPE 5",
      "family": "castings",
      "tags": [
        "Drainage",
        "APL"
      ]
    },
    "#830015": {
      "desc": "PROVIDE AND INSTALL PRECAST POLYMER COVER FOR JUNCTION WELL, TYPE 7",
      "family": "castings",
      "tags": [
        "Drainage",
        "APL"
      ]
    },
    "#834500": {
      "desc": "ACCESS COVER FOR TRANSFORMER BASE",
      "family": "castings",
      "tags": [
        "Drainage",
        "APL"
      ]
    }
  };

  function sizeLetterCatalog() {
    const extra = (typeof SOS_SPEC_LETTER_DESCS !== 'undefined' && SOS_SPEC_LETTER_DESCS) ? SOS_SPEC_LETTER_DESCS : {};
    return Object.assign({}, SPEC_CATALOG_SIZES, extra);
  }

  const SPEC_CATALOG_CORE = {
    '#207021': { desc: 'STRUCTURAL BACKFILL, (BORROW TYPE C)', family: 'borrow', tags: ['Borrow'] },
    '#209001': { desc: 'BORROW, TYPE A', family: 'borrow', tags: ['Borrow'] },
    '#209002': { desc: 'BORROW, TYPE B', family: 'borrow', tags: ['Borrow'] },
    '#209004': { desc: 'BORROW, TYPE C', family: 'borrow', tags: ['Borrow'] },
    '#209006': { desc: 'BORROW, TYPE F', family: 'borrow', tags: ['Borrow'] },
    '#301001': { desc: 'GABC', family: 'aggregate', tags: ['GABC'] },
    '#301002': { desc: 'GABC, PATCHING', family: 'aggregate', tags: ['GABC'] },
    '#301003': { desc: 'GABC', family: 'aggregate', tags: ['GABC'] },
    '#301007': { desc: 'RECYCLED CONCRETE AGGREGATE', family: 'aggregate', tags: ['GABC'] },
    '#301008': { desc: 'RECYCLED ASPHALT PAVEMENT', family: 'aggregate', tags: ['RAP'] },
    '#302002': { desc: 'DELAWARE NO. 3 STONE', family: 'aggregate', tags: ['Stone'] },
    '#302005': { desc: 'DELAWARE NO. 57 STONE', family: 'aggregate', tags: ['Stone'] },
    '#401005': { desc: 'SUPERPAVE TYPE C, 9.5 mm, PG 64-22 (CARBONATE STONE)', family: 'hma-mix', tags: ['Asphalt'] },
    '#401014': { desc: 'SUPERPAVE TYPE B, PG 64-22', family: 'hma-mix', tags: ['Asphalt'] },
    '#401021': { desc: 'SUPERPAVE TYPE BCBC, PG 64-22', family: 'hma-mix', tags: ['Asphalt'] },
    '#401029': { desc: 'SUPERPAVE TYPE C, PG 64-22, PATCHING', family: 'hma-mix', tags: ['Asphalt'] },
    '#401030': { desc: 'SUPERPAVE TYPE B, PG 64-22, PATCHING', family: 'hma-mix', tags: ['Asphalt'] },
    '#401501': { desc: 'HMA ITEMS', family: 'tack', tags: ['Tack Coat', 'APL'] },
    '#401505': { desc: 'HIGH PERFORMANCE BITUMINOUS CONCRETE (9.5MM)', family: 'hma-mix', tags: ['Asphalt'] },
    '#401506': { desc: 'SPEED HUMP', family: 'hma-mix', tags: ['Asphalt'] },
    '#404001': { desc: 'BITUMINOUS CRACK/JOINT SEALING < THAN 3/4-INCH WIDE', family: 'crack-seal', tags: ['Crack Sealing', 'APL'] },
    '#504001': { desc: 'CRACK AND JOINT SEALING LESS THAN 3/4 INCH WIDE', family: 'crack-seal', tags: ['Crack Sealing'] },
    '#601011': { desc: 'REINFORCED CONCRETE PIPE, 15", CLASS III', family: 'rcp', tags: ['RCP'] },
    '#601012': { desc: 'REINFORCED CONCRETE PIPE, 18", CLASS III', family: 'rcp', tags: ['RCP'] },
    '#601014': { desc: 'REINFORCED CONCRETE PIPE, 24", CLASS III', family: 'rcp', tags: ['RCP'] },
    '#601016': { desc: 'REINFORCED CONCRETE PIPE, 30", CLASS III', family: 'rcp', tags: ['RCP'] },
    '#601142': { desc: 'REINFORCED CONCRETE FLARED END SECTION, 18"', family: 'rcp', tags: ['RCP'] },
    '#601146': { desc: 'REINFORCED CONCRETE FLARED END SECTION, 30"', family: 'rcp', tags: ['RCP'] },
    '#601031': { desc: 'REINFORCED CONCRETE PIPE, 12" CLASS IV', family: 'rcp', tags: ['RCP'] },
    '#601032': { desc: 'REINFORCED CONCRETE PIPE, 15", CLASS IV', family: 'rcp', tags: ['RCP'] },
    '#601033': { desc: 'REINFORCED CONCRETE PIPE, 18", CLASS IV', family: 'rcp', tags: ['RCP'] },
    '#601213': { desc: 'CORRUGATED POLYETHYLENE PIPE, TYPE C, 15"', family: 'hdpe', tags: ['Pipe', 'HDPE'] },
    '#601221': { desc: 'CORRUGATED POLYETHYLENE PIPE', family: 'hdpe', tags: ['Pipe', 'HDPE'] },
    '#602003': { desc: 'DRAINAGE INLET, 34" X 24"', family: 'precast', tags: ['Precast', 'Drainage'] },
    '#602004': { desc: 'DRAINAGE INLET, 48" X 30"', family: 'precast', tags: ['Precast', 'Drainage'] },
    '#602005': { desc: 'DRAINAGE INLET, 48" X 48"', family: 'precast', tags: ['Precast', 'Drainage'] },
    '#602010': { desc: 'DRAINAGE INLET, 72" X 48"', family: 'precast', tags: ['Precast', 'Drainage'] },
    '#602035': { desc: 'MANHOLE, ROUND', family: 'precast', tags: ['Precast', 'Drainage'] },
    '#602031': { desc: 'MANHOLE, 48" X 48"', family: 'precast', tags: ['Precast', 'Drainage'] },
    '#602100': { desc: 'DRAINAGE INLET GRATE(S)', family: 'castings', tags: ['Drainage', 'APL'] },
    '#602101': { desc: 'DRAINAGE INLET FRAME(S)', family: 'castings', tags: ['Drainage', 'APL'] },
    '#602130': { desc: 'ADJUSTING AND REPAIRING EXISTING DRAINAGE INLET', family: 'pcc', tags: ['Concrete'] },
    '#602131': { desc: 'ADJUSTING AND REPAIRING EXISTING DOUBLE DRAINAGE INLET', family: 'pcc', tags: ['Concrete'] },
    '#602132': { desc: 'ADJUSTING AND REPAIRING EXISTING MANHOLE', family: 'pcc', tags: ['Concrete'] },
    '#602133': { desc: 'REPAIRING EXISTING JUNCTION BOX', family: 'pcc', tags: ['Concrete'] },
    '#701011': { desc: 'PCC CURB, TYPE 1-4', family: 'pcc', tags: ['Concrete'] },
    '#701012': { desc: 'PCC CURB, TYPE 1-6', family: 'pcc', tags: ['Concrete'] },
    '#701013': { desc: 'PCC CURB, TYPE 1-8', family: 'pcc', tags: ['Concrete'] },
    '#701014': { desc: 'PCC CURB, TYPE 2', family: 'pcc', tags: ['Concrete'] },
    '#701023': { desc: 'I.PCC CURB AND GUTTER, TYPE 3-8', family: 'pcc', tags: ['Concrete'] },
    '#705001': { desc: 'PCC SIDEWALK, 4"', family: 'pcc', tags: ['Concrete'] },
    '#705002': { desc: 'PCC SIDEWALK, 6"', family: 'pcc', tags: ['Concrete'] },
    '#705007': { desc: 'DETECTABLE WARNING SURFACE', family: 'apl-product', tags: ['Concrete', 'APL'] },
    '#705008': { desc: 'PEDESTRIAN CONNECTION, TYPE 1', family: 'pcc', tags: ['Concrete'] },
    '#705009': { desc: 'PEDESTRIAN CONNECTION, TYPE 2, 3, AND/OR 4', family: 'pcc', tags: ['Concrete'] },
    '#705013': { desc: 'TRUNCATED DOME DETECTABLE WARNING SURFACE', family: 'apl-product', tags: ['Concrete', 'APL'] },
    '#707015': { desc: 'RIPRAP, R-4', family: 'riprap', tags: ['Riprap'] },
    '#707021': { desc: 'CHANNEL BED FILL (LIGHT)', family: 'aggregate', tags: ['Stone'] },
    '#708003': { desc: 'GEOTEXTILES, RIPRAP', family: 'geotextile', tags: ['Geotextile'] },
    '#709001': { desc: 'PERFORATED PIPE UNDERDRAINS, 6"', family: 'hdpe', tags: ['Pipe', 'HDPE'] },
    '#710030': { desc: 'PVC WATER MAIN, 8"', family: 'utility', tags: ['Pipe'] },
    '#710378': { desc: 'STEEL CASING PIPE, 18"', family: 'utility', tags: ['Pipe'] },
    '#710438': { desc: 'FIRE HYDRANTS', family: 'utility', tags: ['Pipe'] },
    '#710503': { desc: 'ADJUST GAS VALVE BOXES', family: 'pcc', tags: ['Concrete'] },
    '#711009': { desc: 'INSTALLING SANITARY SEWER, PVC, 8"', family: 'utility', tags: ['Pipe'] },
    '#711500': { desc: 'ADJUST AND REPAIR EXISTING SANITARY MANHOLE', family: 'pcc', tags: ['Concrete'] },
    '#711502': { desc: 'ADJUST AND REPAIR EXISTING SANITARY CLEANOUTS', family: 'pcc', tags: ['Concrete'] },
    '#817002': { desc: 'PERMANENT PAVEMENT STRIPING, SYMBOL/LEGEND, ALKYD-THERMOPLASTIC', family: 'striping', tags: ['APL'] },
    '#817042': { desc: 'PERMANENT PAVEMENT STRIPING, EPOXY RESIN PAINT, WHITE/YELLOW, 6"', family: 'striping', tags: ['APL'] },
    '#817560': { desc: 'STRAIGHT ARROW THERMOPLASTIC', family: 'striping', tags: ['APL'] },
    '#817561': { desc: 'RIGHT OR LEFT THERMOPLASTIC ARROW', family: 'striping', tags: ['APL'] },
    '#861001': { desc: 'PERMANENT PAVEMENT STRIPING, EPOXY RESIN PAINT, 6"', family: 'striping', tags: ['APL'] },
    '#862004': { desc: 'PERMANENT PAVEMENT STRIPING, ALKYD-THERMOPLASTIC, 12"', family: 'striping', tags: ['APL'] },
    '#862005': { desc: 'PERMANENT PAVEMENT STRIPING, ALKYD-THERMOPLASTIC, 16"', family: 'striping', tags: ['APL'] },
    '#862006': { desc: 'PERMANENT PAVEMENT STRIPING, ALKYD-THERMOPLASTIC, SYMBOL/LEGEND', family: 'striping', tags: ['APL'] },
    '#801000': { desc: 'MAINTENANCE OF TRAFFIC', family: 'ttc', tags: ['Traffic Control', 'APL'] },
    '#808002': { desc: 'PROVIDE/MAINTAIN TRUCK MOUNTED ATTENUATOR, T II', family: 'ttc', tags: ['Traffic Control', 'APL'] },
    '#810001': { desc: 'TEMPORARY WARNING SIGNS AND PLAQUES', family: 'ttc', tags: ['Signage', 'APL'] },
    '#813001': { desc: 'TEMPORARY BARRICADES, TYPE III', family: 'ttc', tags: ['Traffic Control', 'APL'] },
    '#818001': { desc: 'FLAT SHEET ALUMINUM SIGN PANEL, TYPE IV', family: 'signs', tags: ['Signage', 'APL'] },
    '#905001': { desc: 'SILT FENCE', family: 'erosion', tags: ['Erosion Control'] },
    '#905007': { desc: 'SUPER SILT FENCE', family: 'erosion', tags: ['Erosion Control'] },
    '#905004': { desc: 'INLET SEDIMENT CONTROL, DRAINAGE INLET', family: 'erosion', tags: ['Erosion Control'] },
    '#908001': { desc: 'TOPSOIL', family: 'topsoil', tags: ['Topsoil'] },
    '#908004': { desc: 'TOPSOIL, 6" DEPTH', family: 'topsoil', tags: ['Topsoil'] },
    '#908016': { desc: 'PERMANENT GRASS SEEDING, SUBDIVISION', family: 'seed', tags: ['Seed'] },
    '#908020': { desc: 'EROSION CONTROL BLANKET MULCH', family: 'apl-product', tags: ['Erosion Control', 'APL'] },
    '#908022': { desc: 'TURF REINFORCEMENT MATTING, TYPE 2', family: 'apl-product', tags: ['Erosion Control', 'APL'] },
  };
  const SPEC_CATALOG = Object.assign({}, sizeLetterCatalog(), SPEC_CATALOG_CORE);

  /**
   * Contractor spec mistakes seen on submissions.
   * Do not rewrite #301003 → #301001: the SOS Database lists 301003 as GABC (TON),
   * and issued letters keep 301003 for crusher run / crushed concrete.
   */
  const SPEC_CORRECTIONS = [
    {
      whenSpec: '#705013',
      whenDesc: /truncated dome|detectable warning/i,
      toSpec: '#705007',
      note: 'Form listed #705013; letter uses #705007 DETECTABLE WARNING SURFACE.',
    },
    {
      whenSpec: '#801000',
      whenDesc: /u-?channel|sign stand|plaque|hi-?pro|temporary (warning )?sign|warning sign|plastic sign|marion steel|franklin industries|mdi\b|farmington hills|plasticade|eastern metal/i,
      unlessDesc: /attenuator|barricade|drum|flagger/i,
      toSpec: '#810001',
      note: 'Form listed #801000 MOT; letter uses #810001 TEMPORARY WARNING SIGNS AND PLAQUES.',
    },
  ];

  /**
   * Known tack-coat APL producers. Location matters — Seaford Russell Standard
   * was rejected; Baltimore Russell Standard was approved.
   * `locations: null` means any location for that producer is treated as listed.
   */
  const TACK_COAT_APL = [
    { name: /asphalt emulsion industries/i, locations: null, label: 'Asphalt Emulsion Industries' },
    { name: /asphalt paving systems|\baps\b/i, locations: null, label: 'Asphalt Paving Systems' },
    { name: /russell standard/i, locations: [/baltimore/i, /wilmington/i], reject: [/seaford/i, /chambersburg/i], label: 'Russell Standard' },
    { name: /seaboard asphalt/i, locations: null, label: 'Seaboard Asphalt Products' },
    { name: /specialty emulsions/i, locations: null, label: 'Specialty Emulsions' },
    { name: /diamond materials/i, locations: [/wilmington/i], label: 'Diamond Materials' },
    { name: /gardner gibson/i, locations: null, label: 'Gardner Gibson' },
  ];

  const STRIPING_APL = [
    { name: /ennis[\s-]*fl[iy]nt/i, locations: null, label: 'Ennis Flint' },
    { name: /crown\s*tech/i, locations: null, label: 'Crown Technologies' },
    { name: /epoplex/i, locations: null, label: 'Epoplex' },
  ];

  const CRACK_SEAL_APL = [
    { name: /maxwell products/i, products: /elastoflex/i, label: 'Maxwell Products' },
    { name: /crafco/i, products: /roadsaver/i, label: 'Crafco' },
  ];

  const CURING_APL = [
    { name: /chemmasters/i, products: /silencure/i, label: 'ChemMasters' },
    { name: /w\.?\s*r\.?\s*meadows/i, products: /1600|white/i, label: 'W.R. Meadows' },
    { name: /kaufman|kauffman/i, label: 'Kaufman Products' },
  ];

  const ACTION_TEXT = {
    test: 'Must be tested and approved prior to use.',
    approved: 'Approved for use.',
    approvedBare: 'Approved.',
    mixDesigns: 'Approved. Only approved mix designs are approved for use.',
    mixOnFile: 'Approved; material sources and job mix formula are on file at the M&R Lab.',
    pccOnFile: 'Approved; material sources & admixture certifications on file at M&R Lab.',
    stockOnFile: 'Approved provided is shipped from state inspected stock. Test reports are on file at the M&R Lab.',
    visual: 'Approved: Conduct a visual inspection to ensure specification compliance.',
    seed: 'Approved provided seed conforms to the applicable table in the Standard Specifications, unless otherwise stipulated in the plans.',
    conforms: 'Approved provided material conforms to the requirements of the specifications.',
    utility: 'Approved provided material conforms to the utility owners specifications.',
    chooseApl: 'Approved. (choose a product from the APL)',
    pendingJmf: 'Not approved. (pending JMF approval)',
    expansionAashto: 'Approved provided Preformed Expansion Joint Material meets AASHTO M153, Type I, II, or IV.',
    hdpeM294: 'Approved provided pipe meets all requirements of AASHTO M294. Verify compliance through the AASHTO Product Evaluation & Audit Solutions.',
    hdpeM252: 'Approved provided pipe meets all requirements of AASHTO M252. Verify compliance through the AASHTO Product Evaluation & Audit Solutions.',
    nchrpSunset: 'Not Approved. Resubmit MASH Compliant temp sign stand listed on APL. (NCHRP 350 Devices were "sunset" on 1.1.2025)',
    apl: 'Approved for use. (on APL)',
    aplOn: 'Approved for use. (ON APL)',
    ttcInspect: 'Temporary Traffic control Devices will be inspected on-site by DelDOT or authorized representative.',
    oneSource: 'Only one source at a time may be used in a given area.',
    submitTack: 'Submit tack coat type (grade) and manufacturer.',
    submitCuring: 'Submit curing compound product name and manufacturer.',
    submitExpansion: 'Submit Preformed Expansion Material meeting AASHTO M153 Type I, II, or IV.',
    submitStriping: 'Submit manufacturer. (source listed is subcontractor)',
    notApproved: 'Not approved.',
  };

  function cloneContact(src, extra) {
    return Object.assign({ name: '', phone: '', org: 'Materials & Research' }, src || {}, extra || {});
  }

  function resolveContacts(lists) {
    const c = {
      sampling: cloneContact(CONTACTS.sampling),
      samplingNorth: cloneContact(CONTACTS.samplingNorth),
      samplingCanal: cloneContact(CONTACTS.samplingCanal),
      results: cloneContact(CONTACTS.results, { org: 'Materials & Research' }),
    };
    const ov = (lists && lists.contacts) || {};
    ['sampling', 'samplingNorth', 'samplingCanal', 'results'].forEach(k => {
      if (ov[k] && (ov[k].name || ov[k].phone)) c[k] = cloneContact(c[k], ov[k]);
    });
    const assignments = (lists && lists.ccAssignments) || CC_ASSIGNMENT_SEEDS;
    const res = assignments.find(a => a.role === 'results' && a.name);
    if (res) {
      c.results = cloneContact(c.results, { name: res.name, phone: res.phone || c.results.phone });
    }
    return c;
  }

  function samplerForDistrict(district, lists) {
    const c = resolveContacts(lists);
    const d = district || '';
    if (/canal/i.test(d)) return c.samplingCanal;
    if (/north/i.test(d)) return c.samplingNorth;
    return c.sampling;
  }

  function districtMatchesAssignment(assignment, district) {
    const wanted = (assignment && assignment.districts) || [];
    if (!wanted.length) return true;
    const d = String(district || '');
    if (!d.trim()) return false;
    return wanted.some((w) => {
      const key = String(w || '').toLowerCase();
      if (key === 'canal') return /canal/i.test(d);
      if (key === 'north') return /north/i.test(d);
      if (key === 'south') return /south/i.test(d) && !/north/i.test(d);
      return new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(d);
    });
  }

  function assignmentMatchesItems(assignment, items, project) {
    if (!assignment || !assignment.name) return false;
    if (!districtMatchesAssignment(assignment, project && project.district)) return false;
    if (assignment.always) return true;
    const families = new Set((items || []).map(it => it && it.family).filter(Boolean));
    const wanted = assignment.groups || assignment.families || [];
    for (const w of wanted) {
      if (families.has(w)) return true;
      const g = CC_MATERIAL_GROUPS.find(x => x.id === w);
      if (g && g.families.some(f => families.has(f))) return true;
    }
    return false;
  }

  function soilStoneOnLetter(items) {
    const g = CC_MATERIAL_GROUPS.find(x => x.id === 'soil-stone');
    const fams = g ? g.families : ['borrow', 'aggregate'];
    return (items || []).some(it => fams.includes(it && it.family));
  }

  function testCoordinationNotes(district, lists) {
    const sampler = samplerForDistrict(district, lists);
    const results = resolveContacts(lists).results;
    return (
      `Contact ${sampler.name}, ${sampler.org || 'Materials & Research'} at ${sampler.phone} at least ten (10) working days prior to shipment, from the source, for coordination of sampling. ` +
      `Contact ${results.name} at ${results.phone}, for test results.`
    );
  }

  function stockNotesForAction(action, district, lists) {
    if (action === 'test') return ACTION_TEXT.test + '\n' + testCoordinationNotes(district, lists);
    if (action === 'approved') return ACTION_TEXT.approved;
    if (action === 'not-approved') return ACTION_TEXT.notApproved;
    if (action === 'apl') return ACTION_TEXT.apl;
    if (action === 'on-file') return ACTION_TEXT.stockOnFile;
    if (action === 'visual') return ACTION_TEXT.visual;
    if (action === 'submit') return ACTION_TEXT.submitTack;
    return '';
  }

  function actionNotePresets(district, lists) {
    const T = ACTION_TEXT;
    return [
      { id: 'test', action: 'test', label: 'Must be tested — contact sampler / results', notes: stockNotesForAction('test', district, lists) },
      { id: 'approved', action: 'approved', label: 'Approved for use', notes: T.approved },
      { id: 'mix', action: 'approved', label: 'Approved mix designs only', notes: T.mixDesigns },
      { id: 'stock', action: 'on-file', label: 'State inspected stock (on file)', notes: T.stockOnFile },
      { id: 'visual', action: 'visual', label: 'Visual inspection', notes: T.visual },
      { id: 'apl', action: 'apl', label: 'Approved for use (on APL)', notes: T.apl },
      { id: 'conforms', action: 'approved', label: 'Conforms to specifications', notes: T.conforms },
      { id: 'choose', action: 'apl', label: 'Choose a product from the APL', notes: T.chooseApl },
      { id: 'not', action: 'not-approved', label: 'Not approved', notes: T.notApproved },
      { id: 'jmf', action: 'not-approved', label: 'Not approved (pending JMF)', notes: T.pendingJmf },
    ];
  }

  const PRESET_TAGS = [
    'Borrow', 'GABC', 'Stone', 'Asphalt', 'Concrete', 'RCP', 'Precast',
    'Drainage', 'Electrical', 'Conduit', 'Wire', 'Geotextile', 'Seed',
    'Erosion Control', 'Signage', 'Sign Posts', 'Traffic Control', 'Rebar',
    'Topsoil', 'Riprap', 'Pipe', 'Ductile Iron', 'HDPE', 'PVC', 'Tack Coat', 'APL',
  ];

  const SOURCE_SEEDS = [
    { name: 'River Asphalt', loc: 'Dagsboro DE', addr: '30548 Thorogoods Rd', phone: '(302) 934-0881', tags: ['Asphalt', 'GABC', 'Stone'] },
    { name: 'River Asphalt', loc: 'Delmar DE', addr: '36393 Sussex Highway', phone: '(302) 907-6400', tags: ['Asphalt'] },
    { name: 'Vulcan Materials', loc: 'Salisbury MD', addr: '1002 Parsons Rd', phone: '(410) 742-4645', tags: ['GABC', 'Stone', 'Riprap'] },
    { name: 'Vulcan Materials', loc: 'Seaford DE', addr: '26056 River Rd', phone: '', tags: ['GABC', 'Stone', 'Riprap'] },
    { name: 'Russell Standard', loc: 'Baltimore MD', addr: '3450 Asiatic Ave', phone: '', tags: ['Tack Coat', 'Asphalt', 'APL'] },
    { name: 'Russell Standard', loc: 'Seaford DE', addr: '', phone: '', tags: ['Tack Coat', 'Asphalt'] },
    { name: 'Russell Standard', loc: 'Wilmington DE', addr: '', phone: '', tags: ['Tack Coat', 'Asphalt', 'APL'] },
    { name: 'Russell Standard', loc: 'Chambersburg PA', addr: '', phone: '', tags: ['Tack Coat', 'Asphalt'] },
    { name: 'Seaboard Asphalt Products', loc: 'Baltimore MD', addr: '', phone: '', tags: ['Tack Coat', 'Asphalt', 'APL'] },
    { name: 'Specialty Emulsions', loc: 'York PA', addr: '', phone: '', tags: ['Tack Coat', 'Asphalt', 'APL'] },
    { name: 'Ennis Flint', loc: 'Greensboro NC', addr: '4161 Piedmont Pkwy Suite 370', phone: '', tags: ['APL'] },
    { name: 'Maxwell Products', loc: 'Salt Lake City UT', addr: '650 South Delong St', phone: '1-800-266-2090', tags: ['Crack Sealing', 'APL'] },
    { name: 'Crafco', loc: 'Chandler AZ', addr: '', phone: '', tags: ['Crack Sealing', 'APL'] },
    { name: 'Allan Myers', loc: 'Elk Mills MD', addr: '896 Elk Mill Road', phone: '', tags: ['GABC', 'Stone', 'Asphalt'] },
    { name: 'Allan Myers', loc: 'Wilmington DE', addr: '1230 Railcar Ave', phone: '(302) 922-5166', tags: ['GABC', 'Stone', 'Asphalt'] },
    { name: 'Allan Myers', loc: 'Dover DE', addr: '', phone: '', tags: ['Asphalt', 'GABC'] },
    { name: 'Allan Myers', loc: 'Georgetown DE', addr: '', phone: '', tags: ['Asphalt', 'GABC', 'Stone'] },
    { name: 'Martin Marietta', loc: 'North East MD', addr: '233 Stevenson Rd', phone: '(410) 287-8177', tags: ['GABC', 'Stone'] },
    { name: 'Tri County Materials', loc: 'Dover DE', addr: '3700 South Bay Road', phone: '(302) 677-0156', tags: ['GABC', 'Stone', 'Asphalt'] },
    { name: 'Diamond Materials', loc: 'Wilmington DE', addr: '924 S Heald Street', phone: '(302) 922-5166', tags: ['Asphalt', 'GABC'] },
    { name: 'Contractors Materials', loc: 'Middletown DE', addr: '1133 Marl Pit RD', phone: '(302) 378-0421', tags: ['Borrow', 'GABC', 'Topsoil'] },
    { name: 'Contractors Materials', loc: 'Wilmington DE', addr: '925 S Heald St', phone: '', tags: ['GABC', 'Borrow', 'Topsoil'] },
    { name: 'Rinker Materials', loc: 'Middletown DE', addr: '800 Industrial Drive', phone: '(302) 378-8920', tags: ['RCP', 'Precast'] },
    { name: 'Gillespie Precast', loc: 'Chestertown MD', addr: '102 Brickyard Rd', phone: '(410) 778-0940', tags: ['Precast', 'Drainage'] },
    { name: 'Heritage Concrete', loc: 'Wilmington DE', addr: '', phone: '', tags: ['Concrete'] },
    { name: 'Heritage Concrete', loc: 'Cheswold DE', addr: '376 Holly Oak Lane', phone: '', tags: ['Concrete'] },
    { name: 'Bear Concrete', loc: 'Newark DE', addr: '595 Walther Rd', phone: '(302) 834-3333', tags: ['Concrete'] },
    { name: 'Atlantic Concrete', loc: 'Milford DE', addr: 'PO Box 321', phone: '(302) 422-8017', tags: ['Concrete'] },
    { name: 'Atlantic Concrete', loc: 'Lewes DE', addr: '', phone: '', tags: ['Concrete'] },
    { name: 'Atlantic Concrete Co', loc: 'Cheswold DE', addr: '161 Twin Oaks', phone: '', tags: ['Concrete'] },
    { name: 'Farmington Hotmix', loc: 'Farmington DE', addr: '', phone: '', tags: ['Asphalt'] },
    { name: 'Christiana Materials', loc: 'Newark DE', addr: '', phone: '', tags: ['Asphalt'] },
    { name: 'Asphalt Emulsion Industries', loc: 'Dumfries VA', addr: '', phone: '', tags: ['Tack Coat', 'Asphalt', 'APL'] },
    { name: 'Asphalt Paving Systems', loc: 'Hammonton NJ', addr: '', phone: '', tags: ['Tack Coat', 'Asphalt', 'APL'] },
    { name: 'ChemMasters', loc: 'Madison OH', addr: '300 Edwards St', phone: '', tags: ['Concrete', 'Curing Compound', 'APL'] },
    { name: 'W.R. Meadows', loc: 'Hampshire IL', addr: '', phone: '', tags: ['Concrete', 'Curing Compound', 'Expansion', 'APL'] },
    { name: 'Hanover Architectural Products', loc: 'Hanover PA', addr: '', phone: '', tags: ['Concrete', 'APL'] },
    { name: 'Nitterhouse Masonry Products', loc: 'Chambersburg PA', addr: '', phone: '', tags: ['Concrete', 'APL'] },
    { name: 'J&K Foam Fabricating', loc: 'Pottstown PA', addr: '', phone: '', tags: ['Concrete', 'Expansion'] },
    { name: 'JD Russell', loc: 'Hamburg NY', addr: '', phone: '', tags: ['Concrete', 'Expansion'] },
    { name: 'ADS', loc: 'Logan Township NJ', addr: '', phone: '', tags: ['Pipe', 'HDPE'] },
    { name: 'East Jordan Iron Works', loc: 'Middletown DE', addr: '', phone: '', tags: ['Drainage', 'APL'] },
    { name: 'Neenah Foundry', loc: 'Neenah WI', addr: '2121 Brooks Ave', phone: '(920) 725-7000', tags: ['Drainage'] },
    { name: 'Kent Sand & Gravel', loc: 'Massey MD', addr: '13505 Alexander Road', phone: '(410) 928-5522', tags: ['Borrow', 'Stone'] },
    { name: 'Porter Sand & Gravel', loc: 'Harrington DE', addr: '640 Sandbox Rd', phone: '', tags: ['Borrow', 'Topsoil'] },
    { name: 'Melvin Joseph', loc: 'Georgetown DE', addr: '25136 DuPont Blvd', phone: '', tags: ['Borrow', 'Topsoil'] },
    { name: 'Clark Seeds', loc: 'Clayton DE', addr: '', phone: '', tags: ['Seed'] },
    { name: 'North American Green', loc: 'Poseyville IN', addr: '', phone: '', tags: ['Erosion Control', 'APL'] },
    { name: 'TrafFix Devices', loc: 'San Clemente CA', addr: '220 Calle Pintoresco', phone: '(949) 361-5663', tags: ['Traffic Control', 'APL'] },
    { name: 'Hanes Geo Components', loc: 'Winston Salem NC', addr: '815 Buxton St', phone: '(888) 239-4539', tags: ['Geotextile', 'Erosion Control'] },
  ];

  function looksLikeSourceFragment(s) {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    if (!t) return true;
    if (/^(or|and|alt|alternate)$/i.test(t)) return true;
    if (/,\s*[A-Z]{2}(\s+\d{5})?\b/.test(t)) return true;
    if (/\(\s*stockpile\s*\)/i.test(t) && !/gabc|pcc|crushed|concrete|stone|asphalt/i.test(t)) return true;
    if (/^[A-Z][A-Za-z .&'-]{2,40},\s*[A-Z][A-Za-z .]+$/i.test(t)) return true;
    const company = /\b(materials|excavating|aggregates?|paving|asphalt|concrete co\.?|inc\.?|llc|ltd|company|contractors?)\b/i.test(t);
    const payItem = /^(gabc|pcc|rap|hma|superpave|graded aggregate|crushed (concrete|stone)|type\s*[a-z0-9-]+|patching|borrow|topsoil|millings|pipe|curb|sidewalk)/i.test(t)
      || /\b(gabc|pcc curb|sidewalk|superpave|tack coat|class\s*[abc])\b/i.test(t);
    if (company && !payItem) return true;
    return false;
  }

  function collapseSpecDescParts(parts) {
    const cleaned = [];
    parts.forEach((part) => {
      const t = String(part || '').replace(/\s+/g, ' ').trim();
      if (!t) return;
      const key = t.toLowerCase();
      const idx = cleaned.findIndex(x => x.toLowerCase() === key
        || x.toLowerCase().includes(key)
        || key.includes(x.toLowerCase()));
      if (idx < 0) {
        cleaned.push(t);
        return;
      }
      if (t.length > cleaned[idx].length) cleaned[idx] = t;
    });
    return cleaned;
  }

  function cleanSpecLibraryDesc(desc, extraSourceNames) {
    let raw = String(desc || '').replace(/\u00a0/g, ' ').trim();
    if (!raw) return '';
    (extraSourceNames || []).concat((SOURCE_SEEDS || []).map(s => s.name)).forEach((name) => {
      const n = String(name || '').trim();
      if (n.length < 4) return;
      const re = new RegExp('\\s*[-–—,|]\\s*' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b[^|]{0,80}', 'ig');
      raw = raw.replace(re, '');
    });
    const chunks = raw.split(/\s*\|\s*|\n+/);
    const parts = [];
    chunks.forEach((chunk) => {
      let t = String(chunk || '')
        .replace(/^[\s\-–—\[\]•#]+/, '')
        .replace(/[\s\[\]•]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      t = t.replace(/^#?\d{6}\s*[-–—:]?\s*/i, '').trim();
      if (!t || /^or$/i.test(t)) return;
      const dashed = t.match(/^(.*?)[\s]*[-–—][\s]+(.+)$/);
      if (dashed && looksLikeSourceFragment(dashed[2])) t = dashed[1].trim();
      else if (looksLikeSourceFragment(t)) return;
      if (t) parts.push(t);
    });
    return collapseSpecDescParts(parts).join(', ');
  }

  function preferSpecDesc(current, incoming) {
    const a = cleanSpecLibraryDesc(current);
    const b = cleanSpecLibraryDesc(incoming);
    if (!a) return b;
    if (!b) return a;
    if (a.toLowerCase() === b.toLowerCase()) return a;
    if (b.toLowerCase().includes(a.toLowerCase()) && b.length > a.length) return b;
    if (a.toLowerCase().includes(b.toLowerCase())) return a;
    return a.length >= b.length ? a : b;
  }

  return {
    APL_URL,
    APL_FOOTNOTE,
    CONTACTS,
    STANDARD_CC,
    CC_MATERIAL_GROUPS,
    CC_DISTRICTS,
    CC_ASSIGNMENT_SEEDS,
    CC_LIBRARY_SEEDS,
    normalizeCcName,
    filterRetiredCcPeople,
    ccPersonSortName,
    sortCcPeople,
    cleanSpecLibraryDesc,
    preferSpecDesc,
    resolveContacts,
    samplerForDistrict,
    assignmentMatchesItems,
    soilStoneOnLetter,
    SPEC_CATALOG,
    SPEC_CORRECTIONS,
    TACK_COAT_APL,
    STRIPING_APL,
    CRACK_SEAL_APL,
    CURING_APL,
    ACTION_TEXT,
    stockNotesForAction,
    actionNotePresets,
    PRESET_TAGS,
    SOURCE_SEEDS,
    testCoordinationNotes,
  };
});
