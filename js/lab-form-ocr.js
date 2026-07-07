/**
 * Free client-side OCR for DelDOT Field Control Sheets and aggregate sieve cards.
 * Uses Tesseract.js — no API keys, runs entirely in the browser.
 */
(function (global) {
  'use strict';

  const TESSERACT_VER = '5.1.1';
  const CDN = `https://cdn.jsdelivr.net/npm/tesseract.js@${TESSERACT_VER}/dist`;

  let tessScriptPromise = null;
  let workerInitPromise = null;
  let workerInstance = null;

  const CORE_BASE = `https://cdn.jsdelivr.net/npm/tesseract.js-core@${TESSERACT_VER}`;
  const CORE_SIMD = `${CORE_BASE}/tesseract-core-simd-lstm.wasm.js`;
  const CORE_STD = `${CORE_BASE}/tesseract-core-lstm.wasm.js`;

  function wrapOcrError(e, fallback) {
    if (e instanceof Error && e.message) return e;
    const msg = typeof e === 'string' ? e
      : (e && (e.message || e.error || e.reason || e.status)) || fallback || 'OCR engine failed';
    return new Error(String(msg));
  }

  function rejectBadMime(mediaType, fileName) {
    const m = (mediaType || '').toLowerCase();
    const name = (fileName || '').toLowerCase();
    if (m.includes('pdf') || name.endsWith('.pdf')) {
      return new Error('PDF files cannot be scanned — photograph the form or export as JPG/PNG');
    }
    if (/heic|heif/.test(m) || /\.heic$|\.heif$/.test(name)) {
      return new Error('HEIC/iPhone photos are not supported — use Camera → Formats → Most Compatible (JPEG)');
    }
    if (m && !m.startsWith('image/')) {
      return new Error('Please upload a photo (JPG or PNG), not ' + (m.split('/')[1] || 'that file type'));
    }
    return null;
  }

  function normalizeText(s) {
    return (s || '').toUpperCase().replace(/[^A-Z0-9./#\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function wordCenterX(w) {
    return (w.bbox.x0 + w.bbox.x1) / 2;
  }

  function wordMidY(w) {
    return (w.bbox.y0 + w.bbox.y1) / 2;
  }

  function parseOcrNumber(text) {
    if (!text) return null;
    const raw = String(text).trim();
    if (/^(NP|NV|N\/P|N\.P\.)$/i.test(raw)) return null;
    let t = raw.replace(/[oO]/g, '0').replace(/[lI|]/g, '1').replace(/,/g, '.');
    t = t.replace(/(\d)\s+(\d)/g, '$1.$2');
    const m = t.match(/-?\d+\.?\d*/);
    if (!m) return null;
    const n = parseFloat(m[0]);
    return Number.isFinite(n) ? n : null;
  }

  function parseBottleNo(text) {
    if (!text) return '';
    const t = String(text).trim();
    if (/^[A-Za-z]\d?$/.test(t)) return t.toUpperCase();
    const m = t.match(/\b([A-Za-z])\d?\b/);
    return m ? m[1].toUpperCase() : t.slice(0, 4);
  }

  function isBottleToken(text) {
    return /^[A-Za-z]\d?$/.test(String(text || '').trim());
  }

  function loadTesseractScript() {
    if (global.Tesseract) return Promise.resolve(global.Tesseract);
    if (tessScriptPromise) return tessScriptPromise;
    tessScriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `${CDN}/tesseract.min.js`;
      s.async = true;
      s.onload = () => resolve(global.Tesseract);
      s.onerror = () => reject(new Error('Could not load OCR engine (Tesseract.js)'));
      document.head.appendChild(s);
    });
    return tessScriptPromise;
  }

  async function createOcrWorker(onProgress) {
    const Tesseract = await loadTesseractScript();
    const logger = (m) => {
      if (!onProgress || !m) return;
      if (m.status === 'recognizing text' && m.progress != null) {
        onProgress(`⏳ Reading text… ${Math.round(m.progress * 100)}%`, m.progress);
      } else if (m.status) {
        onProgress(`⏳ ${m.status}…`, m.progress || 0);
      }
    };
    const configs = [
      { corePath: CORE_SIMD, label: 'SIMD' },
      { corePath: CORE_STD, label: 'standard' },
    ];
    let lastErr;
    for (const cfg of configs) {
      try {
        const worker = await Tesseract.createWorker('eng', 1, {
          workerPath: `${CDN}/worker.min.js`,
          langPath: 'https://tessdata.projectnaptha.com/4.0.0',
          corePath: cfg.corePath,
          logger,
        });
        await worker.setParameters({
          tessedit_pageseg_mode: '3', // fully automatic — better for full form photos
          preserve_interword_spaces: '1',
        });
        return worker;
      } catch (e) {
        lastErr = e;
        console.warn('OCR worker init failed (' + cfg.label + '):', e);
      }
    }
    throw wrapOcrError(lastErr, 'Could not start OCR engine — check network connection and refresh');
  }

  async function getWorker(onProgress) {
    if (workerInstance) return workerInstance;
    if (!workerInitPromise) {
      workerInitPromise = createOcrWorker(onProgress)
        .then((w) => {
          workerInstance = w;
          return w;
        })
        .catch((e) => {
          workerInitPromise = null;
          workerInstance = null;
          throw wrapOcrError(e);
        });
    }
    try {
      return await workerInitPromise;
    } catch (e) {
      workerInitPromise = null;
      workerInstance = null;
      throw wrapOcrError(e);
    }
  }

  function collectOcrWords(data) {
    const out = [];
    const seen = new Set();
    function add(w) {
      if (!w || !w.text || !String(w.text).trim()) return;
      if (w.confidence != null && w.confidence < 0) return; // keep low-confidence handwriting
      const text = String(w.text).trim();
      const key = text + '|' + (w.bbox?.x0 || 0) + '|' + (w.bbox?.y0 || 0);
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        text,
        conf: w.confidence || 0,
        bbox: w.bbox || { x0: 0, y0: 0, x1: 0, y1: 0 },
      });
    }
    (data.words || []).forEach(add);
    if (out.length) return out;
    (data.lines || []).forEach((line) => (line.words || []).forEach(add));
    if (out.length) return out;
    (data.blocks || []).forEach((block) => {
      (block.paragraphs || []).forEach((p) => {
        (p.lines || []).forEach((line) => (line.words || []).forEach(add));
      });
    });
    return out;
  }

  async function preprocessImage(b64, mediaType, fileName) {
    const bad = rejectBadMime(mediaType, fileName);
    if (bad) throw bad;
    if (!b64 || !String(b64).trim()) {
      throw new Error('No image data — upload a photo of the lab form first');
    }
    const outMime = /png/i.test(mediaType || '') ? 'image/png' : 'image/jpeg';
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        if (!img.width || !img.height) {
          reject(new Error('Image is empty — try another photo'));
          return;
        }
        const scale = Math.min(2.5, Math.max(1, 1800 / Math.max(img.width, img.height)));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const id = ctx.getImageData(0, 0, w, h);
        const d = id.data;
        for (let i = 0; i < d.length; i += 4) {
          const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          const boosted = Math.max(0, Math.min(255, (gray - 128) * 1.35 + 128));
          d[i] = d[i + 1] = d[i + 2] = boosted;
        }
        ctx.putImageData(id, 0, 0);
        resolve(canvas.toDataURL(outMime, 0.92));
      };
      img.onerror = () => reject(new Error('Could not read this image — use JPG or PNG (not PDF or HEIC)'));
      img.src = `data:${mediaType || 'image/jpeg'};base64,${b64}`;
    });
  }

  async function ocrImage(b64, mediaType, onProgress, fileName) {
    const worker = await getWorker(onProgress);
    if (onProgress) onProgress('⏳ Preparing image…', 0);
    const prepped = await preprocessImage(b64, mediaType, fileName);
    if (onProgress) onProgress('⏳ Scanning form…', 0.05);
    let data;
    try {
      ({ data } = await worker.recognize(prepped));
    } catch (e) {
      throw wrapOcrError(e, 'OCR scan failed — try a clearer, flatter photo');
    }
    const words = collectOcrWords(data || {});
    return {
      words,
      text: (data && data.text) || '',
      width: (data && data.imageWidth) || 1,
      height: (data && data.imageHeight) || 1,
    };
  }

  function testNoVariants(testNo) {
    const raw = String(testNo || '').trim();
    const digits = raw.replace(/\D/g, '');
    const variants = new Set([raw, raw.toUpperCase(), digits]);
    if (digits) {
      variants.add('FY' + digits);
      variants.add('FY-' + digits);
      variants.add('FY ' + digits);
      variants.add('CY' + digits);
      variants.add('CY-' + digits);
    }
    return [...variants].filter(Boolean);
  }

  function findTestColumn(words, testNo, width, height) {
    const variants = testNoVariants(testNo);
    // Search header band AND full page for test number (handwriting may not land in top 18%)
    const bands = [
      words.filter((w) => wordMidY(w) < height * 0.22),
      words,
    ];
    let best = null;
    let bestScore = 0;
    for (const band of bands) {
      for (const w of band) {
        const norm = normalizeText(w.text).replace(/\s/g, '');
        for (const v of variants) {
          const vn = v.replace(/\s/g, '').toUpperCase();
          if (!vn) continue;
          let score = 0;
          if (norm === vn) score = 100;
          else if (norm.includes(vn) || vn.includes(norm)) score = 70;
          else if (digitsMatch(norm, vn)) score = 55;
          if (score > bestScore) {
            bestScore = score;
            best = w;
          }
        }
      }
      if (best) break;
    }
    if (best) return wordCenterX(best);

    // Fallback: column with the most numeric tokens (often the filled-in sample column)
    const cols = clusterNumericColumns(words, width);
    if (cols.length) return cols[cols.length - 1].centerX;

    return width * 0.72;
  }

  function clusterNumericColumns(words, width) {
    const nums = words
      .map((w) => ({ x: wordCenterX(w), n: parseOcrNumber(w.text) }))
      .filter((p) => p.n != null);
    if (!nums.length) return [];
    nums.sort((a, b) => a.x - b.x);
    const gap = Math.max(40, width * 0.07);
    const cols = [];
    let cur = { centerX: nums[0].x, count: 1, sumX: nums[0].x };
    for (let i = 1; i < nums.length; i++) {
      if (nums[i].x - nums[i - 1].x > gap) {
        cols.push({ centerX: cur.sumX / cur.count, count: cur.count });
        cur = { centerX: nums[i].x, count: 1, sumX: nums[i].x };
      } else {
        cur.count++;
        cur.sumX += nums[i].x;
      }
    }
    cols.push({ centerX: cur.sumX / cur.count, count: cur.count });
    return cols.sort((a, b) => a.centerX - b.centerX);
  }

  function digitsMatch(a, b) {
    const da = a.replace(/\D/g, '');
    const db = b.replace(/\D/g, '');
    return da.length >= 3 && db.length >= 3 && da === db;
  }

  function columnTolerance(width) {
    return Math.max(55, width * 0.12);
  }

  function wordsInColumn(words, colX, tol) {
    return words
      .filter((w) => Math.abs(wordCenterX(w) - colX) <= tol)
      .sort((a, b) => wordMidY(a) - wordMidY(b));
  }

  function findLabelY(words, pattern, width) {
    const left = words.filter((w) => w.bbox.x1 < width * 0.38);
    for (const w of left) {
      if (pattern.test(normalizeText(w.text))) return wordMidY(w);
    }
    return null;
  }

  function sliceByY(words, y0, y1) {
    return words.filter((w) => {
      const y = wordMidY(w);
      return y >= y0 && y < y1;
    });
  }

  function assignLimitBlock(slice) {
    const bottles = [];
    const nums = [];
    for (const w of slice) {
      if (isBottleToken(w.text)) bottles.push(parseBottleNo(w.text));
      else {
        const n = parseOcrNumber(w.text);
        if (n != null) nums.push(n);
      }
    }
    return {
      bottle_no: bottles[0] || '',
      wt_wet_soil_bottle: nums[0] ?? null,
      wt_dry_bottle: nums[1] ?? null,
      wt_bottle: nums[2] ?? null,
      blows: nums[3] ?? null,
    };
  }

  function assignPlasticBlock(slice) {
    const bottles = [];
    const nums = [];
    for (const w of slice) {
      if (isBottleToken(w.text)) bottles.push(parseBottleNo(w.text));
      else {
        const n = parseOcrNumber(w.text);
        if (n != null) nums.push(n);
      }
    }
    return {
      bottle_no: bottles[0] || '',
      wt_wet_soil_bottle: nums[0] ?? null,
      wt_dry_bottle: nums[1] ?? null,
      wt_bottle: nums[2] ?? null,
    };
  }

  function assignOrganicBlock(slice) {
    const bottles = [];
    const nums = [];
    for (const w of slice) {
      if (isBottleToken(w.text) || /^\d{1,2}$/.test(w.text)) bottles.push(parseBottleNo(w.text));
      else {
        const n = parseOcrNumber(w.text);
        if (n != null) nums.push(n);
      }
    }
    return {
      bottle_no: bottles[0] || '',
      wt_wet_soil_bottle: nums[0] ?? null,
      wt_dry_bottle: nums[1] ?? null,
      wt_bottle: nums[2] ?? null,
    };
  }

  function parseAtterbergFromColumn(colWords, allWords, width, height) {
    const yLL = findLabelY(allWords, /LIQUID|\bLL\b/, width) ?? height * 0.18;
    const yPL = findLabelY(allWords, /PLASTIC|\bPL\b/, width) ?? height * 0.32;
    const yOrg = findLabelY(allWords, /ORGANIC/, width) ?? height * 0.44;
    const ySieve = findLabelY(allWords, /SIEVE|50\.8|2\s*\(/, width) ?? height * 0.52;

    const llSlice = sliceByY(colWords, yLL - 5, yPL);
    const plSlice = sliceByY(colWords, yPL - 5, yOrg);
    const orgSlice = sliceByY(colWords, yOrg - 5, ySieve);

    const ll = assignLimitBlock(llSlice);
    if (ll.blows == null && ll.wt_bottle != null) {
      // blows may be last number only in LL block
      const nums = llSlice.map((w) => parseOcrNumber(w.text)).filter((n) => n != null);
      if (nums.length >= 4) ll.blows = nums[3];
    }

    const totalCandidates = colWords
      .filter((w) => wordMidY(w) < ySieve)
      .map((w) => parseOcrNumber(w.text))
      .filter((n) => n != null && n >= 500 && n <= 2500);

    return {
      total_sample_wt: totalCandidates.length ? totalCandidates[totalCandidates.length - 1] : null,
      liquid_limit: {
        bottle_no: ll.bottle_no,
        wt_wet_soil_bottle: ll.wt_wet_soil_bottle,
        wt_dry_bottle: ll.wt_dry_bottle,
        wt_bottle: ll.wt_bottle,
        blows: ll.blows,
      },
      plastic_limit: assignPlasticBlock(plSlice),
      organic: assignOrganicBlock(orgSlice),
    };
  }

  function valueNearRow(colWords, rowY, band) {
    const half = band || 28;
    const slice = colWords.filter((w) => Math.abs(wordMidY(w) - rowY) <= half);
    for (const w of slice) {
      const n = parseOcrNumber(w.text);
      if (n != null) return n;
    }
    return null;
  }

  function parseSieveFromColumn(colWords, allWords, width, height) {
    const rowDefs = [
      { key: 'total', patterns: [/TOTAL.*SAMPLE|WT.*TOTAL|SAMPLE.*WT/i], range: [800, 2200] },
      { key: '2in', patterns: [/2\s*[\(\"]|50\.8|2\s*IN/i] },
      { key: '1in', patterns: [/1\s*[\(\"]|25\.4|1\s*IN/i] },
      { key: '0.375in', patterns: [/3\s*\/\s*8|9\.52|0\.375/i] },
      { key: 'no4', patterns: [/NO\.?\s*4|#\s*4|4\.76/i] },
      { key: 'no10', patterns: [/NO\.?\s*10|#\s*10|2\.00/i] },
      { key: 'wash', patterns: [/WASH/i], range: [80, 250] },
      { key: 'no40', patterns: [/NO\.?\s*40|#\s*40|0\.42/i] },
      { key: 'no200', patterns: [/NO\.?\s*200|#\s*200|0\.074/i] },
    ];

    const ySieve = findLabelY(allWords, /SIEVE|50\.8|2\s*\(/, width) ?? height * 0.52;
    const sieveCol = colWords.filter((w) => wordMidY(w) >= ySieve - 20);

    const result = {
      total_sample_wt: null,
      wash_sample_wt: null,
      sieves: { '2in': 0, '1in': 0, '0.375in': 0, no4: 0, no10: 0, no40: 0, no200: 0 },
    };

    const used = new Set();
    for (const def of rowDefs) {
      let rowY = null;
      for (const pat of def.patterns) {
        rowY = findLabelY(allWords, pat, width);
        if (rowY != null) break;
      }
      let val = rowY != null ? valueNearRow(sieveCol, rowY, 32) : null;

      if (val == null) {
        // Positional fallback: grab next unused numeric in sieve column
        for (const w of sieveCol) {
          if (used.has(w)) continue;
          const n = parseOcrNumber(w.text);
          if (n == null) continue;
          if (def.range && (n < def.range[0] || n > def.range[1])) continue;
          val = n;
          used.add(w);
          break;
        }
      }

      if (val == null) continue;
      if (def.key === 'total') result.total_sample_wt = val;
      else if (def.key === 'wash') result.wash_sample_wt = val;
      else result.sieves[def.key] = val;
    }

    return result;
  }

  function mergePreferNonNull(primary, fallback) {
    if (!fallback) return primary;
    const out = { ...primary };
    if (!out.total_sample_wt && fallback.total_sample_wt) out.total_sample_wt = fallback.total_sample_wt;
    if (!out.wash_sample_wt && fallback.wash_sample_wt) out.wash_sample_wt = fallback.wash_sample_wt;
    ['liquid_limit', 'plastic_limit', 'organic'].forEach((k) => {
      out[k] = out[k] || {};
      const fb = fallback[k] || {};
      Object.keys(fb).forEach((f) => {
        if ((out[k][f] == null || out[k][f] === '') && fb[f] != null && fb[f] !== '') out[k][f] = fb[f];
      });
    });
    out.sieves = { ...(fallback.sieves || {}), ...(out.sieves || {}) };
    Object.keys(out.sieves).forEach((k) => {
      if (!out.sieves[k] && fallback.sieves && fallback.sieves[k]) out.sieves[k] = fallback.sieves[k];
    });
    return out;
  }

  /** Count meaningful fields read — mirrors what Claude prompts expected. */
  function scoreFieldControlSheet(parsed) {
    if (!parsed) return 0;
    let score = 0;
    const total = parseFloat(parsed.total_sample_wt);
    if (total >= 500 && total <= 2500) score += 3;
    else if (total > 0) score += 1;
    const wash = parseFloat(parsed.wash_sample_wt);
    if (wash >= 50 && wash <= 300) score += 1;
    const ll = parsed.liquid_limit || {};
    const pl = parsed.plastic_limit || {};
    if (ll.wt_wet_soil_bottle || ll.wt_dry_bottle || ll.bottle_no) score += 1;
    if (pl.wt_wet_soil_bottle || pl.wt_dry_bottle || pl.bottle_no) score += 1;
    const sv = parsed.sieves || {};
    Object.values(sv).forEach((v) => { if (v != null && parseFloat(v) > 0) score += 0.5; });
    return Math.round(score * 2) / 2;
  }

  /** Positional fallback when row labels are not detected — uses column number stack. */
  function parseFromColumnNumbers(colWords) {
    const items = colWords
      .map((w) => ({ y: wordMidY(w), n: parseOcrNumber(w.text), raw: w.text }))
      .filter((p) => p.n != null)
      .sort((a, b) => a.y - b.y);

    const total = items.find((p) => p.n >= 800 && p.n <= 2200)?.n ?? null;
    const wash  = items.find((p) => p.n >= 70 && p.n <= 280)?.n ?? null;

    const sieveKeys = ['2in', '1in', '0.375in', 'no4', 'no10', 'no40', 'no200'];
    const sieves = {};
    sieveKeys.forEach((k) => { sieves[k] = 0; });

    const mid = items.filter((p) => p.n > 0 && p.n < 800 && p !== items.find((x) => x.n === wash));
    // Assign increasing sieve cumulatives in vertical order (skip wash-sized values)
    const sieveVals = mid
      .filter((p) => !(wash && Math.abs(p.n - wash) < 0.5))
      .map((p) => p.n);
    sieveKeys.forEach((k, i) => {
      if (sieveVals[i] != null) sieves[k] = sieveVals[i];
    });

    const bottles = colWords
      .filter((w) => isBottleToken(w.text))
      .sort((a, b) => wordMidY(a) - wordMidY(b))
      .map((w) => parseBottleNo(w.text));

    const topNums = items.filter((p) => p.y < (items[items.length - 1]?.y || 0) * 0.45).map((p) => p.n);

    return {
      total_sample_wt: total,
      wash_sample_wt: wash,
      liquid_limit: {
        bottle_no: bottles[0] || '',
        wt_wet_soil_bottle: topNums[0] ?? null,
        wt_dry_bottle: topNums[1] ?? null,
        wt_bottle: topNums[2] ?? null,
        blows: topNums[3] ?? null,
      },
      plastic_limit: {
        bottle_no: bottles[1] || '',
        wt_wet_soil_bottle: topNums[4] ?? null,
        wt_dry_bottle: topNums[5] ?? null,
        wt_bottle: topNums[6] ?? null,
      },
      organic: {
        bottle_no: bottles[2] || '',
        wt_wet_soil_bottle: topNums[7] ?? null,
        wt_dry_bottle: topNums[8] ?? null,
        wt_bottle: topNums[9] ?? null,
      },
      sieves,
    };
  }

  function mergeSoilResults(atterberg, sieve) {
    return {
      total_sample_wt: sieve.total_sample_wt || atterberg.total_sample_wt,
      wash_sample_wt: sieve.wash_sample_wt,
      liquid_limit: atterberg.liquid_limit,
      plastic_limit: atterberg.plastic_limit,
      organic: atterberg.organic,
      sieves: sieve.sieves,
    };
  }

  async function readFieldControlSheet(b64, mediaType, testNo, onProgress, fileName) {
    const { words, width, height } = await ocrImage(b64, mediaType, onProgress, fileName);
    if (!words.length) {
      throw new Error('No text detected — use a flat, well-lit photo of the full form');
    }
    if (onProgress) onProgress('⏳ Parsing Atterberg values…', 0.9);
    const colX = findTestColumn(words, testNo, width, height);
    const tol = columnTolerance(width);
    const colWords = wordsInColumn(words, colX, tol);
    const atterberg = parseAtterbergFromColumn(colWords, words, width, height);
    if (onProgress) onProgress('⏳ Parsing sieve weights…', 0.95);
    const sieve = parseSieveFromColumn(colWords, words, width, height);
    let parsed = mergeSoilResults(atterberg, sieve);

    // Fallback: positional column parse when label matching found little
    if (scoreFieldControlSheet(parsed) < 3) {
      const fallback = parseFromColumnNumbers(colWords.length ? colWords : words);
      parsed = mergePreferNonNull(parsed, fallback);
    }
    return parsed;
  }

  function labelPatternsForKey(key, label) {
    const esc = (label || key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [new RegExp(esc, 'i')];
    const map = {
      pan: [/PAN/i, /TOTAL/i],
      in2: [/2\s*("|IN)|50\.?8/i],
      in1: [/1\s*("|IN)|25\.?4/i],
      in38: [/3\s*\/\s*8|9\.?52/i],
      no4: [/NO\.?\s*4|#\s*4/i],
      no10: [/NO\.?\s*10|#\s*10/i],
      no40: [/NO\.?\s*40|#\s*40/i],
      no200: [/NO\.?\s*200|#\s*200/i],
    };
    if (map[key]) return map[key];
    return patterns;
  }

  function findNumberNearLabel(words, labelWord) {
    const ly = wordMidY(labelWord);
    const lx = labelWord.bbox.x1;
    const candidates = words
      .filter((w) => {
        if (w === labelWord) return false;
        const n = parseOcrNumber(w.text);
        if (n == null) return false;
        const dy = Math.abs(wordMidY(w) - ly);
        const right = w.bbox.x0 >= lx - 10;
        return dy < 40 && right;
      })
      .sort((a, b) => a.bbox.x0 - b.bbox.x0);
    return candidates.length ? parseOcrNumber(candidates[0].text) : null;
  }

  async function readAggregateSieveCard(b64, mediaType, sieveKeys, sieveLabels, onProgress, fileName) {
    const { words, text } = await ocrImage(b64, mediaType, onProgress, fileName);
    if (onProgress) onProgress('⏳ Parsing sieve card…', 0.92);

    const result = { total_sample_wt: null, pan_weight: null, sieves: {}, sieve_data: {} };
    const labels = sieveLabels || {};

    for (const key of sieveKeys || []) {
      const pats = labelPatternsForKey(key, labels[key] || key);
      let labelWord = null;
      for (const pat of pats) {
        labelWord = words.find((w) => pat.test(normalizeText(w.text)) || pat.test(w.text));
        if (labelWord) break;
      }
      let val = labelWord ? findNumberNearLabel(words, labelWord) : null;
      if (val == null && labels[key]) {
        const re = new RegExp(labels[key].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[:\\-]?\\s*([\\d.]+)', 'i');
        const m = text.match(re);
        if (m) val = parseFloat(m[1]);
      }
      if (val != null) {
        result.sieves[key] = val;
        result.sieve_data[key] = val;
      }
    }

    const panWord = words.find((w) => /PAN/i.test(normalizeText(w.text)));
    let pan = panWord ? findNumberNearLabel(words, panWord) : null;
    if (pan == null) {
      const m = text.match(/PAN\s*[:=\-]?\s*([\d.]+)/i);
      if (m) pan = parseFloat(m[1]);
    }
    if (pan == null) {
      const nums = words.map((w) => parseOcrNumber(w.text)).filter((n) => n != null && n > 100);
      pan = nums.length ? Math.max(...nums) : null;
    }
    result.pan_weight = pan;
    result.total_sample_wt = pan;
    return result;
  }

  global.LabFormOCR = {
    readFieldControlSheet,
    readAggregateSieveCard,
    scoreFieldControlSheet,
    _ocrImage: ocrImage,
  };
})(typeof window !== 'undefined' ? window : globalThis);
