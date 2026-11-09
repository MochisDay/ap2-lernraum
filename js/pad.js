/* Kariertes Rechenpapier im Stil von GoodNotes.
   - Apple Pencil / Stift schreibt (Druckstärke, geglättete Linie); Finger schreiben nie (Handballen-Erkennung).
   - 1 Finger: verschieben · 2 Finger: zoomen/verschieben · 2-Finger-Tipp: Rückgängig · 3-Finger-Tipp: Wiederholen.
   - Strich am Ende kurz halten → wird zur geraden Linie.
   - Lasso: Striche einkreisen, dann verschieben oder löschen.
   - Seiten liegen untereinander wie in einem Heft. Gezeichnet wird nur der sichtbare Ausschnitt.
   Datenformat (kompatibel): pages = [[{t, c, w, p: [[x, y, druck], …]}, …], …] in Seitenkoordinaten. */
(function () {
  'use strict';
  const COLORS = ['#10203f', '#1f5eff', '#d23b3b', '#0e9f6e'];
  const PW = 700, PH = 990, GAP = 24; // logische Seite (A4-Verhältnis)

  /* Zwei-Finger-Zoom für ein natives Scroll-Element (wird für das Aufgabenbild genutzt). */
  function pinch(scroller, getZ, setZ, min, max) {
    let st = null;
    const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid = t => [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2];
    scroller.addEventListener('touchstart', e => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      const r = scroller.getBoundingClientRect(); const [mx, my] = mid(e.touches); const z = getZ();
      st = { d: dist(e.touches), z, cx: (scroller.scrollLeft + mx - r.left) / z, cy: (scroller.scrollTop + my - r.top) / z };
    }, { passive: false });
    scroller.addEventListener('touchmove', e => {
      if (!st || e.touches.length !== 2) return;
      e.preventDefault();
      const z = Math.min(max, Math.max(min, st.z * dist(e.touches) / st.d)); setZ(z);
      const r = scroller.getBoundingClientRect(); const [mx, my] = mid(e.touches);
      scroller.scrollLeft = st.cx * z - (mx - r.left); scroller.scrollTop = st.cy * z - (my - r.top);
    }, { passive: false });
    const end = e => { if (e.touches.length < 2) st = null; };
    scroller.addEventListener('touchend', end); scroller.addEventListener('touchcancel', end);
  }

  function createPad(host, opts) {
    const o = Object.assign({ pages: [[]], grid: 24, allowMouse: false, onChange: () => {} }, opts);
    let pages = (o.pages && o.pages.length ? o.pages : [[]]).map(p => p.map(s => Object.assign({}, s, { p: s.p.map(q => q.slice()) })));
    let color = COLORS[0], width = 2.2, tool = 'pen';
    let Z = 1, ox = 0, oy = 0, W = 0, H = 0, dpr = 1, fitted = false;
    let sel = null;
    const undo = [], redo = [];
    try { const v = JSON.parse(localStorage.getItem('ap2.padView') || 'null'); if (v && v.z) Z = v.z; } catch (_) {}

    host.innerHTML = `
      <div class="pad-bar">
        <div class="seg">${COLORS.map((c, i) => `<button class="sw${i ? '' : ' on'}" data-c="${c}" style="--c:${c}" aria-label="Farbe ${i + 1}"></button>`).join('')}</div>
        <div class="seg"><button data-w="1.4">fein</button><button data-w="2.2" class="on">mittel</button><button data-w="4">dick</button></div>
        <div class="seg"><button data-t="pen" class="on">✎ Stift</button><button data-t="marker">Marker</button><button data-t="erase">Radierer</button><button data-t="lasso">Lasso</button></div>
        <div class="seg"><button data-a="undo" title="Rückgängig (2-Finger-Tipp)">↶</button><button data-a="redo" title="Wiederholen (3-Finger-Tipp)">↷</button></div>
        <div class="seg"><button data-a="zout">−</button><button data-a="fit" class="zl" title="Auf Breite">100 %</button><button data-a="zin">+</button></div>
        <div class="seg"><button data-a="add">+ Seite</button><button data-a="clear">Seite leeren</button></div>
        <div class="seg selbar" hidden><button data-a="seldel">Auswahl löschen</button></div>
        <span class="pgno"></span>
      </div>
      <div class="pad-wrap"><canvas class="base"></canvas><canvas class="live"></canvas><canvas class="tip"></canvas>
        <div class="pad-hint">Stift schreibt · Handballen darf aufliegen · 1 Finger verschiebt · 2 Finger zoomen · 2-Finger-Tipp = rückgängig · am Strichende halten = gerade Linie</div></div>`;
    const wrap = host.querySelector('.pad-wrap');
    const cv = host.querySelector('canvas.base'), lv = host.querySelector('canvas.live');
    const tv = host.querySelector('canvas.tip'); tv.style.pointerEvents = 'none';
    const ctx = cv.getContext('2d'), lctx = lv.getContext('2d'), tctx = tv.getContext('2d');   // ohne „desynchronized“ (Android-Fehler: schwarze Fläche)
    const bar = host.querySelector('.pad-bar');

    const pageTop = i => i * (PH + GAP);
    const toWorld = (cx, cy) => { const r = lv.getBoundingClientRect(); return [(cx - r.left) / Z + ox, (cy - r.top) / Z + oy]; };
    const pageAt = wy => Math.max(0, Math.min(pages.length - 1, Math.floor(wy / (PH + GAP))));
    function clampView() {
      const totalH = pages.length * (PH + GAP);
      const vw = W / Z, vh = H / Z;
      ox = vw >= PW ? -(vw - PW) / 2 : Math.min(Math.max(ox, -20), PW - vw + 20);
      oy = Math.min(Math.max(oy, -20), Math.max(-20, totalH - vh + 20));
    }

    function resize() {
      const r = wrap.getBoundingClientRect(); dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      W = r.width; H = r.height; if (!W || !H) return;
      for (const c of [cv, lv, tv]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); c.style.width = W + 'px'; c.style.height = H + 'px'; }
      if (!fitted) { let has = false; try { has = !!localStorage.getItem('ap2.padView'); } catch (_) {} if (!has) Z = Math.max(0.4, Math.min(2, (W - 16) / PW)); fitted = true; }
      clampView(); render();
    }
    function view(c) { c.setTransform(dpr * Z, 0, 0, dpr * Z, -ox * dpr * Z, -oy * dpr * Z); }
    function strokePath(c, s, dy) {
      const p = s.p; if (!p.length) return;
      c.strokeStyle = s.c; c.lineCap = 'round'; c.lineJoin = 'round';
      c.globalAlpha = s.t === 'marker' ? .3 : 1;
      if (s.t === 'marker' || p.length < 3) {
        c.lineWidth = s.t === 'marker' ? s.w * 6 : s.w;
        c.beginPath(); c.moveTo(p[0][0], p[0][1] + dy);
        for (let i = 1; i < p.length; i++) c.lineTo(p[i][0], p[i][1] + dy);
        if (p.length === 1) c.lineTo(p[0][0] + .1, p[0][1] + dy);
        c.stroke(); c.globalAlpha = 1; return;
      }
      for (let i = 1; i < p.length - 1; i++) {
        const a = p[i - 1], b = p[i], n = p[i + 1];
        const m1 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], m2 = [(b[0] + n[0]) / 2, (b[1] + n[1]) / 2];
        c.lineWidth = s.w * (.55 + (b[2] || .5) * .9);
        c.beginPath(); c.moveTo(i === 1 ? a[0] : m1[0], (i === 1 ? a[1] : m1[1]) + dy); c.quadraticCurveTo(b[0], b[1] + dy, m2[0], m2[1] + dy);
        if (i === p.length - 2) c.lineTo(n[0], n[1] + dy);
        c.stroke();
      }
      c.globalAlpha = 1;
    }
    function render() {
      if (!W) return;
      const css = getComputedStyle(document.documentElement);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.fillStyle = css.getPropertyValue('--pad-bg').trim() || '#e9edf5'; ctx.fillRect(0, 0, cv.width, cv.height);
      view(ctx);
      const vy0 = oy, vy1 = oy + H / Z;
      const gcol = css.getPropertyValue('--pad-grid').trim() || '#dbe4f5';
      for (let i = 0; i < pages.length; i++) {
        const top = pageTop(i); if (top > vy1 || top + PH < vy0) continue;
        ctx.fillStyle = '#ffffff'; ctx.shadowColor = 'rgba(16,32,80,.12)'; ctx.shadowBlur = 6 * dpr; ctx.fillRect(0, top, PW, PH); ctx.shadowBlur = 0;
        ctx.strokeStyle = gcol; ctx.lineWidth = 1 / Z; ctx.beginPath();
        const g = o.grid;
        for (let x = g; x < PW; x += g) { ctx.moveTo(x, Math.max(top, vy0)); ctx.lineTo(x, Math.min(top + PH, vy1)); }
        for (let y = g; y < PH; y += g) { const yy = top + y; if (yy < vy0 - g || yy > vy1 + g) continue; ctx.moveTo(0, yy); ctx.lineTo(PW, yy); }
        ctx.stroke();
        for (let k = 0; k < pages[i].length; k++) {
          const s = pages[i][k];
          strokePath(ctx, s, top);
          if (sel && sel.pg === i && sel.idx.includes(k)) { ctx.save(); ctx.globalAlpha = .25; ctx.strokeStyle = '#1f5eff'; ctx.lineWidth = s.w + 6; ctx.beginPath(); s.p.forEach((q, j) => j ? ctx.lineTo(q[0], q[1] + top) : ctx.moveTo(q[0], q[1] + top)); ctx.stroke(); ctx.restore(); }
        }
        if (sel && sel.pg === i && sel.box) { const b = sel.box; ctx.save(); ctx.setLineDash([6 / Z, 4 / Z]); ctx.strokeStyle = '#1f5eff'; ctx.lineWidth = 1.5 / Z; ctx.strokeRect(b[0] - 6, b[1] + top - 6, b[2] - b[0] + 12, b[3] - b[1] + 12); ctx.restore(); }
      }
      host.querySelector('.pgno').textContent = `Seite ${pageAt(oy + H / Z / 2) + 1}/${pages.length}`;
      host.querySelector('.zl').textContent = Math.round(Z * 100) + ' %';
      host.querySelector('.selbar').hidden = !(sel && sel.idx.length);
    }
    let raf = 0; const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); };
    function clearTip() { tctx.setTransform(1, 0, 0, 1, 0, 0); tctx.clearRect(0, 0, tv.width, tv.height); }
    function clearLive() { lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.clearRect(0, 0, lv.width, lv.height); clearTip(); }
    function saveView() { try { localStorage.setItem('ap2.padView', JSON.stringify({ z: Z })); } catch (_) {} }

    const snap = () => JSON.stringify(pages);
    function commit(before) { undo.push(before); if (undo.length > 60) undo.shift(); redo.length = 0; o.onChange(pages); }
    function doUndo() { if (!undo.length) return; redo.push(snap()); pages = JSON.parse(undo.pop()); sel = null; o.onChange(pages); clampView(); schedule(); }
    function doRedo() { if (!redo.length) return; undo.push(snap()); pages = JSON.parse(redo.pop()); sel = null; o.onChange(pages); clampView(); schedule(); }

    /* ---------- Stift ---------- */
    let cur = null, holdT = 0;
    const isDraw = e => e.pointerType === 'pen' || (o.allowMouse && e.pointerType === 'mouse');
    function local(e) { const [x, y] = toWorld(e.clientX, e.clientY); const pg = cur ? cur.pg : pageAt(y); return [Math.round(x * 10) / 10, Math.round((y - pageTop(pg)) * 10) / 10, e.pressure || .5, pg]; }
    function eraseAt(x, y, pg) {
      const r = 10 / Math.sqrt(Z) + 4; const list = pages[pg]; const keep = list.filter(s => !s.p.some(q => Math.hypot(q[0] - x, q[1] - y) < r));
      if (keep.length !== list.length) { pages[pg] = keep; schedule(); return true; } return false;
    }
    function inPoly(x, y, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if (((a[1] > y) !== (b[1] > y)) && (x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0])) c = !c; } return c; }
    function bbox(pg, idx) { let b = [1e9, 1e9, -1e9, -1e9]; idx.forEach(k => pages[pg][k].p.forEach(q => { b = [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[0]), Math.max(b[3], q[1])]; })); return b; }
    // Live-Strich inkrementell zeichnen (nur neue Segmente) – geringere Verzögerung als komplettes Neuzeichnen
    function drawSeg(c, s, i, dy) {
      const p = s.p, a = p[i - 1], b = p[i], n = p[i + 1];
      const m1 = i === 1 ? a : [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], m2 = n ? [(b[0] + n[0]) / 2, (b[1] + n[1]) / 2] : b;
      c.strokeStyle = s.c; c.lineCap = 'round'; c.lineJoin = 'round'; c.globalAlpha = 1;
      c.lineWidth = s.w * (.55 + (b[2] || .5) * .9);
      c.beginPath(); c.moveTo(m1[0], m1[1] + dy); c.quadraticCurveTo(b[0], b[1] + dy, m2[0], m2[1] + dy); c.stroke();
    }
    function drawLiveInc() {
      if (!cur || cur.mode !== 'draw' || cur.straight || cur.s.t === 'marker' || cur.full) return drawLive();
      view(lctx); const top = pageTop(cur.pg); const p = cur.s.p;
      for (let i = Math.max(1, cur.drawn || 1); i < p.length - 1; i++) drawSeg(lctx, cur.s, i, top);
      cur.drawn = Math.max(1, p.length - 1);
      // offenes Strichende (und ggf. Vorhersage) auf eigener Ebene – wird bei jedem Ereignis ersetzt
      clearTip(); if (p.length < 2 && !pred.length) return; view(tctx);
      const l = p[p.length - 1], b = p.length > 1 ? p[p.length - 2] : l, m = p.length > 2 ? [(b[0] + l[0]) / 2, (b[1] + l[1]) / 2] : b;
      tctx.strokeStyle = cur.s.c; tctx.lineCap = 'round'; tctx.lineJoin = 'round'; tctx.lineWidth = cur.s.w * (.55 + (l[2] || .5) * .9);
      tctx.beginPath(); tctx.moveTo(m[0], m[1] + top); tctx.lineTo(l[0], l[1] + top); pred.forEach(q => tctx.lineTo(q[0], q[1] + top)); tctx.stroke();
    }
    let pred = [];
    function drawLive() {
      clearLive(); if (!cur) return; view(lctx);
      const top = pageTop(cur.pg);
      if (cur.mode === 'lasso') { lctx.setLineDash([6 / Z, 4 / Z]); lctx.strokeStyle = '#1f5eff'; lctx.lineWidth = 1.5 / Z; lctx.beginPath(); cur.p.forEach((q, i) => i ? lctx.lineTo(q[0], q[1] + top) : lctx.moveTo(q[0], q[1] + top)); lctx.closePath(); lctx.stroke(); lctx.setLineDash([]); return; }
      strokePath(lctx, cur.s, top);
    }
    let penAt = 0, penDown = false, penSeen = false;   // Handballen-Erkennung: Stiftzeitpunkt merken
    lv.addEventListener('pointerdown', e => {
      if (!isDraw(e)) return;
      e.preventDefault(); try { lv.setPointerCapture(e.pointerId); } catch (_) {}
      if (e.pointerType === 'pen') { penDown = true; penSeen = true; penAt = performance.now(); palmGuard(); }
      cancelAnimationFrame(inertia);
      const [x, y, pr, pg] = local(e); const before = snap();
      if (tool === 'erase') { cur = { mode: 'erase', pg, before }; cur.changed = eraseAt(x, y, pg); return; }
      if (tool === 'lasso') {
        if (sel && sel.pg === pg && sel.box && x > sel.box[0] - 10 && x < sel.box[2] + 10 && y > sel.box[1] - 10 && y < sel.box[3] + 10) { cur = { mode: 'move', pg, before, last: [x, y] }; return; }
        sel = null; cur = { mode: 'lasso', pg, p: [[x, y]] }; schedule(); return;
      }
      if (sel) { sel = null; schedule(); }
      cur = { mode: 'draw', pg, before, s: { t: tool, c: color, w: width, p: [[x, y, pr]] } };
      drawLive();
    });
    lv.addEventListener('pointermove', e => {
      if (!cur || !isDraw(e)) return; e.preventDefault();
      const ce = e.getCoalescedEvents ? e.getCoalescedEvents() : []; const evs = ce.length ? ce : [e];
      if (cur.mode === 'erase') { for (const ev of evs) { const [x, y] = local(ev); if (eraseAt(x, y, cur.pg)) cur.changed = true; } return; }
      if (cur.mode === 'move') { const [x, y] = local(e); const dx = x - cur.last[0], dy = y - cur.last[1]; cur.last = [x, y]; sel.idx.forEach(k => pages[cur.pg][k].p.forEach(q => { q[0] += dx; q[1] += dy; })); sel.box = bbox(cur.pg, sel.idx); cur.moved = true; schedule(); return; }
      if (cur.mode === 'lasso') { for (const ev of evs) { const [x, y] = local(ev); cur.p.push([x, y]); } drawLive(); return; }
      if (cur.straight) { const [x, y, pr] = local(e); cur.s.p = [cur.s.p[0], [x, y, pr]]; drawLive(); return; }
      let moved = false;
      for (const ev of evs) { const [x, y, pr] = local(ev); const l = cur.s.p[cur.s.p.length - 1]; if (Math.hypot(x - l[0], y - l[1]) > .4 / Z) { cur.s.p.push([x, y, pr]); moved = true; } }
      if (moved) { clearTimeout(holdT); holdT = setTimeout(straighten, 550); }
      // Apple Pencil: vorhergesagte Punkte nur vorläufig mitzeichnen (fühlt sich direkter an)
      const pe = e.getPredictedEvents ? e.getPredictedEvents() : [];
      pred = pe.length && cur.s.t !== 'marker' ? pe.slice(-2).map(local) : [];
      drawLiveInc();
    });
    function straighten() {
      if (!cur || cur.mode !== 'draw' || cur.s.t === 'marker') return;
      const p = cur.s.p; if (p.length < 4) return;
      const a = p[0], b = p[p.length - 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 40) return;
      // nur wenn der Strich schon fast gerade war (Schrift wird nie begradigt)
      const dev = Math.max(...p.map(q => Math.abs((b[0] - a[0]) * (a[1] - q[1]) - (a[0] - q[0]) * (b[1] - a[1])) / L));
      if (dev > Math.max(8, L * .12)) return;
      cur.straight = true; cur.s.p = [a, b]; drawLive();
    }
    const finish = () => {
      clearTimeout(holdT); if (!cur) return;
      if (cur.mode === 'draw') { if (cur.straight) cur.s.p = cur.s.p.map(q => [q[0], q[1], .5]); pages[cur.pg].push(cur.s); commit(cur.before); }
      else if (cur.mode === 'erase' && cur.changed) commit(cur.before);
      else if (cur.mode === 'move' && cur.moved) commit(cur.before);
      else if (cur.mode === 'lasso' && cur.p.length > 3) {
        const idx = []; pages[cur.pg].forEach((s, k) => { const inside = s.p.filter(q => inPoly(q[0], q[1], cur.p)).length; if (inside >= s.p.length * .6) idx.push(k); });
        sel = idx.length ? { pg: cur.pg, idx, box: bbox(cur.pg, idx) } : null;
      }
      cur = null; pred = []; render(); clearLive();   // erst Grundebene neu, dann Live-Ebene leeren (kein Flackern)
    };
    lv.addEventListener('pointerup', e => { if (isDraw(e)) { if (e.pointerType === 'pen') { penDown = false; penAt = performance.now(); } finish(); } });
    lv.addEventListener('pointercancel', e => { if (isDraw(e)) { if (e.pointerType === 'pen') { penDown = false; penAt = performance.now(); } finish(); } });

    /* ---------- Finger ---------- */
    let tg = null, vel = [0, 0], lastT = 0, lastP = null, inertia = 0, palm = false;
    const pts = t => [...t].filter(x => x.touchType !== 'stylus').map(x => [x.clientX, x.clientY]);
    // Handballen: Finger, die während des Schreibens oder direkt danach aufsetzen, werden ignoriert.
    // (Keine Erkennung über die Auflagefläche – auf dem iPad melden normale Finger teils große Werte, das blockierte das Zoomen.)
    const penRecent = () => penDown || performance.now() - penAt < 450;
    // Stift kommt, während der Handballen schon liegt: Verschieben/Zoomen rückgängig machen und Finger bis zum Abheben ignorieren
    function palmGuard() { if (tg) { ox = tg.ox; oy = tg.oy; Z = tg.Z; clampView(); schedule(); palm = true; } tg = null; cancelAnimationFrame(inertia); }
    lv.addEventListener('touchstart', e => {
      e.preventDefault();
      if ([...e.changedTouches].some(t => t.touchType === 'stylus') || cur) return;
      if (palm || penRecent()) { if (tg) palmGuard(); palm = true; return; }
      const p = pts(e.touches); cancelAnimationFrame(inertia); vel = [0, 0];
      const maxN = Math.max(tg ? tg.maxN : 0, p.length);
      tg = { n: p.length, start: tg ? tg.start : performance.now(), p0: p, ox, oy, Z, moved: tg ? tg.moved : false, maxN };
      if (p.length >= 2) { tg.d0 = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]); const r = lv.getBoundingClientRect(); tg.m0 = [(p[0][0] + p[1][0]) / 2 - r.left, (p[0][1] + p[1][1]) / 2 - r.top]; }
    }, { passive: false });
    lv.addEventListener('touchmove', e => {
      e.preventDefault();
      if (!tg || cur || palm) return;
      const p = pts(e.touches); const now = performance.now();
      if (p.length === 1 && tg.n === 1) {
        const dx = p[0][0] - tg.p0[0][0], dy = p[0][1] - tg.p0[0][1];
        if (Math.hypot(dx, dy) > 6) tg.moved = true;
        ox = tg.ox - dx / Z; oy = tg.oy - dy / Z; clampView(); schedule();
        if (lastP) { const dt = Math.max(1, now - lastT); vel = [(p[0][0] - lastP[0]) / dt, (p[0][1] - lastP[1]) / dt]; }
        lastP = p[0]; lastT = now;
      } else if (p.length >= 2 && tg.d0) {
        const d = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]); const r = lv.getBoundingClientRect();
        const m = [(p[0][0] + p[1][0]) / 2 - r.left, (p[0][1] + p[1][1]) / 2 - r.top];
        if (Math.abs(d - tg.d0) > 8 || Math.hypot(m[0] - tg.m0[0], m[1] - tg.m0[1]) > 8) tg.moved = true;
        const wx = tg.m0[0] / tg.Z + tg.ox, wy = tg.m0[1] / tg.Z + tg.oy;
        Z = Math.min(4, Math.max(.35, tg.Z * d / tg.d0)); ox = wx - m[0] / Z; oy = wy - m[1] / Z; clampView(); schedule();
      }
    }, { passive: false });
    lv.addEventListener('touchend', e => {
      e.preventDefault();
      if (palm) { if (![...e.touches].some(t => t.touchType !== 'stylus')) palm = false; tg = null; return; }
      if (!tg) return;
      if (e.touches.length === 0) {
        const dt = performance.now() - tg.start;
        // Tipp-Gesten nur, wenn kein Stift in der Nähe war (Handballen löst sonst „Rückgängig“ aus)
        if (!tg.moved && dt < 300 && !penRecent() && performance.now() - penAt > 1000) { if (tg.maxN === 2) doUndo(); else if (tg.maxN === 3) doRedo(); }
        if (tg.n === 1 && tg.moved && Math.hypot(vel[0], vel[1]) > .3) {
          let [vx, vy] = vel; const step = () => { vx *= .94; vy *= .94; ox -= vx * 16 / Z; oy -= vy * 16 / Z; clampView(); render(); if (Math.hypot(vx, vy) > .02) inertia = requestAnimationFrame(step); };
          inertia = requestAnimationFrame(step);
        }
        if (tg.Z !== Z) saveView();
        tg = null; lastP = null;
      } else { const p = pts(e.touches); Object.assign(tg, { n: p.length, p0: p, ox, oy, Z, d0: p.length >= 2 ? Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]) : 0 }); if (p.length >= 2) { const r = lv.getBoundingClientRect(); tg.m0 = [(p[0][0] + p[1][0]) / 2 - r.left, (p[0][1] + p[1][1]) / 2 - r.top]; } lastP = null; }
    }, { passive: false });
    lv.addEventListener('touchcancel', () => { tg = null; palm = false; });
    lv.addEventListener('wheel', e => {
      e.preventDefault();
      if (e.ctrlKey) { const r = lv.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top; const wx = mx / Z + ox, wy = my / Z + oy; Z = Math.min(4, Math.max(.35, Z * Math.exp(-e.deltaY / 300))); ox = wx - mx / Z; oy = wy - my / Z; saveView(); }
      else { ox += e.deltaX / Z; oy += e.deltaY / Z; }
      clampView(); schedule();
    }, { passive: false });
    let mdrag = null;
    lv.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && !o.allowMouse) { mdrag = [e.clientX, e.clientY, ox, oy]; try { lv.setPointerCapture(e.pointerId); } catch (_) {} } });
    lv.addEventListener('pointermove', e => { if (mdrag && e.pointerType === 'mouse') { ox = mdrag[2] - (e.clientX - mdrag[0]) / Z; oy = mdrag[3] - (e.clientY - mdrag[1]) / Z; clampView(); schedule(); } });
    lv.addEventListener('pointerup', e => { if (e.pointerType === 'mouse') mdrag = null; });

    /* ---------- Werkzeugleiste ---------- */
    function zoomBy(f) { const mx = W / 2, my = H / 2; const wx = mx / Z + ox, wy = my / Z + oy; Z = Math.min(4, Math.max(.35, Z * f)); ox = wx - mx / Z; oy = wy - my / Z; clampView(); saveView(); schedule(); }
    bar.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const on = () => { b.parentElement.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); };
      if (b.dataset.c) { color = b.dataset.c; on(); if (tool !== 'pen' && tool !== 'marker') { tool = 'pen'; bar.querySelectorAll('[data-t]').forEach(x => x.classList.toggle('on', x.dataset.t === 'pen')); } }
      else if (b.dataset.w) { width = +b.dataset.w; on(); }
      else if (b.dataset.t) { tool = b.dataset.t; on(); if (tool !== 'lasso') { sel = null; schedule(); } }
      else if (b.dataset.a === 'undo') doUndo();
      else if (b.dataset.a === 'redo') doRedo();
      else if (b.dataset.a === 'zin') zoomBy(1.25);
      else if (b.dataset.a === 'zout') zoomBy(.8);
      else if (b.dataset.a === 'fit') { Z = Math.max(.35, Math.min(2, (W - 16) / PW)); clampView(); saveView(); schedule(); }
      else if (b.dataset.a === 'add') { const before = snap(); pages.push([]); commit(before); oy = pageTop(pages.length - 1) - 10; clampView(); schedule(); }
      else if (b.dataset.a === 'clear') { const pg = pageAt(oy + H / Z / 2); if (!pages[pg].length) return; const before = snap(); pages[pg] = []; sel = null; commit(before); schedule(); if (window.AP2Toast) AP2Toast('Seite geleert – mit ↶ rückgängig machen.'); }
      else if (b.dataset.a === 'seldel' && sel) { const before = snap(); pages[sel.pg] = pages[sel.pg].filter((_, k) => !sel.idx.includes(k)); sel = null; commit(before); schedule(); }
    });
    const onKey = e => { if (!(e.ctrlKey || e.metaKey) || e.target.matches('input,textarea')) return; if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); doRedo(); } };
    document.addEventListener('keydown', onKey);

    const hint = host.querySelector('.pad-hint'); setTimeout(() => hint && hint.classList.add('off'), 6000);
    const ro = new ResizeObserver(resize); ro.observe(wrap); resize();
    return { destroy() { ro.disconnect(); document.removeEventListener('keydown', onKey); cancelAnimationFrame(inertia); }, get pages() { return pages; } };
  }
  /* Rechenpapier als Bild für die KI: alle beschriebenen Seiten untereinander, auf die Schrift zugeschnitten, weißer Grund.
     Gibt base64-JPEG (ohne Präfix) zurück oder null, wenn nichts geschrieben ist. */
  function exportInk(pages, maxW) {
    const segs = [];
    (pages || []).forEach(pg => {
      const ss = (pg || []).filter(s => s && s.p && s.p.length); if (!ss.length) return;
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      ss.forEach(s => s.p.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }));
      const m = 18; segs.push({ ss, x0: Math.max(0, x0 - m), y0: Math.max(0, y0 - m), x1: Math.min(PW, x1 + m), y1: y1 + m });
    });
    if (!segs.length) return null;
    const lw = Math.max(...segs.map(g => g.x1 - g.x0)), lh = segs.reduce((a, g) => a + (g.y1 - g.y0), 0) + 14 * (segs.length - 1);
    const sc = Math.min(2, (maxW || 1100) / lw, 2400 / lh);
    const c = document.createElement('canvas'); c.width = Math.ceil(lw * sc); c.height = Math.ceil(lh * sc);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    let off = 0;
    segs.forEach((g, i) => {
      if (i) { x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = '#c8d0e0'; x.fillRect(0, Math.round((off - 7) * sc), c.width, 2); }
      x.setTransform(sc, 0, 0, sc, -g.x0 * sc, (off - g.y0) * sc);
      g.ss.forEach(s => {
        const p = s.p; x.strokeStyle = s.c; x.globalAlpha = s.t === 'marker' ? .3 : 1; x.lineCap = 'round'; x.lineJoin = 'round';
        x.lineWidth = s.t === 'marker' ? s.w * 6 : Math.max(1.6, s.w * 1.1);
        x.beginPath(); x.moveTo(p[0][0], p[0][1]); for (let k = 1; k < p.length; k++) x.lineTo(p[k][0], p[k][1]); if (p.length === 1) x.lineTo(p[0][0] + .1, p[0][1]); x.stroke();
      });
      x.globalAlpha = 1; off += g.y1 - g.y0 + 14;
    });
    return c.toDataURL('image/jpeg', 0.82).split(',')[1];
  }
  window.AP2Pad = { createPad, pinch, exportInk };
})();
