/* Auf der Originalaufgabe schreiben (z. B. Schaltbild ergänzen, Tabelle ausfüllen).
   Zeichenebene über dem Aufgabenbild; Koordinaten relativ zur Bildbreite gespeichert, damit Zoom/Drehen nichts verschiebt.
   Stift (und Maus) zeichnet, Finger scrollen/zoomen weiter – außer „Finger zeichnet“ ist eingeschaltet (Handy ohne Stift). */
(function () {
  'use strict';
  const COLORS = ['#c81e1e', '#1d4ed8', '#111827', '#15803d'];

  function attach(scroller, img, o) {
    let strokes = JSON.parse(JSON.stringify(o.strokes || []));
    let on = false, color = COLORS[0], tool = 'pen', finger = false, cur = null;
    const undo = [];
    scroller.style.position = 'relative';
    const cv = document.createElement('canvas'); cv.className = 'anno-cv';
    scroller.appendChild(cv);
    const ctx = cv.getContext('2d');   // kein „desynchronized“: zeichnet auf manchen Android-Tablets schwarz
    let W = 1, H = 1, dpr = 1;

    function sync() {
      if (!img.complete || !img.offsetWidth) return;
      W = img.offsetWidth; H = img.offsetHeight;
      Object.assign(cv.style, { left: img.offsetLeft + 'px', top: img.offsetTop + 'px', width: W + 'px', height: H + 'px' });
      dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(12e6 / (W * H)));   // Leinwand nicht zu groß (iPad-Grenze)
      const cw = Math.round(W * dpr), ch = Math.round(H * dpr);
      if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
      draw();
    }
    const lw = s => Math.max(1, s.w * W / 1000);
    function path(c, s) {
      const p = s.p; c.strokeStyle = s.c; c.lineWidth = lw(s); c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(p[0][0] * W, p[0][1] * W);
      if (p.length === 1) c.lineTo(p[0][0] * W + .1, p[0][1] * W);
      for (let i = 1; i < p.length - 1; i++) { const mx = (p[i][0] + p[i + 1][0]) / 2 * W, my = (p[i][1] + p[i + 1][1]) / 2 * W; c.quadraticCurveTo(p[i][0] * W, p[i][1] * W, mx, my); }
      if (p.length > 1) { const l = p[p.length - 1]; c.lineTo(l[0] * W, l[1] * W); }
      c.stroke();
    }
    // Leere Ebene ausblenden, damit sie das Aufgabenbild nie verdecken kann
    const vis = () => { cv.style.visibility = on || cur || strokes.length ? 'visible' : 'hidden'; };
    function draw() {
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      strokes.forEach(s => path(ctx, s)); if (cur && cur.p.length) path(ctx, cur);
      vis();
    }
    const pt = e => { const r = cv.getBoundingClientRect(); return [Math.round((e.clientX - r.left) / r.width * 1e4) / 1e4, Math.round((e.clientY - r.top) / r.width * 1e4) / 1e4]; };
    const canDraw = e => on && (e.pointerType === 'pen' || e.pointerType === 'mouse' || (finger && e.pointerType === 'touch'));
    const changed = () => o.onChange(strokes);
    function eraseAt(x, y) {
      const r = 12 / W; const n = strokes.length;
      strokes = strokes.filter(s => !s.p.some(q => Math.hypot(q[0] - x, q[1] - y) < r + lw(s) / W / 2));
      return strokes.length !== n;
    }
    cv.addEventListener('pointerdown', e => {
      if (!canDraw(e)) return;
      e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (_) {}
      const [x, y] = pt(e); undo.push(JSON.stringify(strokes)); if (undo.length > 50) undo.shift();
      if (tool === 'erase') { cur = { erase: true, hit: eraseAt(x, y) }; if (cur.hit) draw(); return; }
      cur = { c: color, w: 3.4, p: [[x, y]] }; draw();
    });
    cv.addEventListener('pointermove', e => {
      if (!cur || !canDraw(e)) return; e.preventDefault();
      const ce = e.getCoalescedEvents ? e.getCoalescedEvents() : []; const evs = ce.length ? ce : [e];
      if (cur.erase) { evs.forEach(ev => { const [x, y] = pt(ev); if (eraseAt(x, y)) cur.hit = true; }); if (cur.hit) draw(); return; }
      const before = cur.p.length;
      evs.forEach(ev => { const q = pt(ev), l = cur.p[cur.p.length - 1]; if (Math.hypot(q[0] - l[0], q[1] - l[1]) * W > .6) cur.p.push(q); });
      if (cur.p.length > before) {   // nur das neue Stück zeichnen
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.strokeStyle = cur.c; ctx.lineWidth = lw(cur); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); const a = cur.p[before - 1]; ctx.moveTo(a[0] * W, a[1] * W); for (let i = before; i < cur.p.length; i++) ctx.lineTo(cur.p[i][0] * W, cur.p[i][1] * W); ctx.stroke();
      }
    });
    const end = e => {
      if (!cur) return;
      if (cur.erase) { if (cur.hit) changed(); else undo.pop(); }
      else { strokes.push(cur); changed(); }
      cur = null; draw();
    };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    // Apple Pencil: Scrollen verhindern, solange gezeichnet wird; Finger scrollen normal
    cv.addEventListener('touchstart', e => { if (on && ([...e.changedTouches].some(t => t.touchType === 'stylus') || (finger && e.touches.length === 1))) e.preventDefault(); }, { passive: false });
    cv.addEventListener('touchmove', e => { if (on && ([...e.changedTouches].some(t => t.touchType === 'stylus') || (finger && e.touches.length === 1))) e.preventDefault(); }, { passive: false });

    const ro = 'ResizeObserver' in window ? new ResizeObserver(() => sync()) : null; if (ro) ro.observe(img);
    img.addEventListener('load', sync);
    sync();
    function setMode(v) { on = v; cv.classList.toggle('on', on); vis(); cv.style.touchAction = on && finger ? 'none' : 'pan-x pan-y'; }
    return {
      sync, setMode, isOn: () => on, count: () => strokes.length,
      setColor(c) { color = c; tool = 'pen'; }, setTool(t) { tool = t; },
      setFinger(v) { finger = v; setMode(on); },
      undo() { if (!undo.length) return; strokes = JSON.parse(undo.pop()); draw(); changed(); },
      clear() { if (!strokes.length) return; undo.push(JSON.stringify(strokes)); strokes = []; draw(); changed(); },
      destroy() { if (ro) ro.disconnect(); cv.remove(); }
    };
  }

  // Aufgabenbild mit Eintragungen als JPEG (für die KI); optional Rechenpapier darunter anhängen
  async function exportWith(imgSrc, strokes, inkB64) {
    const hasA = strokes && strokes.length;
    if (!hasA) return inkB64 || null;
    const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = imgSrc; });
    const W = Math.min(1100, im.naturalWidth), H = Math.round(im.naturalHeight * W / im.naturalWidth);
    let ink = null; if (inkB64) ink = await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = 'data:image/jpeg;base64,' + inkB64; });
    const ih = ink ? Math.round(ink.naturalHeight * W / ink.naturalWidth) : 0;
    const c = document.createElement('canvas'); c.width = W; c.height = Math.min(4000, H + (ink ? ih + 16 : 0));
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    x.drawImage(im, 0, 0, W, H);
    strokes.forEach(s => {
      const p = s.p; x.strokeStyle = s.c; x.lineWidth = Math.max(1.5, s.w * W / 1000); x.lineCap = 'round'; x.lineJoin = 'round';
      x.beginPath(); x.moveTo(p[0][0] * W, p[0][1] * W); if (p.length === 1) x.lineTo(p[0][0] * W + .1, p[0][1] * W); for (let i = 1; i < p.length; i++) x.lineTo(p[i][0] * W, p[i][1] * W); x.stroke();
    });
    if (ink) { x.fillStyle = '#9aa3b2'; x.fillRect(0, H + 6, W, 3); x.drawImage(ink, 0, H + 16, W, ih); }
    return c.toDataURL('image/jpeg', 0.8).split(',')[1];
  }

  window.AP2Anno = { attach, exportWith, COLORS };
})();
