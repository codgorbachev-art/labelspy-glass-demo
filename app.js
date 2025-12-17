/* LabelSpy — Glass UI Demo
   Static + GitHub Pages friendly.

   Features:
   - OCR (Tesseract.js) in browser + optional Cloud OCR endpoint (e.g., Yandex Cloud Function proxy)
   - E-code lookup via local JSON (data/e_additives_ru.json)
   - Heuristic allergens / "hidden sugars" detection
   - Traffic light for sugar/fat/salt per 100g
   - Local history (localStorage)
*/

(() => {
  'use strict';

  // ---------- DOM helpers
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // Required IDs (kept for backward compatibility)
  const fileInput = $('#fileInput');
  const dropZone = $('#dropZone');
  const imgPreview = $('#imgPreview');
  const imgPlaceholder = $('#imgPlaceholder');

  const btnOcr = $('#btnOcr');
  const btnUseSample = $('#btnUseSample');
  const ocrLang = $('#ocrLang');
  const ocrStatus = $('#ocrStatus');
  const ocrBar = $('#ocrBar');
  const ocrPct = $('#ocrPct');

  const textInput = $('#textInput');
  const btnAnalyze = $('#btnAnalyze');
  const btnClear = $('#btnClear');

  const results = $('#results');
  const ecodesTable = $('#ecodesTable');
  const ecodesFilter = $('#ecodesFilter');

  const allergensBlock = $('#allergensBlock');
  const compositionSnippet = $('#compositionSnippet');

  const nutrSugar = $('#nutrSugar');
  const nutrFat = $('#nutrFat');
  const nutrSalt = $('#nutrSalt');
  const btnRecalc = $('#btnRecalc');

  const tlSugar = $('#tlSugar');
  const tlFat = $('#tlFat');
  const tlSalt = $('#tlSalt');

  const overallVerdict = $('#overallVerdict');
  const overallTitle = $('#overallTitle');
  const overallBody = $('#overallBody');

  const metricEcodes = $('#metricEcodes');
  const metricAllergens = $('#metricAllergens');
  const metricSugars = $('#metricSugars');

  const btnShareCard = $('#btnShareCard');
  const btnSaveToHistory = $('#btnSaveToHistory');

  const historyBlock = $('#historyBlock');
  const btnClearHistory = $('#btnClearHistory');

  const aboutDialog = $('#aboutDialog');
  const btnOpenAbout = $('#btnOpenAbout');
  const githubLink = $('#githubLink');

  const shareCanvas = $('#shareCanvas');
  const toastRoot = $('#toastRoot');

  // New UI controls
  const cloudEndpointWrap = $('#cloudEndpointWrap');
  const cloudEndpoint = $('#cloudEndpoint');
  const optEnhanceOcr = $('#optEnhanceOcr');

  // ---------- Constants & state
  const APP = {
    name: 'LabelSpy',
    version: 'glass-ui-v1'
  };

  const HISTORY_KEY = 'labelspy.history.v2';
  const SETTINGS_KEY = 'labelspy.settings.v2';

  const THRESHOLDS = {
    sugar: { lowMax: 5.0, highMin: 22.5 },  // UK traffic light (commonly referenced)
    fat:   { lowMax: 3.0, highMin: 17.5 },  // UK traffic light (commonly referenced)
    salt:  { lowMax: 0.3, highMin: 1.75 },  // demo: example value (Rospotrebnadzor article mentions 1.75)
  };

  const allergens = [
    { key: 'Молоко', patterns: ['молоко', 'молочн', 'сыворот', 'лактоз', 'казеин', 'сливк', 'йогурт', 'сыр', 'масло слив'] },
    { key: 'Глютен/злаки', patterns: ['пшениц', 'рож', 'ячмен', 'овес', 'овёс', 'мука', 'клейковин', 'глютен', 'манка'] },
    { key: 'Соя', patterns: ['соя', 'соев', 'lecithin', 'лецитин соев'] },
    { key: 'Яйцо', patterns: ['яйц', 'альбумин', 'меланж'] },
    { key: 'Орехи', patterns: ['орех', 'миндаль', 'фундук', 'грецк', 'кешью', 'пекан', 'фисташ', 'арахис'] },
    { key: 'Рыба', patterns: ['рыб', 'икр', 'анчоус'] },
    { key: 'Морепродукты', patterns: ['кревет', 'краб', 'мид', 'устриц', 'моллюск'] },
    { key: 'Сельдерей', patterns: ['сельдер'] },
    { key: 'Горчица', patterns: ['горчиц'] },
    { key: 'Кунжут', patterns: ['кунжут'] },
  ];

  const hiddenSugars = [
    'сироп', 'глюкоз', 'фруктоз', 'мальтоз', 'декстроз', 'лактоз', 'мёд', 'мед',
    'паток', 'инвертн', 'сахароз', 'концентрат сока', 'juice concentrate'
  ];

  const msgLike = [
    'глутамат', 'e621', 'e-621', 'гидролизат', 'yeast extract', 'дрожжев', 'экстракт дрожж'
  ];

  // internal state
  let eDb = {};
  let lastImageDataUrl = '';
  let lastAnalysis = null;
  let lastEcodeRows = []; // for filtering
  let ocrEngine = 'local'; // 'local' | 'cloud'

  // OCR worker
  let worker = null;
  let workerReady = false;

  // ---------- Utilities
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function escapeHtml(s) {
    return String(s || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function normalizeSpaces(s) {
    return String(s || '')
      .replace(/\u00A0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\s+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function parseNumberRu(s) {
    if (s == null) return null;
    const t = String(s).trim().replace(',', '.').replace(/[^0-9.]/g, '');
    if (!t) return null;
    const v = Number(t);
    return Number.isFinite(v) ? v : null;
  }

  function setOcrProgress(progress01, status) {
    const p = Math.max(0, Math.min(1, progress01));
    const pct = Math.round(p * 100);
    ocrBar.style.width = pct + '%';
    ocrPct.textContent = pct + '%';
    const bar = ocrBar.closest('.progress__bar');
    if (bar) bar.setAttribute('aria-valuenow', String(pct));
    if (status) ocrStatus.textContent = 'OCR: ' + status;
  }

  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }

  function toast({ title, body, timeout = 4200 } = {}) {
    if (!toastRoot) return;

    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `
      <div>
        <div class="toast__title">${escapeHtml(title || 'Готово')}</div>
        ${body ? `<div class="toast__body">${escapeHtml(body)}</div>` : ''}
      </div>
      <button class="toast__close" type="button" aria-label="Закрыть">✕</button>
    `;
    const close = () => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
      setTimeout(() => el.remove(), 180);
    };
    el.querySelector('.toast__close').addEventListener('click', close);
    toastRoot.appendChild(el);
    if (timeout) setTimeout(close, timeout);
  }

  function animateInt(el, to) {
    const from = Number(el.textContent) || 0;
    const start = performance.now();
    const dur = 450;

    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const v = Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3)));
      el.textContent = String(v);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function setVerdict(kind, title, body) {
    overallTitle.textContent = title || '—';
    overallBody.textContent = body || '—';

    overallVerdict.classList.remove('verdict--ok', 'verdict--warn', 'verdict--danger', 'verdict--unknown');
    overallVerdict.classList.add(kind || 'verdict--unknown');
  }

  function setPill(el, kind, label) {
    el.classList.remove('pill--unknown', 'pill--low', 'pill--mid', 'pill--high');
    el.classList.add(kind || 'pill--unknown');
    el.textContent = label || '—';
  }

  // ---------- Settings
  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);

      if (s.ocrEngine === 'cloud' || s.ocrEngine === 'local') ocrEngine = s.ocrEngine;
      if (typeof s.cloudEndpoint === 'string') cloudEndpoint.value = s.cloudEndpoint;
      if (typeof s.enhanceOcr === 'boolean') optEnhanceOcr.checked = s.enhanceOcr;
      if (typeof s.ocrLang === 'string') ocrLang.value = s.ocrLang;
    } catch { /* ignore */ }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        ocrEngine,
        cloudEndpoint: cloudEndpoint.value || '',
        enhanceOcr: !!optEnhanceOcr.checked,
        ocrLang: ocrLang.value || 'rus+eng'
      }));
    } catch { /* ignore */ }
  }

  function applyOcrEngineUi() {
    $$('.seg__btn[data-ocr-engine]').forEach((b) => {
      const active = b.dataset.ocrEngine === ocrEngine;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    const showCloud = (ocrEngine === 'cloud');
    if (cloudEndpointWrap) cloudEndpointWrap.style.display = showCloud ? '' : 'none';
  }

  // ---------- File / image helpers
  function toDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onerror = () => reject(new Error('FileReader error'));
      r.onload = () => resolve(String(r.result));
      r.readAsDataURL(file);
    });
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image load error'));
      img.src = dataUrl;
    });
  }

  async function downscaleToJpeg(dataUrl, { maxSide = 1600, quality = 0.88 } = {}) {
    const img = await loadImage(dataUrl);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const scale = Math.min(1, maxSide / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, cw, ch);

    return canvas.toDataURL('image/jpeg', quality);
  }

  function dataUrlToBase64(dataUrl) {
    // data:image/jpeg;base64,AAAA...
    const m = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
    if (!m) return { mime: 'image/jpeg', b64: '' };
    return { mime: m[1], b64: m[2] };
  }

  // ---------- OCR preprocessing (Canvas)
  function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

  function otsuThreshold(gray) {
    const hist = new Array(256).fill(0);
    for (let i = 0; i < gray.length; i++) hist[gray[i]]++;

    const total = gray.length;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];

    let sumB = 0;
    let wB = 0;
    let varMax = -1;
    let thr = 127;

    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (wB === 0) continue;
      const wF = total - wB;
      if (wF === 0) break;

      sumB += t * hist[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;

      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > varMax) { varMax = between; thr = t; }
    }
    return thr;
  }

  async function preprocessForOcr(dataUrl, { scale = 2.2, contrast = 1.35, forceInvert = null } = {}) {
    const img = await loadImage(dataUrl);

    const canvas = document.createElement('canvas');
    canvas.width = Math.round((img.naturalWidth || img.width) * scale);
    canvas.height = Math.round((img.naturalHeight || img.height) * scale);

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = id.data;

    const gray = new Uint8Array(canvas.width * canvas.height);
    let gi = 0;

    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      let v = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
      v = clamp255((v - 128) * contrast + 128);
      gray[gi++] = v;
    }

    const thr = otsuThreshold(gray);
    let whiteCount = 0;

    for (let p = 0; p < gray.length; p++) {
      const v = gray[p] > thr ? 255 : 0;
      gray[p] = v;
      if (v === 255) whiteCount++;
    }

    const whiteRatio = whiteCount / gray.length;
    const autoInvert = whiteRatio < 0.45;
    const needInvert = (forceInvert === null) ? autoInvert : !!forceInvert;

    gi = 0;
    for (let i = 0; i < d.length; i += 4) {
      let v = gray[gi++];
      if (needInvert) v = 255 - v;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }

    ctx.putImageData(id, 0, 0);
    return canvas;
  }

  function scoreOcrText(t) {
    const s = normalizeSpaces(t || '');
    if (!s) return -1e9;
    const cyr = (s.match(/[А-Яа-яЁё]/g) || []).length;
    const lat = (s.match(/[A-Za-z]/g) || []).length;
    const bad = (s.match(/[^0-9A-Za-zА-Яа-яЁё\s.,:;()%+\-–—/]/g) || []).length;
    return cyr * 2 - lat * 0.2 - bad * 6;
  }

  // ---------- OCR engines
  async function ensureWorker(lang) {
    if (!window.Tesseract) {
      throw new Error('Tesseract.js не загрузился (проверьте сеть / CDN).');
    }
    if (worker && workerReady) {
      // If language changed, re-init
      if (worker.__lang === lang) return worker;
      try { await worker.terminate(); } catch { /* ignore */ }
      worker = null;
      workerReady = false;
    }

    setOcrProgress(0.02, 'подготовка');
    worker = await window.Tesseract.createWorker({
      logger: (m) => {
        if (m?.progress != null) setOcrProgress(m.progress, String(m.status || 'обработка'));
      }
    });

    await worker.loadLanguage(lang);
    await worker.initialize(lang);

    // Tuning: single uniform block often works for ingredients
    try {
      await worker.setParameters({
        tessedit_pageseg_mode: '6',
        preserve_interword_spaces: '1'
      });
    } catch { /* ignore */ }

    worker.__lang = lang;
    workerReady = true;
    return worker;
  }

  async function runOcrLocal(dataUrl) {
    const lang = ocrLang.value || 'rus+eng';
    const enhance = !!optEnhanceOcr.checked;

    setOcrProgress(0.01, 'подготовка');

    const w = await ensureWorker(lang);

    const inputs = [];
    if (enhance) {
      inputs.push(await preprocessForOcr(dataUrl, { scale: 2.2, contrast: 1.35, forceInvert: null }));
      inputs.push(await preprocessForOcr(dataUrl, { scale: 2.2, contrast: 1.35, forceInvert: true }));
    } else {
      inputs.push(dataUrl);
    }

    let best = { text: '', score: -1e9 };

    for (let i = 0; i < inputs.length; i++) {
      setOcrProgress(i / inputs.length * 0.25, enhance ? `подготовка ${i + 1}/${inputs.length}` : 'обработка');
      const { data } = await w.recognize(inputs[i]);
      const text = normalizeSpaces(data?.text || '');
      const sc = scoreOcrText(text);
      if (sc > best.score) best = { text, score: sc };
      // tiny breath to keep UI responsive on slow devices
      await sleep(15);
    }

    setOcrProgress(1, 'готово');
    return best.text;
  }

  async function runOcrCloud(dataUrl) {
    const endpoint = (cloudEndpoint.value || '').trim();
    if (!endpoint) throw new Error('Укажите Cloud OCR endpoint.');

    setOcrProgress(0.02, 'подготовка');
    // Limit payload for Functions (3.5MB JSON limit): downscale + JPEG
    const jpeg = await downscaleToJpeg(dataUrl, { maxSide: 1600, quality: 0.86 });
    const { mime, b64 } = dataUrlToBase64(jpeg);

    setOcrProgress(0.15, 'отправка');
    const langs = (ocrLang.value || 'rus+eng').split('+').filter(Boolean).map(x => x === 'rus' ? 'ru' : x);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: b64,
        mimeType: (mime || 'image/jpeg').includes('png') ? 'PNG' : 'JPEG',
        languageCodes: langs.length ? langs : ['ru', 'en'],
        model: 'page'
      })
    });

    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`Cloud OCR: HTTP ${res.status}. ${t ? t.slice(0, 180) : ''}`);
    }

    setOcrProgress(0.75, 'распознавание');
    const json = await res.json();
    const text = normalizeSpaces(json?.text || '');
    setOcrProgress(1, 'готово');
    return text;
  }

  async function runOcr(dataUrl) {
    return (ocrEngine === 'cloud') ? runOcrCloud(dataUrl) : runOcrLocal(dataUrl);
  }

  // ---------- Analysis helpers
  function normalizeEcode(code) {
    if (!code) return '';
    return String(code)
      .toUpperCase()
      .replace(/\s+/g, '')
      .replace(/^Е/, 'E') // Cyrillic Е → Latin E
      .replace(/^E-/, 'E')
      .replace(/[^E0-9A-Z]/g, '');
  }

  function extractCompositionBlock(text) {
    const t = normalizeSpaces(text);
    if (!t) return '';

    const lower = t.toLowerCase();

    // Try common markers
    const markers = [
      'состав:', 'состав :', 'ингредиенты:', 'ингредиенты :', 'ingredients:'
    ];
    let start = -1;
    for (const m of markers) {
      const idx = lower.indexOf(m);
      if (idx >= 0) { start = idx + m.length; break; }
    }

    if (start < 0) {
      // If no marker, return first ~700 chars (still useful)
      return t.slice(0, 700);
    }

    // Stop markers (nutrition etc.)
    const stops = [
      'пищевая ценность', 'питательная ценность', 'энергетическая ценность',
      'срок годности', 'хранить', 'условия хранения', 'изготовитель', 'производитель',
      'масса нетто', 'calories', 'nutrition'
    ];

    let end = t.length;
    const tail = lower.slice(start);
    for (const s of stops) {
      const k = tail.indexOf(s);
      if (k >= 0) end = Math.min(end, start + k);
    }

    return t.slice(start, end).trim();
  }

  function tokenizeIngredients(text) {
    const t = normalizeSpaces(text);
    if (!t) return [];
    const parts = t
      .replace(/[•·]/g, ',')
      .split(/[,;]+|\n+/g)
      .map(x => x.trim())
      .filter(Boolean);

    // normalize duplicates
    const seen = new Set();
    const out = [];
    for (const p of parts) {
      const k = p.toLowerCase();
      if (k.length < 2) continue;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(p);
    }
    return out;
  }

  function extractEcodes(text) {
    const t = normalizeSpaces(text);
    if (!t) return [];

    // E###, E###a, E-###, Е### (Cyrillic)
    const matches = t.match(/(?:^|[^A-Za-zА-Яа-я0-9])(E|Е)\s?-?\s?(\d{3,4})([a-zA-Zа-яА-Я])?/g) || [];
    const codes = matches.map(m => {
      const mm = m.match(/(E|Е)\s?-?\s?(\d{3,4})([a-zA-Zа-яА-Я])?/);
      if (!mm) return '';
      return normalizeEcode(`E${mm[2]}${mm[3] || ''}`);
    }).filter(Boolean);

    return Array.from(new Set(codes));
  }

  function detectPatterns(text, patterns) {
    const lower = String(text || '').toLowerCase();
    const hits = [];
    for (const p of patterns) {
      if (lower.includes(String(p).toLowerCase())) hits.push(p);
    }
    return Array.from(new Set(hits));
  }

  function detectAllergens(text) {
    const lower = String(text || '').toLowerCase();
    const hits = [];
    for (const a of allergens) {
      if (a.patterns.some(p => lower.includes(p))) hits.push(a.key);
    }
    return hits;
  }

  function autoExtractNutrients(text) {
    // Best-effort parser for "per 100 g" lines (demo-grade)
    const t = String(text || '').toLowerCase();

    const out = { sugar: null, fat: null, salt: null };

    const grab = (re) => {
      const m = t.match(re);
      return m ? parseNumberRu(m[1]) : null;
    };

    // sugars
    out.sugar = grab(/сахар[аы]?\s*[:\-]?\s*([0-9]+[.,]?[0-9]*)\s*г/);
    if (out.sugar == null) out.sugar = grab(/sugar[s]?\s*[:\-]?\s*([0-9]+[.,]?[0-9]*)\s*g/);

    // fat
    out.fat = grab(/жир[аы]?\s*[:\-]?\s*([0-9]+[.,]?[0-9]*)\s*г/);
    if (out.fat == null) out.fat = grab(/fat\s*[:\-]?\s*([0-9]+[.,]?[0-9]*)\s*g/);

    // salt
    out.salt = grab(/соль\s*[:\-]?\s*([0-9]+[.,]?[0-9]*)\s*г/);
    if (out.salt == null) out.salt = grab(/salt\s*[:\-]?\s*([0-9]+[.,]?[0-9]*)\s*g/);

    return out;
  }

  function classifyTraffic(value, thr) {
    if (value == null || !Number.isFinite(value)) return { kind: 'pill--unknown', label: '—' };
    if (value <= thr.lowMax) return { kind: 'pill--low', label: 'Низко' };
    if (value >= thr.highMin) return { kind: 'pill--high', label: 'Высоко' };
    return { kind: 'pill--mid', label: 'Средне' };
  }

  function computeOverallVerdict({ eCount, allergenCount, sugarHintsCount, traffic }) {
    // Demo logic: conservative
    let kind = 'verdict--ok';
    const reasons = [];

    if (traffic.some(x => x === 'pill--high')) {
      kind = 'verdict--danger';
      reasons.push('Есть нутриенты в красной зоне.');
    } else if (traffic.some(x => x === 'pill--mid')) {
      kind = (kind === 'verdict--danger') ? kind : 'verdict--warn';
      reasons.push('Есть нутриенты в жёлтой зоне.');
    }

    if (allergenCount > 0) {
      kind = (kind === 'verdict--danger') ? kind : 'verdict--warn';
      reasons.push('Обнаружены потенциальные аллергены.');
    }

    if (eCount >= 3) {
      kind = (kind === 'verdict--danger') ? kind : 'verdict--warn';
      reasons.push('Много E‑добавок (проверьте назначение).');
    }

    if (sugarHintsCount > 0) {
      kind = (kind === 'verdict--danger') ? kind : 'verdict--warn';
      reasons.push('Есть признаки добавленных сахаров.');
    }

    const title =
      kind === 'verdict--ok' ? 'Выглядит нормально' :
      kind === 'verdict--warn' ? 'Нужна проверка' :
      kind === 'verdict--danger' ? 'Повышенное внимание' : '—';

    const body = reasons.length ? reasons.join(' ') : 'По эвристикам демо явных флагов не нашлось.';

    return { kind, title, body };
  }

  // ---------- Rendering
  function renderAllergenChips({ allergenList, sugarHints, msgHints }) {
    allergensBlock.innerHTML = '';

    const addChip = (text, variant) => {
      const span = document.createElement('span');
      span.className = `chip chip--${variant}`;
      span.textContent = text;
      allergensBlock.appendChild(span);
    };

    allergenList.forEach(a => addChip(a, 'danger'));
    sugarHints.forEach(s => addChip(`Сахар: ${s}`, 'warn'));
    msgHints.forEach(s => addChip(`Усилитель: ${s}`, 'warn'));

    if (!allergenList.length && !sugarHints.length && !msgHints.length) {
      const span = document.createElement('span');
      span.className = 'muted';
      span.textContent = 'Ничего не найдено.';
      allergensBlock.appendChild(span);
    }
  }

  function renderEcodesTable(codes) {
    const tbody = ecodesTable.querySelector('tbody');
    tbody.innerHTML = '';

    const rows = [];

    for (const c of codes) {
      const item = eDb[c] || null;

      // Risk badge (demo)
      const att = String(item?.attention || item?.risk || '').toLowerCase();
      const riskLabel =
        att.includes('выс') || att.includes('high') ? 'Высокий' :
        att.includes('сред') || att.includes('med') ? 'Средний' :
        att.includes('низ') || att.includes('low') ? 'Низкий' :
        (item?.attention || item?.risk || '—');

      const riskClass =
        att.includes('выс') || att.includes('high') ? 'badge--danger' :
        att.includes('сред') || att.includes('med') ? 'badge--warn' :
        att.includes('низ') || att.includes('low') ? 'badge--ok' : '';

      const name = item?.name_ru || item?.name || item?.ru || item?.title || '—';
      const type = item?.function_ru || item?.type || item?.category || '—';

      rows.push({
        code: c,
        name,
        type,
        riskLabel,
        riskClass
      });
    }

    lastEcodeRows = rows.slice();

    const renderRows = (filterStr = '') => {
      const f = String(filterStr || '').trim().toLowerCase();
      const filtered = !f ? rows : rows.filter(r =>
        r.code.toLowerCase().includes(f) ||
        String(r.name).toLowerCase().includes(f) ||
        String(r.type).toLowerCase().includes(f) ||
        String(r.riskLabel).toLowerCase().includes(f)
      );

      tbody.innerHTML = filtered.map(r => `
        <tr>
          <td class="mono">${escapeHtml(r.code)}</td>
          <td>${escapeHtml(r.name)}</td>
          <td>${escapeHtml(r.type)}</td>
          <td><span class="badge ${escapeHtml(r.riskClass)}">${escapeHtml(r.riskLabel)}</span></td>
        </tr>
      `).join('') || `<tr><td colspan="4" class="muted">Нет совпадений.</td></tr>`;
    };

    renderRows(ecodesFilter?.value || '');
    return rows;
  }

  function recalcTrafficAndVerdict() {
    const sugar = parseNumberRu(nutrSugar.value);
    const fat = parseNumberRu(nutrFat.value);
    const salt = parseNumberRu(nutrSalt.value);

    const s = classifyTraffic(sugar, THRESHOLDS.sugar);
    const f = classifyTraffic(fat, THRESHOLDS.fat);
    const sa = classifyTraffic(salt, THRESHOLDS.salt);

    setPill(tlSugar, s.kind, s.label);
    setPill(tlFat, f.kind, f.label);
    setPill(tlSalt, sa.kind, sa.label);

    if (!lastAnalysis) return;

    const verdict = computeOverallVerdict({
      eCount: lastAnalysis.codes.length,
      allergenCount: lastAnalysis.allergens.length,
      sugarHintsCount: lastAnalysis.hiddenSugars.length,
      traffic: [s.kind, f.kind, sa.kind]
    });

    lastAnalysis.verdict = verdict;
    setVerdict(verdict.kind, verdict.title, verdict.body);
  }

  // ---------- History
  function loadHistory() {
    const raw = localStorage.getItem(HISTORY_KEY);
    try { return raw ? JSON.parse(raw) : []; } catch { return []; }
  }

  function saveHistory(items) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(-30)));
  }

  function renderHistory() {
    const items = loadHistory();
    if (!items.length) {
      historyBlock.classList.add('muted');
      historyBlock.textContent = 'Пусто.';
      return;
    }

    historyBlock.classList.remove('muted');
    historyBlock.classList.add('history');
    historyBlock.innerHTML = '';

    const reversed = items.slice().reverse();
    for (const it of reversed) {
      const date = new Date(it.ts);
      const el = document.createElement('div');
      el.className = 'history__item';

      el.innerHTML = `
        <div class="history__top">
          <div>
            <div class="history__title">${escapeHtml(it.verdictTitle || '—')}</div>
            <div class="history__summary">${escapeHtml(it.summary || '')}</div>
          </div>
          <div class="history__date">${escapeHtml(date.toLocaleString())}</div>
        </div>
        <div class="history__actions">
          <button class="btn btn--ghost btn--small" type="button" data-act="load">Открыть</button>
          <button class="btn btn--ghost btn--small" type="button" data-act="copy">Копировать текст</button>
        </div>
      `;

      el.querySelector('[data-act="load"]').addEventListener('click', () => {
        if (it.rawText) textInput.value = it.rawText;
        toast({ title: 'Загружено', body: 'Текст подставлен в поле ввода.' });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });

      el.querySelector('[data-act="copy"]').addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(it.rawText || '');
          toast({ title: 'Скопировано', body: 'Текст анализа в буфере обмена.' });
        } catch {
          toast({ title: 'Не удалось', body: 'Браузер не дал доступ к буферу обмена.' });
        }
      });

      historyBlock.appendChild(el);
    }
  }

  function saveToHistory() {
    if (!lastAnalysis) {
      toast({ title: 'Нет данных', body: 'Сначала выполните анализ.' });
      return;
    }

    const summary = [
      `${lastAnalysis.codes.length} E‑кодов`,
      `${lastAnalysis.allergens.length} аллергенов`,
      `${lastAnalysis.hiddenSugars.length} признаков сахаров`,
    ].join(' · ');

    const items = loadHistory();
    items.push({
      ts: Date.now(),
      verdictTitle: lastAnalysis.verdict?.title || '',
      summary,
      rawText: lastAnalysis.rawText || '',
      codes: lastAnalysis.codes,
      allergens: lastAnalysis.allergens,
      hiddenSugars: lastAnalysis.hiddenSugars
    });
    saveHistory(items);
    renderHistory();
    toast({ title: 'Сохранено', body: 'Запись добавлена в историю.' });
  }

  // ---------- Share card (Canvas)
  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadShareCard() {
    if (!lastAnalysis) {
      toast({ title: 'Нет данных', body: 'Сначала выполните анализ.' });
      return;
    }

    const canvas = shareCanvas;
    const ctx = canvas.getContext('2d');

    // Background (dark glass with subtle gradients)
    const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    g.addColorStop(0, '#070a12');
    g.addColorStop(1, '#0b1020');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // blobs
    const blob = (x, y, r, c1, c2) => {
      const gg = ctx.createRadialGradient(x, y, 0, x, y, r);
      gg.addColorStop(0, c1);
      gg.addColorStop(1, c2);
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };
    blob(220, 140, 220, 'rgba(10,132,255,0.32)', 'rgba(10,132,255,0)');
    blob(980, 170, 260, 'rgba(48,209,88,0.22)', 'rgba(48,209,88,0)');
    blob(620, 610, 300, 'rgba(255,159,10,0.14)', 'rgba(255,159,10,0)');

    // glass card
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(ctx, 44, 44, 1112, 562, 26);
    ctx.fill();
    ctx.restore();

    // border
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 2;
    roundRect(ctx, 44, 44, 1112, 562, 26);
    ctx.stroke();

    // title
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '800 46px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.fillText('LabelSpy', 86, 120);

    ctx.fillStyle = 'rgba(255,255,255,0.60)';
    ctx.font = '500 20px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.fillText('Сводка анализа состава (демо)', 86, 152);

    // verdict badge
    const v = lastAnalysis.verdict?.title || '—';
    const vk = lastAnalysis.verdict?.kind || 'verdict--unknown';
    const badgeColor =
      vk === 'verdict--ok' ? 'rgba(48,209,88,0.22)' :
      vk === 'verdict--warn' ? 'rgba(255,159,10,0.22)' :
      vk === 'verdict--danger' ? 'rgba(255,69,58,0.22)' : 'rgba(255,255,255,0.12)';

    ctx.fillStyle = badgeColor;
    roundRect(ctx, 86, 182, 340, 54, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '700 22px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.fillText(v, 106, 218);

    // metrics
    const metric = (x, y, label, value) => {
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      roundRect(ctx, x, y, 310, 120, 20);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.62)';
      ctx.font = '600 16px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.fillText(label, x + 18, y + 36);

      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = '850 44px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.fillText(String(value), x + 18, y + 88);
    };

    metric(86, 260, 'E‑коды', lastAnalysis.codes.length);
    metric(412, 260, 'Аллергены', lastAnalysis.allergens.length);
    metric(738, 260, 'Скрытые сахара', lastAnalysis.hiddenSugars.length);

    // snippet
    const snippet = (lastAnalysis.composition || lastAnalysis.rawText || '').slice(0, 360).trim();
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.font = '600 16px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.fillText('Фрагмент состава:', 86, 428);

    ctx.fillStyle = 'rgba(255,255,255,0.86)';
    ctx.font = '500 18px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial';

    const wrapText = (text, x, y, maxWidth, lineHeight, maxLines) => {
      const words = text.split(/\s+/);
      let line = '';
      let lines = 0;

      for (let i = 0; i < words.length; i++) {
        const test = line ? (line + ' ' + words[i]) : words[i];
        if (ctx.measureText(test).width > maxWidth && line) {
          ctx.fillText(line, x, y);
          y += lineHeight;
          lines++;
          line = words[i];
          if (lines >= maxLines) return;
        } else {
          line = test;
        }
      }
      if (lines < maxLines) ctx.fillText(line, x, y);
    };

    wrapText(snippet || '—', 86, 456, 1020, 26, 5);

    // Export
    const blobOut = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blobOut) {
      toast({ title: 'Ошибка', body: 'Не удалось создать PNG.' });
      return;
    }
    downloadBlob(blobOut, 'labelspy-card.png');
    toast({ title: 'Карточка сохранена', body: 'PNG загружен на устройство.' });
  }

  // ---------- Data loading
  async function loadDb() {
    try {
      const res = await fetch('./data/e_additives_ru.json', { cache: 'no-cache' });
      eDb = await res.json();
    } catch (e) {
      console.error(e);
      eDb = {};
      toast({ title: 'База E‑кодов недоступна', body: 'Проверьте, что data/e_additives_ru.json загружается.' });
    }
  }

  // ---------- Main actions
  async function onSelectFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Неподдерживаемый файл', body: 'Нужна картинка (image/*).' });
      return;
    }

    btnOcr.disabled = true;
    setOcrProgress(0, 'ожидание');

    const dataUrl = await toDataUrl(file);
    lastImageDataUrl = dataUrl;

    imgPreview.src = dataUrl;
    imgPreview.onload = () => { /* no-op */ };
    imgPreview.onerror = () => { /* no-op */ };
    imgPreview.style.display = 'block';

    const previewWrap = imgPreview.closest('.preview');
    if (previewWrap) previewWrap.classList.add('has-image');

    btnOcr.disabled = false;
    toast({ title: 'Фото загружено', body: 'Можно запускать OCR.' });
  }

  async function doOcr() {
    if (!lastImageDataUrl) {
      toast({ title: 'Нет изображения', body: 'Загрузите фото или нажмите «Загрузить пример».' });
      return;
    }

    btnOcr.disabled = true;
    try {
      setOcrProgress(0, 'старт');
      const text = await runOcr(lastImageDataUrl);
      if (text && text.trim()) {
        textInput.value = textInput.value ? (textInput.value.trim() + '\n\n' + text) : text;
        toast({ title: 'OCR готов', body: 'Текст добавлен в поле ввода.' });
      } else {
        toast({ title: 'OCR пустой', body: 'Попробуйте другой кадр или включите препроцессинг.' });
      }
    } catch (e) {
      console.error(e);
      toast({ title: 'OCR ошибка', body: String(e?.message || e) });
    } finally {
      btnOcr.disabled = false;
    }
  }

  function doAnalyze() {
    const raw = normalizeSpaces(textInput.value || '');
    if (!raw) {
      toast({ title: 'Нет текста', body: 'Вставьте текст или выполните OCR.' });
      return;
    }

    const composition = extractCompositionBlock(raw);
    compositionSnippet.textContent = composition ? composition.slice(0, 900) : '—';

    const ingredients = tokenizeIngredients(composition || raw);
    const codes = extractEcodes(composition || raw);

    const allergenList = detectAllergens(composition || raw);
    const sugarHints = detectPatterns(composition || raw, hiddenSugars);
    const msgHints = detectPatterns(composition || raw, msgLike);

    renderAllergenChips({ allergenList, sugarHints, msgHints });
    renderEcodesTable(codes);

    // Auto-fill nutrients (best effort)
    const auto = autoExtractNutrients(raw);
    if (auto.sugar != null && !nutrSugar.value) nutrSugar.value = String(auto.sugar);
    if (auto.fat != null && !nutrFat.value) nutrFat.value = String(auto.fat);
    if (auto.salt != null && !nutrSalt.value) nutrSalt.value = String(auto.salt);

    // Metrics (animated)
    animateInt(metricEcodes, codes.length);
    animateInt(metricAllergens, allergenList.length);
    animateInt(metricSugars, sugarHints.length);

    lastAnalysis = {
      rawText: raw,
      composition,
      ingredients,
      codes,
      allergens: allergenList,
      hiddenSugars: sugarHints,
      msgLike: msgHints,
      verdict: null
    };

    // Show results and compute verdict
    show(results);
    recalcTrafficAndVerdict();

    toast({ title: 'Анализ готов', body: 'Прокрутите вниз для деталей.' });
    // subtle scroll to results
    setTimeout(() => results.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  }

  function clearAll() {
    textInput.value = '';
    nutrSugar.value = '';
    nutrFat.value = '';
    nutrSalt.value = '';

    compositionSnippet.textContent = '—';
    allergensBlock.innerHTML = '';
    ecodesTable.querySelector('tbody').innerHTML = '';

    metricEcodes.textContent = '0';
    metricAllergens.textContent = '0';
    metricSugars.textContent = '0';

    setPill(tlSugar, 'pill--unknown', '—');
    setPill(tlFat, 'pill--unknown', '—');
    setPill(tlSalt, 'pill--unknown', '—');

    setVerdict('verdict--unknown', '—', '—');

    lastAnalysis = null;
    hide(results);

    toast({ title: 'Очищено', body: 'Поля ввода и результаты сброшены.' });
  }

  function setSample() {
    const sample = [
      'Состав: вода, сахар, глюкозный сироп, регулятор кислотности E330, краситель E150d, консервант E211, ароматизатор, соль.',
      'Пищевая ценность на 100 г: жиры 0 г, сахара 10.5 г, соль 0.12 г.'
    ].join('\n');

    textInput.value = sample;

    // Modern-looking sample "label" as SVG
    const svg = encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="980" height="640">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#070a12"/>
            <stop offset="1" stop-color="#0b1020"/>
          </linearGradient>
          <radialGradient id="b1" cx="0.2" cy="0.2" r="0.8">
            <stop offset="0" stop-color="rgba(10,132,255,0.75)"/>
            <stop offset="1" stop-color="rgba(10,132,255,0)"/>
          </radialGradient>
          <radialGradient id="b2" cx="0.9" cy="0.25" r="0.8">
            <stop offset="0" stop-color="rgba(48,209,88,0.55)"/>
            <stop offset="1" stop-color="rgba(48,209,88,0)"/>
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#bg)"/>
        <circle cx="220" cy="160" r="190" fill="url(#b1)"/>
        <circle cx="820" cy="180" r="240" fill="url(#b2)"/>
        <rect x="40" y="40" width="900" height="560" rx="28" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.16)" />
        <text x="84" y="120" font-size="50" fill="rgba(255,255,255,0.92)" font-family="Arial" font-weight="700">LabelSpy — пример</text>
        <text x="84" y="170" font-size="22" fill="rgba(255,255,255,0.62)" font-family="Arial">Снимок этикетки (демо)</text>

        <text x="84" y="250" font-size="28" fill="rgba(255,255,255,0.86)" font-family="Arial">Состав: вода, сахар, глюкозный сироп, E330, E150d, E211, соль</text>
        <text x="84" y="305" font-size="26" fill="rgba(255,255,255,0.72)" font-family="Arial">Пищевая ценность на 100 г: жиры 0 г, сахара 10.5 г, соль 0.12 г</text>

        <text x="84" y="520" font-size="18" fill="rgba(255,255,255,0.56)" font-family="Arial">Подсказка: в реальном фото кадрируйте блок «Состав» крупно</text>
      </svg>
    `);
    lastImageDataUrl = `data:image/svg+xml;charset=utf-8,${svg}`;

    imgPreview.src = lastImageDataUrl;
    imgPreview.style.display = 'block';
    const previewWrap = imgPreview.closest('.preview');
    if (previewWrap) previewWrap.classList.add('has-image');

    btnOcr.disabled = false;
    setOcrProgress(0, 'ожидание');

    toast({ title: 'Пример загружен', body: 'Можно нажимать «Распознать» или «Проанализировать».' });
  }

  // ---------- Wiring / events
  function wireUi() {
    // Segmented: OCR engine
    $$('.seg__btn[data-ocr-engine]').forEach((b) => {
      b.addEventListener('click', () => {
        ocrEngine = b.dataset.ocrEngine;
        applyOcrEngineUi();
        saveSettings();
        toast({ title: 'OCR режим', body: ocrEngine === 'cloud' ? 'Cloud OCR включён.' : 'Локальный OCR включён.' , timeout: 2400 });
      });
    });

    // Drop zone interactions
    const addOver = () => dropZone.classList.add('is-dragover');
    const removeOver = () => dropZone.classList.remove('is-dragover');

    ['dragenter', 'dragover'].forEach(ev => dropZone.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation(); addOver();
    }));
    ['dragleave', 'drop'].forEach(ev => dropZone.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation(); removeOver();
    }));
    dropZone.addEventListener('drop', async (e) => {
      const f = e.dataTransfer?.files?.[0];
      if (f) await onSelectFile(f);
    });

    fileInput.addEventListener('change', async () => {
      const f = fileInput.files && fileInput.files[0];
      if (f) await onSelectFile(f);
    });

    btnOcr.addEventListener('click', doOcr);
    btnUseSample.addEventListener('click', setSample);
    btnAnalyze.addEventListener('click', doAnalyze);
    btnClear.addEventListener('click', clearAll);

    btnRecalc.addEventListener('click', recalcTrafficAndVerdict);
    nutrSugar.addEventListener('input', () => { if (lastAnalysis) recalcTrafficAndVerdict(); });
    nutrFat.addEventListener('input', () => { if (lastAnalysis) recalcTrafficAndVerdict(); });
    nutrSalt.addEventListener('input', () => { if (lastAnalysis) recalcTrafficAndVerdict(); });

    btnShareCard.addEventListener('click', downloadShareCard);
    btnSaveToHistory.addEventListener('click', saveToHistory);

    btnClearHistory.addEventListener('click', () => {
      localStorage.removeItem(HISTORY_KEY);
      renderHistory();
      toast({ title: 'История очищена', body: 'Локальные записи удалены.' });
    });

    ecodesFilter?.addEventListener('input', () => {
      // Re-render from lastEcodeRows; easiest: call renderEcodesTable on the last codes list
      // but we only kept rows; keep simple by reusing renderRows via re-render full table.
      // We'll trigger by re-calling analyze render if analysis exists.
      if (lastAnalysis) renderEcodesTable(lastAnalysis.codes);
    });

    // About dialog
    btnOpenAbout.addEventListener('click', () => {
      if (typeof aboutDialog.showModal === 'function') aboutDialog.showModal();
      else aboutDialog.setAttribute('open', 'open');
    });

    // Settings persistence
    cloudEndpoint.addEventListener('change', saveSettings);
    optEnhanceOcr.addEventListener('change', saveSettings);
    ocrLang.addEventListener('change', saveSettings);
  }

  function initGithubLink() {
    // If hosted on GitHub Pages: https://<user>.github.io/<repo>/
    try {
      const { hostname, pathname } = window.location;
      if (hostname.endsWith('.github.io')) {
        const user = hostname.replace('.github.io', '');
        const parts = pathname.split('/').filter(Boolean);
        const repo = parts[0];
        if (user && repo) {
          githubLink.href = `https://github.com/${user}/${repo}`;
          return;
        }
      }
    } catch { /* ignore */ }

    // Optional override
    if (window.__LABELSPY_REPO) {
      githubLink.href = `https://github.com/${window.__LABELSPY_REPO}`;
    }
  }

  async function initPwa() {
    // SW
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('./service-worker.js');
      } catch (e) {
        console.warn('SW register failed', e);
      }
    }
  }

  // ---------- Boot
  (async () => {
    loadSettings();
    applyOcrEngineUi();
    initGithubLink();

    setOcrProgress(0, 'ожидание');
    setVerdict('verdict--unknown', '—', '—');

    wireUi();
    await loadDb();
    renderHistory();
    await initPwa();

    // UI: show cloud endpoint only when cloud selected
    // (done in applyOcrEngineUi)
  })();

})();
