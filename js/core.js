/* Reine Lern- und Bewertungslogik (ohne DOM) – im Browser als window.AP2Core, in Node per require(). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AP2Core = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const DAY = 86400000;
  // Leitner-Intervalle (Tage) je Box 0..5
  const INTERVALS = [0, 1, 3, 7, 16, 35];

  /** Nur freigegebene, bewertbare Aufgaben dürfen in Training/Prüfung (Entscheidung 32C). */
  function gradableTasks(tasks) {
    return tasks.filter(t => t.gradable === true && t.status === 'released' && t.solution && (t.type === 'open' ? Array.isArray(t.subtasks) && t.subtasks.length > 0 : Number.isInteger(t.solution.answer)));
  }

  /** MC bewerten: genau eine richtige Option 1..5 laut offizieller Schablone. */
  function gradeMC(task, choice) {
    if (!task.gradable) throw new Error('Aufgabe ist nicht bewertbar: ' + task.id);
    return Number(choice) === task.solution.answer;
  }

  /** Ergebnis eines Schnelltrainingsschritts: 'first' | 'hint' | 'wrong'. */
  function outcome(firstCorrect, secondCorrect) {
    if (firstCorrect) return 'first';
    return secondCorrect ? 'hint' : 'wrong';
  }

  /** Spaced Repetition (Leitner): falsch -> Box 0 (bald wieder), mit Hinweis -> Box 1, sofort richtig -> Box +1. */
  function updateSrs(entry, result, now) {
    const e = Object.assign({ box: 0, seen: 0, first: 0, hint: 0, wrong: 0, last: 0, due: 0 }, entry || {});
    e.seen += 1; e.last = now;
    if (result === 'first') { e.first += 1; e.box = Math.min(5, e.box + 1); }
    else if (result === 'hint') { e.hint += 1; e.box = 1; }
    else { e.wrong += 1; e.box = 0; }
    e.due = now + (e.box === 0 ? 10 * 60000 : INTERVALS[e.box] * DAY);
    return e;
  }

  /** Hinweis für MC ohne erfundene Inhalte: zwei sicher falsche Optionen ausgrauen (gewählte falsche + eine weitere). */
  function hintEliminate(task, wrongChoice, rng) {
    const r = rng || Math.random;
    const others = [1, 2, 3, 4, 5].filter(o => o !== task.solution.answer && o !== Number(wrongChoice));
    const extra = others[Math.floor(r() * others.length)];
    return [Number(wrongChoice), extra].sort();
  }

  function shuffle(arr, rng) {
    const a = arr.slice(), r = rng || Math.random;
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  /**
   * Schnelltraining zusammenstellen: ca. 40 % Schwächen, 40 % neu, 20 % fällige Wiederholung.
   * Leere Kategorien werden aus den anderen aufgefüllt. Nur bewertbare Aufgaben.
   */
  function pickSession(tasks, srs, n, opts) {
    const o = opts || {}; const now = o.now || Date.now(); const r = o.rng || Math.random;
    let pool = gradableTasks(tasks);
    if (o.parts && o.parts.length) pool = pool.filter(t => o.parts.includes(t.part));
    if (o.types && o.types.length) pool = pool.filter(t => o.types.includes(t.type || 'mc'));
    if (o.periods && o.periods.length) pool = pool.filter(t => o.periods.includes(t.period));
    if (o.topics && o.topics.length) pool = pool.filter(t => o.topics.includes(t.topic));
    const weak = [], fresh = [], review = [], rest = [];
    for (const t of pool) {
      const e = srs[t.id];
      if (!e || !e.seen) fresh.push(t);
      else if ((e.wrong > 0 || e.hint > 0) && e.box <= 1) weak.push(t);
      else if (e.due <= now) review.push(t);
      else rest.push(t);
    }
    const want = { weak: Math.round(n * 0.4), fresh: Math.round(n * 0.4) };
    want.review = n - want.weak - want.fresh;
    const buckets = { weak: shuffle(weak, r), fresh: shuffle(fresh, r), review: shuffle(review, r) };
    const out = [];
    for (const k of ['weak', 'fresh', 'review']) out.push(...buckets[k].splice(0, want[k]));
    const leftovers = shuffle([...buckets.weak, ...buckets.fresh, ...buckets.review], r).concat(shuffle(rest, r));
    while (out.length < n && leftovers.length) out.push(leftovers.shift());
    return shuffle(out, r).map(t => t.id);
  }

  /**
   * Original-Prüfungsteil auswerten (Teil A: 28 Aufgaben, 25 werden gewertet; WiSo: 18, 15 gewertet).
   * Regel laut Deckblatt: Werden weniger als 3 Aufgaben abgewählt, gelten die letzten abwählbaren
   * (nicht als Pflicht markierten) Aufgaben als abgewählt. Pflichtaufgaben dürfen nicht abgewählt werden.
   */
  function scoreExam(tasks, answers, deselected) {
    const ordered = tasks.slice().sort((a, b) => a.number - b.number);
    const total = ordered.length; const counted = total === 18 ? 15 : (total === 28 ? 25 : total);
    const need = total - counted;
    const des = new Set((deselected || []).filter(n => { const t = ordered.find(x => x.number === n); return t && !t.mandatory; }).slice(0, need));
    for (let i = ordered.length - 1; i >= 0 && des.size < need; i--) {
      const t = ordered[i]; if (!t.mandatory && !des.has(t.number)) des.add(t.number);
    }
    const rows = ordered.map(t => {
      const a = answers[t.id]; const isDes = des.has(t.number);
      const graded = !isDes && t.gradable;
      return { id: t.id, number: t.number, answer: a == null ? null : Number(a), correct: t.solution.answer,
        deselected: isDes, graded, ok: graded && a != null && Number(a) === t.solution.answer, blocked: !t.gradable };
    });
    const gradedRows = rows.filter(r => r.graded);
    const right = gradedRows.filter(r => r.ok).length;
    return { rows, right, max: gradedRows.length, percent: gradedRows.length ? Math.round(1000 * right / gradedRows.length) / 10 : 0, deselected: [...des].sort((a, b) => a - b) };
  }

  /** Datenmigration mit Sicherung: alte Lernstände bleiben erhalten (Entscheidung 24A). */
  const SCHEMA = 1;
  function migrate(state) {
    const s = state && typeof state === 'object' ? state : {};
    if (!s.schema) {
      s.schema = SCHEMA; s.srs = s.srs || {}; s.attempts = s.attempts || []; s.sessions = s.sessions || {};
      s.exams = s.exams || {}; s.ink = s.ink || {}; s.settings = Object.assign({ mouseInk: false, grid: 24, sessionSize: 10 }, s.settings || {});
      s.favorites = s.favorites || []; s.reports = s.reports || [];
    }
    return s;
  }

  function stats(tasks, srs) {
    const by = {};
    for (const t of gradableTasks(tasks)) {
      const k = t.part; by[k] = by[k] || { total: 0, seen: 0, first: 0, hint: 0, wrong: 0, attempts: 0 };
      by[k].total++;
      const e = srs[t.id]; if (e && e.seen) { by[k].seen++; by[k].first += e.first; by[k].hint += e.hint; by[k].wrong += e.wrong; by[k].attempts += e.seen; }
    }
    return by;
  }


  /* ---------- Offene Aufgaben: Zahl + Einheit ---------- */
  const PREFIX = { p: 1e-12, n: 1e-9, 'µ': 1e-6, 'μ': 1e-6, u: 1e-6, m: 1e-3, c: 1e-2, k: 1e3, M: 1e6, G: 1e9 };
  const BASES = { A: 'A', V: 'V', W: 'W', VA: 'VA', var: 'var', 'Ω': 'Ω', Ohm: 'Ω', ohm: 'Ω', Hz: 'Hz', lx: 'lx', lm: 'lm', s: 's', m: 'm', F: 'F', H: 'H',
    Wh: 'Wh', N: 'N', Nm: 'Nm', K: 'K', Pa: 'Pa', bar: 'bar', g: 'g', cd: 'cd', J: 'J', T: 'T', S: 'S', Ah: 'Ah', B: 'B', bit: 'bit', 'm³': 'm³', 'm²': 'm²', l: 'l' };
  const SPECIAL = { '%': ['', 0.01], '‰': ['', 0.001], '°C': ['K', 1], '°': ['°', 1], 'grd': ['°', 1], 'min': ['s', 60], h: ['s', 3600], '1/min': ['1/min', 1], 'min⁻¹': ['1/min', 1], 'min-1': ['1/min', 1], 'min^-1': ['1/min', 1], 'U/min': ['1/min', 1],
    'mm²': ['m²', 1e-6], 'mm2': ['m²', 1e-6], 'mm^2': ['m²', 1e-6], 'cm²': ['m²', 1e-4], 'cm2': ['m²', 1e-4], 'm2': ['m²', 1], 'EUR': ['EUR', 1], '€': ['EUR', 1], 'Euro': ['EUR', 1], 'kWh': ['Wh', 1e3], 'MWh': ['Wh', 1e6],
    'Ws': ['J', 1], 'kvar': ['var', 1e3], 'Mvar': ['var', 1e6], 'kΩ': ['Ω', 1e3], 'MΩ': ['Ω', 1e6], 'mΩ': ['Ω', 1e-3], 'Ohm': ['Ω', 1], 'mm': ['m', 1e-3], 'km': ['m', 1e3], 'Nm': ['Nm', 1], 'N m': ['Nm', 1], 'N·m': ['Nm', 1], 'kNm': ['Nm', 1e3],
    'mbar': ['bar', 1e-3], 'l/min': ['l/min', 1], 'Monate': ['Monat', 1], 'Monat': ['Monat', 1], 'EUR/kWh': ['EUR/kWh', 1], '€/kWh': ['EUR/kWh', 1], 'ct/kWh': ['EUR/kWh', 0.01], 'Jahre': ['Jahr', 1], 'Jahr': ['Jahr', 1], 'a': ['Jahr', 1], 'L/min': ['l/min', 1], 'lm/W': ['lm/W', 1], 'l/h': ['l/min', 1 / 60], '': ['', 1], 'K/W': ['K/W', 1], 'kg': ['g', 1e3], 'V/m': ['V/m', 1], 'A/mm²': ['A/m²', 1e6], 'Stück': ['', 1], 'Stk': ['', 1], 'Stk.': ['', 1], 'St.': ['', 1] };
  function unitInfo(u) {
    u = String(u || '').trim().replace(/\s+/g, ' ').replace(/^in /, '');
    if (u in SPECIAL) return { base: SPECIAL[u][0], f: SPECIAL[u][1] };
    const v = u.replace(/ /g, '');
    if (v in SPECIAL) return { base: SPECIAL[v][0], f: SPECIAL[v][1] };
    if (v in BASES) return { base: BASES[v], f: 1 };
    const p = v[0], rest = v.slice(1);
    if (p in PREFIX && rest in BASES) return { base: BASES[rest], f: PREFIX[p] };
    return null;
  }
  /** "27,97 A" -> {value: 27.97, unit: 'A'}; akzeptiert Komma, Punkt, Tausenderpunkte, Minus, Zehnerpotenzen. */
  function parseQuantity(str) {
    let raw = String(str == null ? '' : str).trim(); if (raw.includes('=')) raw = raw.split('=').pop().trim(); // „ΔU = 2,6 V“ → „2,6 V“
    raw = raw.replace(/^≈\s*/, '');
    const t = raw.replace(/[−–]/g, '-').replace(/·10\^?/g, 'e').replace(/×10\^?/g, 'e');
    const m = t.match(/^([+-]?\d{1,3}(?:\.\d{3})+(?:,\d+)?|[+-]?\d*[.,]?\d+(?:e[+-]?\d+)?)\s*(.*)$/i);
    if (!m) return null;
    let num = m[1];
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(num.replace(/^[+-]/, ''))) num = num.replace(/\./g, '');
    const value = parseFloat(num.replace(',', '.'));
    if (!isFinite(value)) return null;
    return { value, unit: m[2].trim() };
  }
  /**
   * Prüft eine Zahlenantwort gegen den offiziellen Wert. Toleranz relativ (Standard 1 %) – deckt Rundungsunterschiede ab.
   * Einheit muss physikalisch passen (Umrechnung mit Vorsätzen erlaubt, z. B. 0,028 kA = 28 A).
   */
  function checkNumber(input, exp) {
    const q = typeof input === 'object' && input !== null ? input : parseQuantity(input);
    if (!q) return { ok: false, reason: 'format' };
    let unit = q.unit;
    if (!unit && exp.unit && exp.unitOptional) unit = exp.unit;
    const ui = unitInfo(unit), ue = unitInfo(exp.unit || '');
    if (!ui || !ue || ui.base !== ue.base) return { ok: false, reason: 'unit' };
    const v = q.value * ui.f / ue.f;
    const tol = exp.tol != null ? exp.tol : 0.01;
    const absTol = Math.max(Math.abs(exp.value) * tol, exp.absTol || 0);
    const ok = Math.abs(v - exp.value) <= absTol + 1e-12;
    return { ok, reason: ok ? null : 'value', normalized: v };
  }
  /** Teilaufgabe auswerten: Zahlen automatisch (alle Werte richtig = volle Punkte, sonst 0 – Entscheidung 29B), Text per Selbstbewertung. */
  function gradeSubtask(sub, answer, selfPoints) {
    if (sub.check && sub.check.kind === 'number') {
      const vals = sub.check.values; const ans = (answer && answer.values) || [];
      const res = vals.map((e, i) => checkNumber(ans[i], e));
      const ok = res.every(r => r.ok);
      // Teilpunkte nur, wenn das Lösungsheft Punkte je Rechenschritt ausweist (values[i].pts); sonst alles oder nichts
      const partial = vals.some(e => e.pts != null);
      const points = partial ? res.reduce((a, r, i) => a + (r.ok ? (vals[i].pts || 0) : 0), 0) : (ok ? sub.points : 0);
      return { auto: true, ok, points, details: res };
    }
    const p = Math.max(0, Math.min(sub.points, Number(selfPoints) || 0));
    return { auto: false, ok: p === sub.points, points: p, self: true };
  }

  /** IHK-Notenschlüssel (100-Punkte-Schlüssel der Abschlussprüfungen). */
  function ihkGrade(percent) {
    const p = Number(percent) || 0;
    const T = [[92, 1, 'sehr gut'], [81, 2, 'gut'], [67, 3, 'befriedigend'], [50, 4, 'ausreichend'], [30, 5, 'mangelhaft'], [0, 6, 'ungenügend']];
    const r = T.find(x => p >= x[0]); return { note: r[1], label: r[2], passed: p >= 50 };
  }
  return { ihkGrade, parseQuantity, checkNumber, unitInfo, gradeSubtask, DAY, INTERVALS, gradableTasks, gradeMC, outcome, updateSrs, hintEliminate, pickSession, scoreExam, migrate, stats, shuffle, SCHEMA };
});
