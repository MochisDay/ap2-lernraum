/* Formelzeichen-Leiste: erscheint bei jedem Text-Eingabefeld (PC, iPad, Handy) und fügt Zeichen an der Cursorposition ein. */
(function () {
  'use strict';
  const GROUPS = [
    ['Einheiten', ['Ω', 'kΩ', 'MΩ', 'µ', 'mm²', '°C', 'K', '%', 'min⁻¹', 'kWh', 'var', 'VA', 'lm', 'lx']],
    ['Griechisch', ['φ', 'cos φ', 'η', 'ϑ', 'Δ', 'π', 'ω', 'ρ', 'γ', 'κ', 'α', 'λ', 'Φ', 'τ']],
    ['Rechnen', ['·', '/', '√', '√3', '²', '³', '⁻¹', '≈', '≤', '≥', '≠', '±', '→', '⇒', '∑', '∞']],
    ['Indizes', ['₀', '₁', '₂', '₃', 'ₙ', '_N', '_b', '_z', '_zu', '_ab', '_L', '_k']]
  ];
  let bar = null, target = null, grp = 0, hideT = null;
  const okField = el => el && ((el.tagName === 'TEXTAREA') || (el.tagName === 'INPUT' && /^(text|search|)$/.test(el.type || ''))) && !el.disabled && !el.readOnly && !el.closest('.login');
  const collapsed = () => { try { return localStorage.getItem('ap2.sym') === '0'; } catch (_) { return false; } };
  function build() {
    bar = document.createElement('div'); bar.className = 'symbar'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Formelzeichen');
    document.body.appendChild(bar);
    bar.addEventListener('pointerdown', e => e.preventDefault()); // Fokus im Feld behalten
    bar.addEventListener('mousedown', e => e.preventDefault());
    bar.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.g != null) { grp = +b.dataset.g; draw(); return; }
      if (b.dataset.t) { try { localStorage.setItem('ap2.sym', collapsed() ? '1' : '0'); } catch (_) {} draw(); place(); return; }
      if (b.dataset.s != null && target) insert(b.dataset.s);
    });
  }
  function draw() {
    if (collapsed()) { bar.innerHTML = '<button class="sym-t" data-t="1" title="Formelzeichen einblenden">Ω √ φ</button>'; bar.classList.add('mini'); return; }
    bar.classList.remove('mini');
    bar.innerHTML = `<div class="sym-g">${GROUPS.map((g, i) => `<button data-g="${i}" class="${i === grp ? 'on' : ''}">${g[0]}</button>`).join('')}<button class="sym-t" data-t="1" title="Ausblenden">▾</button></div>
      <div class="sym-k">${GROUPS[grp][1].map(s => `<button data-s="${s}">${s.replace(/^_/, '')}${s[0] === '_' ? '' : ''}</button>`).join('')}</div>`;
    bar.querySelectorAll('.sym-k button').forEach(b => { if (b.dataset.s[0] === '_') b.innerHTML = 'x<sub>' + b.dataset.s.slice(1) + '</sub>'; });
  }
  function insert(s) {
    const el = target; if (!el || !el.isConnected) return;
    let txt = s;
    if (s === 'cos φ') txt = 'cos φ';
    const a = el.selectionStart ?? el.value.length, z = el.selectionEnd ?? a;
    // Einheiten mit Leerzeichen absetzen, wenn direkt nach einer Zahl
    if (/^(kΩ|MΩ|Ω|mm²|°C|K|%|kWh|var|VA|lm|lx|min⁻¹)$/.test(s) && /\d$/.test(el.value.slice(0, a))) txt = ' ' + s;
    el.setRangeText(txt, a, z, 'end');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function place() {
    if (!bar) return;
    const vv = window.visualViewport;
    const kb = vv ? Math.max(0, window.innerHeight - (vv.height + vv.offsetTop)) : 0;
    bar.style.bottom = kb + 'px';
    document.documentElement.style.setProperty('--symh', (bar.classList.contains('on') && !bar.classList.contains('mini') ? bar.offsetHeight + kb : kb) + 'px');
  }
  document.addEventListener('focusin', e => {
    if (!okField(e.target)) return;
    clearTimeout(hideT); target = e.target;
    if (!bar) build(); draw(); bar.classList.add('on'); document.body.classList.add('sym-on'); place(); requestAnimationFrame(place);
  });
  document.addEventListener('focusout', () => { hideT = setTimeout(() => { if (!okField(document.activeElement)) { bar && bar.classList.remove('on'); document.body.classList.remove('sym-on'); target = null; } }, 150); });
  if (window.visualViewport) { visualViewport.addEventListener('resize', place); visualViewport.addEventListener('scroll', place); }
  window.AP2Symbols = { GROUPS };
})();
