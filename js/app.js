/* AP2 Lernraum – Oberfläche. Originalaufgaben werden ausschließlich als Originalbild gezeigt (Entscheidung 6A). */
(function () {
  'use strict';
  const C = AP2Core, S = AP2Store;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PART_SHORT = { SE_A: 'Systementwurf A', SE_B: 'Systementwurf B', FUSA_A: 'FuSA A', FUSA_B: 'FuSA B', WISO: 'WiSo', WISO_U: 'WiSo offen', LOES: 'Lösungen' };
  const OPEN_PARTS = ['SE_B', 'FUSA_B', 'WISO_U'];
  const MC_PARTS = ['SE_A', 'FUSA_A', 'WISO'];
  const NUM = ['①', '②', '③', '④', '⑤'];
  let REG, DOCS, TASKS = {}, st, pad = null, anno = null, tick = null, ROUTE = '#/', IMGZ = 1;
  function go(h) { ROUTE = h; try { if (window.top === window && location.hash !== h) history.replaceState(null, '', h); } catch (_) {} route(); }
  /* Bilder: lokal direkt als Datei, gehostet aus gepackten Dateien (data/pack) */
  let PACK = null; const packCache = new Map(); const urlCache = new Map();
  function packName(p) { const m = p.match(/data\/img\/(tasks|pages)\/(.+)\.webp$/); if (!m) return null; const doc = m[1] === 'tasks' ? m[2].replace(/_(\d\d|U\d)$/, '') : m[2].replace(/-\d\d$/, ''); return (m[1] === 'tasks' ? 't_' : 'p_') + doc; }
  async function imgURL(p) {
    if (REMOTE) { if (!urlCache.has(p)) urlCache.set(p, AP2Sync.fetchData(p, true).then(b => URL.createObjectURL(b)).catch(e => { urlCache.delete(p); if (e.status === 401) AP2Toast(e.message); return ''; })); return urlCache.get(p); }
    if (!PACK) return p; if (urlCache.has(p)) return urlCache.get(p);
    const n = packName(p); if (!n) return p;
    if (!packCache.has(n)) packCache.set(n, fetch('data/pack/' + n + '.json').then(r => r.json()));
    const pk = await packCache.get(n); const b64 = pk[p.split('/').pop()]; if (!b64) return p;
    const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const u = URL.createObjectURL(new Blob([u8], { type: 'image/webp' })); urlCache.set(p, u); return u;
  }
  function hydrate(root) { $$('img[data-src]', root || document).forEach(async im => { const s = im.dataset.src; im.removeAttribute('data-src'); im.src = await imgURL(s); }); }
  /* In-Seite-Dialoge statt prompt/confirm (die im eingebetteten Rahmen blockiert sind) */
  function ask(o) {
    return new Promise(res => {
      const d = document.createElement('div'); d.className = 'modal';
      d.innerHTML = `<div class="modal-b card"><h2>${esc(o.title || '')}</h2>${o.text ? `<p>${o.text}</p>` : ''}${o.input ? `<input id="mIn" class="inp" type="${o.input}" value="${esc(o.value || '')}">` : ''}${o.area ? `<textarea id="mIn" class="inp" rows="${o.rows || 4}" ${o.readonly ? 'readonly' : ''}>${esc(o.value || '')}</textarea>` : ''}
        <div class="actions">${(o.buttons || [['OK', true, 'primary'], ['Abbrechen', false, 'ghost']]).map((b, i) => `<button class="btn ${b[2] || ''}" data-i="${i}">${esc(b[0])}</button>`).join('')}</div></div>`;
      document.body.appendChild(d); const inp = $('#mIn', d); if (inp) { inp.focus(); if (o.readonly) inp.select(); }
      d.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; const v = (o.buttons || [['OK', true], ['', false]])[+b.dataset.i][1]; if (v === 'copy') { try { navigator.clipboard.writeText(inp.value).then(() => AP2Toast('Kopiert.'), () => { inp.select(); AP2Toast('Text markiert – bitte kopieren.'); }); } catch (_) { inp.select(); } return; } d.remove(); res(v === true && inp ? inp.value : v); });
    });
  }
  window.AP2Ask = ask;
  let SWREG = null;
  const APPV = 42;   // bei jeder Veröffentlichung zusammen mit sw.js erhöhen
  // Merken: eigene Markierung (z. B. „richtig, aber geraten“) – landet im Fehlerheft, bis man sie wieder entfernt
  // Neues, leeres Rechenpapier und Aufgabenblatt für einen neuen Versuch; das Alte wird archiviert (nicht gelöscht)
  function freshSheet(id) {
    const ink = (st.ink[id] || []).some(pg => pg && pg.length), an = st.anno && st.anno[id] && st.anno[id].length;
    if (!ink && !an) return;
    st.inkArchive = st.inkArchive || {}; st.inkArchive[id] = { ink: ink ? st.ink[id] : null, anno: an ? st.anno[id] : null, at: Date.now() };
    st.ink[id] = [[]]; if (st.anno) delete st.anno[id]; touchInk(id);
  }
  const hasAnno = id => !!(st.anno && st.anno[id] && st.anno[id].length);
  const hasWork = id => hasAnno(id) || (st.ink[id] || []).some(pg => pg && pg.length);
  // Für die KI: Rechenpapier, und wenn auf der Aufgabe geschrieben wurde, die Aufgabe mit Eintragungen obendrauf
  async function inkFor(t) {
    const ink = AP2Pad.exportInk(st.ink[t.id]); if (!hasAnno(t.id)) return ink;
    try { const im = $('#origImg'); const src = im && im.src && !im.dataset.src ? im.src : await imgURL(t.image); return await AP2Anno.exportWith(src, st.anno[t.id], ink); } catch (_) { return ink; }
  }
  // Gelöschtes merken, damit es beim Abgleich mit einem anderen Gerät nicht zurückkommt
  const gone = (k, id) => { st.gone = st.gone || {}; st.gone[k + ':' + id] = Date.now(); };
  const touchInk = id => { st.inkAt = st.inkAt || {}; st.inkAt[id] = Date.now(); };
  const isMarked = id => !!(st.marked && st.marked[id]);
  function toggleMark(id) {
    st.marked = st.marked || {};
    if (st.marked[id]) { delete st.marked[id]; gone('marked', id); } else st.marked[id] = Date.now();
    S.save(true);
    const on = isMarked(id);
    $$(`[data-mark="${id}"]`).forEach(b => { b.classList.toggle('on', on); const sp = $('span', b); if (sp) sp.textContent = b.dataset.long ? (on ? 'Gemerkt fürs Fehlerheft' : 'Geraten? Merken') : (on ? 'Gemerkt' : 'Merken'); });
    AP2Toast(on ? 'Gemerkt – die Aufgabe ist jetzt im Fehlerheft.' : 'Markierung entfernt.');
    if (!on && ROUTE === '#/mistakes') $$(`.resume [data-mark="${id}"]`).forEach(b => b.closest('.resume').remove());
  }
  document.addEventListener('click', async e => { const b = e.target.closest('[data-fresh]'); if (!b) return;
    if (!(await ask({ title: 'Neu beginnen?', text: 'Rechenpapier und Eintragungen auf der Aufgabe werden geleert. Der alte Stand wird archiviert.', buttons: [['Neues Blatt', true, 'primary'], ['Abbrechen', false, 'ghost']] }))) return;
    freshSheet(b.dataset.fresh); S.save(true); route(); });
  document.addEventListener('click', e => { const b = e.target.closest('[data-mark]'); if (b) { e.preventDefault(); toggleMark(b.dataset.mark); } });
  document.addEventListener('click', async e => {
    const d = e.target.closest('[data-sdel]'); if (!d) return;
    if (!(await ask({ title: 'Dieses Training löschen?', text: 'Es verschwindet aus „Weitermachen“. Was du schon beantwortet hast, bleibt in deinem Lernstand.', buttons: [['Löschen', true, 'danger'], ['Abbrechen', false, 'ghost']] }))) return;
    delete st.sessions[d.dataset.sdel]; gone('sessions', d.dataset.sdel); S.save(true); AP2Toast('Training gelöscht.'); go('#/');
  });
  document.addEventListener('click', e => { const b = e.target.closest('[data-back]'); if (b) { e.preventDefault(); go(b.dataset.back); } });

  window.AP2Toast = msg => { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 2600); };

  const periodOrder = p => (2000 + +p.slice(1)) * 10 + (p[0] === 'W' ? 5 : 0); // Winter 21/22 nach Sommer 21
  const periods = () => [...new Set(DOCS.map(d => d.period))].sort((a, b) => periodOrder(b) - periodOrder(a));
  const periodLabel = p => (DOCS.find(d => d.period === p) || {}).periodLabel || p;
  const doc = id => DOCS.find(d => d.id === id);
  const tasksOf = (docId, type) => REG.tasks.filter(t => t.source.docId === docId && (t.type || 'mc') === (type || 'mc')).sort((a, b) => a.number - b.number);
  const gradable = () => C.gradableTasks(REG.tasks);

  // Gehostet (nicht lokal): Login Pflicht, Aufgabendaten kommen geschützt aus dem Supabase-Speicher
  const LOCAL = /^(localhost|127\.0\.0\.1|)$/.test(location.hostname) && !/[?&]remote=1/.test(location.search);
  const LOGIN_REQUIRED = !LOCAL || /[?&]login=1/.test(location.search);
  const REMOTE = !LOCAL;
  function loginScreen() {
    document.body.classList.add('locked');
    $('#main').innerHTML = `<div class="login-wrap"><section class="card form login"><div class="brand big"><span class="logo">AP2</span><div><b>Lernraum</b><small>Elektroniker/-in für Betriebstechnik</small></div></div>
      <p class="muted">Bitte melde dich an. Zugang nur für freigegebene Personen.</p>
      <label for="em">E-Mail</label><input class="inp" id="em" type="email" autocomplete="email">
      <label for="pw">Passwort</label><input class="inp" id="pw" type="password" autocomplete="current-password">
      <div class="actions wrap"><button class="btn primary lg" id="li">Anmelden</button><button class="btn ghost" id="su">Konto anlegen</button></div>
      <button class="link" id="fp">Passwort vergessen?</button><p id="am" class="muted small" role="status"></p></section></div>`;
    const msg = t => $('#am').textContent = t; const val = () => [$('#em').value, $('#pw').value];
    const done = () => { location.replace(location.pathname); };
    $('#li').onclick = async () => { try { msg('Anmelden …'); await AP2Sync.signIn(...val()); done(); } catch (e) { msg(e.message); } };
    $('#pw').addEventListener('keydown', e => { if (e.key === 'Enter') $('#li').click(); });
    $('#su').onclick = async () => { try { msg('Konto wird angelegt …'); const r = await AP2Sync.signUp(...val()); if (r === 'bestaetigen') msg('Konto angelegt. Du kannst dich jetzt mit E-Mail und Passwort anmelden (eine Bestätigungs-E-Mail ist nicht nötig).'); else done(); } catch (e) { msg(e.message); } };
    $('#fp').onclick = async () => { try { await AP2Sync.resetPassword($('#em').value); msg('E-Mail zum Zurücksetzen wurde gesendet.'); } catch (e) { msg(e.message); } };
  }
  // iPad-Safari ignoriert user-scalable=no – Seiten-Zoom per Geste daher hier unterbinden
  ['gesturestart', 'gesturechange'].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));
  async function boot() {
    st = await S.init(); S.autoBackup();
    if (LOGIN_REQUIRED) {
      if (window.AP2Sync) AP2Sync.init();
      const ok = window.AP2Sync && await AP2Sync.ready();
      if (!ok) return loginScreen();
    }
    const j = u => REMOTE ? AP2Sync.fetchData(u) : fetch(u, { credentials: 'same-origin' }).then(x => { if (x.status === 401) throw new Error('Anmeldung abgelaufen – bitte neu anmelden.'); return x.json(); });
    const [r, d] = await Promise.all([j('data/register.json'), j('data/documents.json')]);
    REG = r; DOCS = d.documents; REG.tasks.forEach(t => TASKS[t.id] = t);
    if (!REMOTE) try { const pr = await fetch('data/pack/index.json'); if (pr.ok) PACK = await pr.json(); } catch (_) {}
    if (location.hash.startsWith('#/')) ROUTE = location.hash;
    document.addEventListener('click', e => { const a = e.target.closest('a[href^="#/"]'); if (!a) return; e.preventDefault(); go(a.getAttribute('href')); });
    window.addEventListener('hashchange', () => { if (location.hash.startsWith('#/')) go(location.hash); });
    document.addEventListener('keydown', keys);
    if (window.AP2Sync) {
      AP2Sync.onStatus(s => { renderFoot(); if (LOGIN_REQUIRED && s === 'abgemeldet') location.replace(location.pathname); });
      window.addEventListener('ap2-state-replaced', () => { st = S.get(); AP2Toast('Lernstand mit deinem anderen Gerät abgeglichen.'); route(); });
      if (!LOGIN_REQUIRED) AP2Sync.init();
    }
    renderFoot(); route();
    if (!PACK && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
      // Updates sofort übernehmen: neue Version laden, sobald der neue Service Worker übernimmt (auch in der installierten iPad-App)
      const hadCtl = !!navigator.serviceWorker.controller; let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (!hadCtl || reloading) return; reloading = true; try { S.save(true); } catch (_) {} location.reload(); });
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => { SWREG = reg;
        const check = () => reg.update().catch(() => {});
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
        setInterval(check, 30 * 60e3);
      }).catch(() => {});
    }
  }

  function renderFoot() {
    const g = gradable().length;
    $('#sideFoot').innerHTML = `${syncBadge()}<div class="small">${g} Aufgaben · Stand ${REG.generated}</div>`;
  }
  function syncBadge() {
    const Y = window.AP2Sync; if (!Y) return '';
    const s = Y.status; const p = Y.profile;
    const lab = { abgemeldet: 'Nicht angemeldet – nur lokal', bereit: 'Angemeldet', synchronisiere: 'Synchronisiere …', synchron: 'Synchron', offline: 'Offline – wird später abgeglichen', fehler: 'Sync-Fehler', aus: '' }[s] || s;
    const cls = s === 'synchron' ? 'ok' : s === 'abgemeldet' ? '' : s === 'synchronisiere' || s === 'bereit' ? '' : 'warn';
    return `<a class="pill ${cls}" href="#/settings">${esc(lab)}${p && p.display_name ? ' · ' + esc(p.display_name) : ''}</a>`;
  }

  function route() {
    if (pad) { pad.destroy(); pad = null; }
    if (anno) { anno.destroy(); anno = null; }
    $$('#windows .win, #windows .tutor-panel').forEach(w => w.remove());
    clearInterval(tick); tick = null;
    document.body.classList.remove('bigpad');
    const h = ROUTE.replace(/^#\/?/, '');
    const [name, ...rest] = h.split('/');
    $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.r === (name || 'home')));
    document.body.classList.toggle('focus', ['exam', 'review', 'session', 'duel', 'bexam', 'bcorr'].includes(name));
    $$('#nav a').forEach(a => { if ((name === 'set' && a.dataset.r === 'exams') || (name === 'learn' && a.dataset.r === 'training')) a.classList.add('on'); });
    const m = $('#main');
    const views = { '': home, home, learn: learnView, mistakes, set: setView, training, session, exams, exam, result, review, library, doc: docview, stats, settings, task: taskView, duels, duel: duelPlay, duelr: duelResult, bexam, bcorr, bresult };
    (views[name] || home)(m, rest.map(decodeURIComponent));
    hydrate(m);
    m.scrollTop = 0; m.focus({ preventScroll: true });
  }

  /* ---------- Übersicht ---------- */
  function home(m) {
    const now = Date.now(); const all = gradable();
    const seen = all.filter(t => st.srs[t.id] && st.srs[t.id].seen);
    const due = seen.filter(t => st.srs[t.id].due <= now).length;
    const tot = seen.reduce((a, t) => { const e = st.srs[t.id]; a.f += e.first; a.h += e.hint; a.w += e.wrong; return a; }, { f: 0, h: 0, w: 0 });
    const n = tot.f + tot.h + tot.w;
    const open = Object.values(st.sessions).filter(s => !s.done).sort((a, b) => b.updated - a.updated);
    const exOpen = Object.values(st.exams).filter(e => !e.submitted && !e.set).sort((a, b) => b.started - a.started);
    const setsOpen = Object.values(st.sets || {}).filter(setOpen).sort((a, b) => b.created - a.created);
    const exDone = Object.values(st.exams).filter(e => e.submitted).sort((a, b) => b.submitted - a.submitted).slice(0, 5);
    const bx = Object.values(st.bexams || {}); const bOpen = bx.filter(e => !e.result && !e.set).sort((a, b) => b.started - a.started); const bDone = bx.filter(e => e.result).sort((a, b) => b.result.at - a.result.at).slice(0, 5);
    m.innerHTML = `
      <header class="home-h"><div><h1>${greet()}</h1><p>${all.length} Originalaufgaben aus ${periods().length} Prüfungen, alle mit offizieller IHK-Lösung.</p></div></header>
      <div id="duelHint"></div>
      ${planCard()}
      <nav class="starts">
        <a class="start main" href="#/training">${ic('bolt')}<div><b>Schnelltraining</b><span>Schwächen, Neues und Wiederholungen gemischt</span></div></a>
        <a class="start" href="#/mistakes">${ic('repeat')}<div><b>Fehlerheft</b><span>${(() => { const n = mistakeLists().open.length; return n ? n + (n === 1 ? ' Aufgabe' : ' Aufgaben') + ' zum Wiederholen' : 'Noch keine Fehler'; })()}</span></div></a>
        <a class="start" href="#/exams">${ic('timer')}<div><b>Originalprüfung</b><span>Ganze Prüfung mit Zeit</span></div></a>
        <a class="start" href="#/duels">${ic('duel')}<div><b>Duell</b><span>Gleiche Aufgaben, wer ist besser?</span></div></a>
      </nav>
      <section class="kpis">
        ${kpi('Bearbeitet', `${seen.length}<small>/${all.length}</small>`, 'verschiedene Aufgaben')}
        ${kpi('Fällig', due, 'Wiederholungen jetzt')}
        ${kpi('Sofort richtig', n ? Math.round(100 * tot.f / n) + '%' : '–', `${tot.f} von ${n} Versuchen`)}
        ${kpi('Mit Hinweis', n ? Math.round(100 * tot.h / n) + '%' : '–', `${tot.w} falsch`)}
      </section>
      <div class="grid2">
        <section class="card"><h2>Weitermachen</h2>${setsOpen.map(x => { const i = x.areas.findIndex(a => !a.done); const run = x.areas.find(a => a.started && !a.done); return `<div class="resume"><a class="row" href="#/set/${x.id}"><b>${esc(periodLabel(x.period))} komplett</b><span>${run ? AREAS[x.areas.indexOf(run)].label + ' läuft' : 'Pause vor ' + AREAS[i].label}</span><span class="muted">${x.areas.filter(a => a.done).length}/3 Bereiche</span></a><button class="ib del" data-del="p:${x.id}" aria-label="Löschen" title="Löschen"><svg class="ic"><use href="#i-trash"/></svg></button></div>`; }).join('')}${setsOpen.length || open.length || exOpen.length || bOpen.length ? '' : '<p class="muted">Keine offenen Sitzungen.</p>'}
          ${bOpen.map(e => `<div class="resume"><a class="row" href="#/${e.submitted ? 'bresult' : 'bexam'}/${e.id}"><b>${esc(periodLabel(e.period))} · ${bPartLabel(e.part)}</b><span>${e.submitted ? 'Korrektur offen' : e.strict ? 'Simulation' : 'Übung'}</span><span class="muted">${bProgress(e)}</span></a><button class="ib del" data-del="b:${e.id}" aria-label="Löschen" title="Löschen"><svg class="ic"><use href="#i-trash"/></svg></button></div>`).join('')}
          ${open.map(s => `<div class="resume"><a class="row" href="#/session/${s.id}"><b>${s.pool ? POOL_NAME[s.pool] : s.mistakes ? 'Fehlerheft' : s.topic ? esc((REG.topics || {})[s.topic] || 'Thema') : 'Schnelltraining'}</b><span>${s.idx}/${s.items.length} Aufgaben</span><span class="muted">${new Date(s.updated).toLocaleString('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></a><button class="ib del" data-del="s:${s.id}" aria-label="Löschen" title="Löschen"><svg class="ic"><use href="#i-trash"/></svg></button></div>`).join('')}
          ${exOpen.map(e => `<div class="resume"><a class="row" href="#/exam/${e.id}"><b>${esc(periodLabel(e.period))} · ${PART_SHORT[e.part]}</b><span>${e.strict ? 'Simulation' : 'Übung'}</span><span class="muted">${Object.keys(e.answers).length}/${e.taskIds.length} beantwortet</span></a><button class="ib del" data-del="e:${e.id}" aria-label="Löschen" title="Löschen"><svg class="ic"><use href="#i-trash"/></svg></button></div>`).join('')}
        </section>
        <section class="card"><h2>Stärken &amp; Schwächen</h2>${partBars()}</section>
      </div>
      <section class="card"><h2>Letzte Prüfungen</h2>${bDone.map(e => `<a class="row" href="#/bresult/${e.id}"><b>${esc(periodLabel(e.period))} · ${bPartLabel(e.part)}</b><span>${e.strict ? 'Simulation' : 'Übung'}</span><span class="score">${e.result.pts}/${e.result.max} P · Note ${e.result.note}</span></a>`).join('')}${exDone.length ? exDone.map(e => `<a class="row" href="#/result/${e.id}"><b>${esc(periodLabel(e.period))} · ${PART_SHORT[e.part]}</b><span>${e.strict ? 'Simulation' : 'Übung'}</span><span class="score">${e.score.right}/${e.score.max} · ${e.score.percent}%</span></a>`).join('') : (bDone.length ? '' : '<p class="muted">Noch keine Prüfung abgegeben.</p>')}</section>`;
    duelTeaser();
    $$('[data-del]', m).forEach(b => b.onclick = async () => {
      const [k, id] = b.dataset.del.split(':');
      const what = { s: 'dieses Training', e: 'diese Prüfung', b: 'diese Prüfung', p: 'diese komplette Prüfung' }[k];
      if (!(await ask({ title: `${what[0].toUpperCase() + what.slice(1)} löschen?`, text: 'Es verschwindet aus „Weitermachen“. Was du schon beantwortet hast, bleibt in deinem Lernstand.', buttons: [['Löschen', true, 'danger'], ['Abbrechen', false, 'ghost']] }))) return;
      if (k === 's') { delete st.sessions[id]; gone('sessions', id); } else if (k === 'e') { delete st.exams[id]; gone('exams', id); }
      else if (k === 'p') { const x = (st.sets || {})[id]; if (x) x.areas.forEach(a => { if (a.a) { delete st.exams[a.a]; gone('exams', a.a); } if (a.b && st.bexams) { delete st.bexams[a.b]; gone('bexams', a.b); } }); delete st.sets[id]; gone('sets', id); }
      else if (st.bexams) { delete st.bexams[id]; gone('bexams', id); }
      S.save(true); AP2Toast('Gelöscht.');
      // Nur die Zeile entfernen statt neu zu zeichnen – so bleibt die Seite an der Stelle stehen
      const row = b.closest('.resume'), card = row.parentElement; row.style.transition = 'opacity .2s'; row.style.opacity = '0';
      setTimeout(() => { row.remove(); if (!card.querySelector('.resume')) card.insertAdjacentHTML('beforeend', '<p class="muted">Keine offenen Sitzungen.</p>'); }, 200);
    });
    { const P = planInfo(), d = new Date().toLocaleDateString('sv-SE');   // Tagesziel für die Abend-Erinnerung mitschicken
      if (P && P.phase !== 'done' && (!st.planToday || st.planToday.d !== d || st.planToday.goal !== P.goal)) { st.planToday = { d, goal: P.goal }; S.save(); } }
    const pb = $('#planGo'); if (pb) pb.onclick = () => go('#/training');
    const pw = $('#planWeak'); if (pw) pw.onclick = () => { const P = planInfo(); if (P && P.weak) topicTraining(P.weak); };
  }
  /* ---------- Lernplan bis zum Prüfungstag ---------- */
  const dayKey = ts => { const d = new Date(ts); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };
  function planInfo() {
    const ex = st.settings.examDate; if (!ex) return null;
    const exam = new Date(ex + 'T08:00:00'); const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = Math.round((new Date(ex + 'T00:00:00') - today) / 864e5);
    const all = gradable(); const now = Date.now();
    const unseen = all.filter(t => !(st.srs[t.id] && st.srs[t.id].seen)).length;
    const due = all.filter(t => st.srs[t.id] && st.srs[t.id].seen && st.srs[t.id].due <= now).length;
    const learnDays = Math.max(1, days - 2);                       // die letzten 2 Tage nur Wiederholung
    const goalNew = days > 2 ? Math.ceil(unseen / learnDays) : 0;
    const goal = Math.max(10, Math.min(80, goalNew + Math.min(due, 30)));
    const tk = dayKey(now); const doneToday = st.attempts.filter(a => dayKey(a.at) === tk).length;
    const by = topicStats(); const N = REG.topics || {};
    const weakQ = Object.keys(by).filter(k => by[k].att >= 3).sort((a, b) => by[a].first / by[a].att - by[b].first / by[b].att)[0];
    const weak = weakQ || Object.keys(by).sort((a, b) => by[a].seen / by[a].total - by[b].seen / by[b].total)[0];
    const lastB = Object.values(st.bexams || {}).concat(Object.values(st.exams || {})).map(e => e.started || 0).sort((a, b) => b - a)[0] || 0;
    const phase = days < 0 ? 'done' : days <= 2 ? 'final' : days <= 21 ? 'sim' : 'learn';
    return { weakLabel: weakQ ? 'Schwächstes Thema' : 'Noch kaum geübt', exam, days, unseen, due, goal, goalNew, doneToday, weak, weakName: weak && (N[weak] || weak), simDue: now - lastB > 6 * 864e5, phase };
  }
  const ic = n => `<svg class="ic"><use href="#i-${n}"/></svg>`;
  function greet() { const h = new Date().getHours(); return h < 5 ? 'Noch wach?' : h < 11 ? 'Guten Morgen.' : h < 17 ? 'Hallo.' : h < 22 ? 'Guten Abend.' : 'Noch wach?'; }
  function planCard() {
    const P = planInfo();
    const lcd = (num, unit, top, bot) => `<div class="lcd" role="img" aria-label="${esc(num + ' ' + unit + ', ' + bot)}"><div class="lcd-top"><span>${top}</span><span>AP2</span></div><div class="lcd-num"><span data-ghost="${String(num).replace(/\d/g, '8')}">${num}</span><small>${unit}</small></div><div class="lcd-bot">${bot}</div></div>`;
    if (!P) return `<section class="meter empty"><div class="meter-r"><h2>Wann ist deine Prüfung?</h2><ul><li><span>Trag den Prüfungstag ein. Dann siehst du hier jeden Tag dein Tagesziel bis zur Prüfung.</span></li></ul><div class="actions"><a class="btn primary" href="#/settings">${ic('cal')} Prüfungstag eintragen</a></div></div></section>`;
    if (P.phase === 'done') return `<section class="meter empty"><div class="meter-r"><h2>Prüfung geschafft?</h2><ul><li><span>Der eingetragene Prüfungstag ist vorbei. Für den nächsten Termin einfach ein neues Datum eintragen.</span></li></ul><div class="actions"><a class="btn" href="#/settings">Neues Datum eintragen</a></div></div></section>`;
    const segs = 20, on = Math.min(segs, Math.round(segs * P.doneToday / P.goal));
    const tips = {
      learn: [`<b>${P.goalNew} neue Aufgaben</b> am Tag, dann hast du bis zur Prüfung alle ${P.unseen} offenen einmal gesehen.`, P.due ? `<b>${P.due} Wiederholungen</b> sind fällig.` : '', P.simDue ? 'Diese Woche noch keine Prüfung geschrieben. Einmal pro Woche lohnt sich.' : ''],
      sim: ['Endspurt: ganze Prüfungen unter Zeitdruck schreiben und Schwächen gezielt üben.', P.simDue ? 'Heute passt eine <b>Prüfungssimulation</b>.' : '', P.due ? `<b>${P.due} Wiederholungen</b> sind fällig.` : ''],
      final: ['Letzte Tage: nur noch wiederholen und Fehler anschauen, nichts Neues mehr. Früh schlafen.', P.due ? `<b>${P.due} Wiederholungen</b> sind fällig.` : '']
    }[P.phase].filter(Boolean);
    if (P.weak) tips.push(`${P.weakLabel}: <b>${esc(P.weakName)}</b>`);
    const date = P.exam.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
    return `<section class="meter">
      ${lcd(P.days, P.days === 1 ? 'Tag' : 'Tage', 'bis zur Prüfung', date)}
      <div class="meter-r">
        <div class="goal"><div class="goal-l"><span>Tagesziel${P.doneToday >= P.goal ? ' erreicht' : ''}</span><span><b>${P.doneToday}</b> / ${P.goal}</span></div>
          <div class="segbar" aria-hidden="true">${Array.from({ length: segs }, (_, k) => `<i class="${k < on ? 'on' : ''}"></i>`).join('')}</div></div>
        <ul>${tips.slice(0, 3).map(x => `<li><span>${x}</span></li>`).join('')}</ul>
        <div class="actions wrap">${P.phase === 'learn' || !P.simDue ? `<button class="btn primary" id="planGo">${ic('bolt')} Tagesziel üben</button>` : `<a class="btn primary" href="#/exams">${ic('timer')} Prüfung simulieren</a>`}${P.weak ? `<button class="btn" id="planWeak">${ic('target')} ${esc(P.weakName)}</button>` : ''}</div>
      </div></section>`;
  }
  function duelTeaser() {
    const box = $('#duelHint'); const Y = window.AP2Sync; if (!box || !Y || !Y.session) return;
    Y.duels.list().then(ls => { const my = ls.filter(d => d.status === 'open' && d.my_score == null); if (my.length && $('#duelHint') === box) box.innerHTML = `<a class="banner" href="#/duels"><svg class="ic"><use href="#i-duel"/></svg> ${my.length === 1 ? `${esc(my[0].opp_name)} hat dich zum Duell herausgefordert` : `${my.length} Duelle warten auf dich`} – jetzt spielen →</a>`; }).catch(() => {});
  }
  const kpi = (l, v, s) => `<div class="kpi"><span>${l}</span><b>${v}</b><small>${s}</small></div>`;
  function partBars() {
    const by = C.stats(REG.tasks, st.srs);
    return MC_PARTS.map(p => {
      const b = by[p] || { total: 0, seen: 0, first: 0, attempts: 0 };
      const q = b.attempts ? Math.round(100 * b.first / b.attempts) : 0;
      return `<div class="bar"><div class="bar-l"><b>${PART_SHORT[p]}</b><span class="muted">${b.seen}/${b.total} bearbeitet</span></div><div class="track"><i style="width:${q}%"></i></div><span class="pct">${b.attempts ? q + '%' : '–'}</span></div>`;
    }).join('');
  }

  /* ---------- Alles durcharbeiten: alle unbearbeiteten bzw. alle gemerkten Aufgaben, ohne Anzahl und ohne Zeit ---------- */
  const POOL_NAME = { new: 'Alle unbearbeiteten', marked: 'Alle gemerkten' };
  function poolIds(kind, f) {
    let ts = gradable();
    if (f.parts.length) ts = ts.filter(t => f.parts.includes(t.part));
    if (f.types.length) ts = ts.filter(t => f.types.includes(t.type || 'mc'));
    if (f.periods.length) ts = ts.filter(t => f.periods.includes(t.period));
    if (f.topics.length) ts = ts.filter(t => f.topics.includes(t.topic));
    if (kind === 'new') return C.shuffle(ts.filter(t => !(st.srs[t.id] && st.srs[t.id].seen))).map(t => t.id);
    return ts.filter(t => isMarked(t.id)).sort((a, b) => st.marked[a.id] - st.marked[b.id]).map(t => t.id);   // gemerkte: älteste zuerst
  }
  function startPool(kind, f) {
    const key = JSON.stringify(f);
    const run = Object.values(st.sessions).find(x => !x.done && x.pool === kind && x.poolKey === key);
    if (run) return go('#/session/' + run.id);   // gleiche Auswahl läuft schon → dort weitermachen
    const ids = poolIds(kind, f);
    if (!ids.length) return AP2Toast(kind === 'new' ? 'Mit diesen Filtern hast du schon alles bearbeitet.' : 'Keine gemerkten Aufgaben mit diesen Filtern.');
    const id = 's' + Date.now().toString(36);
    st.sessions[id] = { id, items: ids.map(t => ({ id: t, tries: [], result: null })), idx: 0, created: Date.now(), updated: Date.now(), done: false, endsAt: 0, pool: kind, poolKey: key };
    S.save(true); go('#/session/' + id);
  }
  // Fortschritt: bei langen Durchgängen Balken statt Punkte
  const sessDots = s => s.items.length > 40
    ? `<div class="sprog"><i style="width:${Math.round(100 * s.idx / s.items.length)}%"></i></div>`
    : `<div class="dots">${s.items.map((x, i) => `<i class="${x.result || ''} ${i === s.idx ? 'cur' : ''}"></i>`).join('')}</div>`;

  /* ---------- Schnelltraining ---------- */
  function training(m) {
    const ps = periods();
    m.innerHTML = `<a class="banner learn-banner" href="#/learn">${ic('book')}<span><b>Themen-Einstieg:</b> Leitfaden und Übungsrechnungen mit Lösungsweg – zum Reinkommen, bevor es an die IHK-Aufgaben geht.</span></a><header class="page-h"><h1>Schnelltraining</h1><p>Mix aus Schwächen (40 %), neuen Aufgaben (40 %) und fälligen Wiederholungen (20 %). Nur fachlich belegte Aufgaben.</p></header>
      <section class="card form">
        <label>Anzahl</label><div class="seg big" id="size">${[5, 10, 20].map(n => `<button data-n="${n}" class="${n === (st.settings.sessionSize || 10) ? 'on' : ''}">${n}</button>`).join('')}</div>
        <label>Aufgabenart</label><div class="chips" id="types"><button class="chip on" data-ty="mc">Multiple Choice (Teil A, WiSo)</button><button class="chip" data-ty="open">Offene Aufgaben (Teil B, WiSo U)</button></div>
        <details class="fold"><summary><span>Bereiche</span><span class="fold-v" data-sum="parts"></span><svg class="ic"><use href="#i-right"/></svg></summary><div class="chips" id="parts">${MC_PARTS.concat(OPEN_PARTS).map(p => `<button class="chip on" data-p="${p}">${PART_SHORT[p]}</button>`).join('')}</div></details>
        ${REG.topics ? `<details class="fold"><summary><span>Themen</span><span class="fold-v" data-sum="topics"></span><svg class="ic"><use href="#i-right"/></svg></summary><div class="chips" id="topics">${Object.entries(REG.topics).map(([k, n]) => `<button class="chip" data-tp="${k}">${esc(n)}</button>`).join('')}</div></details>` : ''}
        <details class="fold"><summary><span>Prüfungstermine</span><span class="fold-v" data-sum="pers"></span><svg class="ic"><use href="#i-right"/></svg></summary><div class="chips" id="pers"><button class="chip on" data-all="1">Alle</button>${ps.map(p => `<button class="chip" data-per="${p}">${esc(periodLabel(p))}</button>`).join('')}</div></details>
        <label>Zeitlimit (optional)</label><div class="seg" id="tl"><button data-t="0" class="on">ohne</button><button data-t="1">Challenge: 2 min/Aufgabe</button></div>
        <div class="actions go-bar"><button class="btn primary lg" id="go">${ic('bolt')} Training starten</button></div>
      </section>
      <section class="card all-card"><h2>Alles durcharbeiten</h2><p class="muted">Wie in der Fahrschul-App: Aufgabe für Aufgabe ohne Anzahl und ohne Zeit. Es gelten die Filter oben (Aufgabenart, Bereiche, Themen, Prüfungstermine). Du kannst jederzeit aufhören und später weitermachen.</p>
        <div class="actions wrap"><button class="btn lg" id="allNew">${ic('bolt')} Noch nicht bearbeitet <b class="cnt" id="cNew"></b></button><button class="btn lg" id="allMarked"><svg class="ic"><use href="#i-star"/></svg> Gemerkte <b class="cnt" id="cMarked"></b></button></div></section>`;
    const sum = () => {
      if (!$("[data-sum=\"parts\"]")) return;
      const allP = MC_PARTS.concat(OPEN_PARTS).length, onP = $$('#parts .on');
      $('[data-sum="parts"]').textContent = onP.length === allP ? 'Alle' : onP.length ? onP.map(b => b.textContent).join(', ') : 'Keine';
      const tp = $$('#topics .on'); const ts = $('[data-sum="topics"]'); if (ts) ts.textContent = tp.length ? (tp.length === 1 ? tp[0].textContent : tp.length + ' gewählt') : 'Alle';
      const pr = $$('#pers [data-per].on'); $('[data-sum="pers"]').textContent = pr.length ? (pr.length <= 2 ? pr.map(b => b.textContent).join(', ') : pr.length + ' gewählt') : 'Alle';
    };
    const filt = () => ({ parts: $$('#parts .on').map(b => b.dataset.p), periods: $$('#pers [data-per].on').map(b => b.dataset.per), types: $$('#types .on').map(b => b.dataset.ty), topics: $$('#topics .on').map(b => b.dataset.tp) });
    const counts = () => { const f = filt(); $('#cNew').textContent = poolIds('new', f).length; $('#cMarked').textContent = poolIds('marked', f).length; };
    m.querySelector('.form').addEventListener('click', () => setTimeout(() => { sum(); counts(); })); sum(); counts();
    $('#allNew').onclick = () => startPool('new', filt());
    $('#allMarked').onclick = () => startPool('marked', filt());
    const pick = (box, multi) => box.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (!multi) $$('button', box).forEach(x => x.classList.remove('on')); b.classList.toggle('on', multi ? !b.classList.contains('on') : true); });
    pick($('#size'), false); pick($('#tl'), false); pick($('#parts'), true); pick($('#types'), true); if ($('#topics')) pick($('#topics'), true);
    $('#pers').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.all) { $$('#pers button').forEach(x => x.classList.toggle('on', x === b)); }
      else { b.classList.toggle('on'); $('#pers [data-all]').classList.toggle('on', !$$('#pers [data-per].on').length); }
    });
    $('#go').onclick = () => {
      const n = +$('#size .on').dataset.n; st.settings.sessionSize = n;
      const parts = $$('#parts .on').map(b => b.dataset.p); const pers = $$('#pers [data-per].on').map(b => b.dataset.per);
      const types = $$('#types .on').map(b => b.dataset.ty);
      const topics = $$('#topics .on').map(b => b.dataset.tp);
      const ids = C.pickSession(REG.tasks, st.srs, n, { parts, periods: pers, types, topics });
      if (!ids.length) return AP2Toast('Keine passenden Aufgaben gefunden.');
      const id = 's' + Date.now().toString(36);
      const limit = +$('#tl .on').dataset.t ? ids.length * 120000 : 0;
      st.sessions[id] = { id, items: ids.map(t => ({ id: t, tries: [], result: null })), idx: 0, created: Date.now(), updated: Date.now(), done: false, endsAt: limit ? Date.now() + limit : 0 };
      S.save(true); go('#/session/' + id);
    };
  }

  function taskFrame(t, rightTop, opts) {
    const o = opts || {};
    return `<div class="work" id="work">
      <section class="orig"><div class="orig-bar"><span class="tag">${esc(t.periodLabel)} · ${PART_SHORT[t.part]} · ${esc(t.label)}${t.mandatory ? ' · <b>nicht abwählbar</b>' : ''}</span>
        <div class="tools"><button class="ib" data-z="-">−</button><button class="ib" data-z="0">Breite</button><button class="ib" data-z="+">+</button>
        ${o.tutor ? '<button class="ib tutor-ib" id="tutorBtn" title="KI-Tutor: Tipps und Erklärungen"><svg class="ic"><use href="#i-spark"/></svg> Tutor</button>' : ''}<button class="ib mark-ib ${isMarked(t.id) ? 'on' : ''}" data-mark="${t.id}" title="Aufgabe fürs Fehlerheft merken"><svg class="ic"><use href="#i-star"/></svg> <span>${isMarked(t.id) ? 'Gemerkt' : 'Merken'}</span></button><button class="ib anno-ib ${hasAnno(t.id) ? 'has' : ''}" id="annoBtn" title="Direkt auf der Aufgabe schreiben (z. B. Schaltbild ergänzen)"><svg class="ic"><use href="#i-pen"/></svg> <span>Schreiben</span></button><button class="ib" id="pinBook" title="Heftseiten anheften"><svg class="ic"><use href="#i-clip"/></svg> Heftseiten</button>${o.noReport ? '' : '<button class="ib" id="report" title="Fehler melden"><svg class="ic"><use href="#i-flag"/></svg> </button>'}</div></div>
        <div class="anno-bar" id="annoBar" hidden><span class="anno-hint">Mit dem Stift auf die Aufgabe schreiben · Finger scrollen</span>${AP2Anno.COLORS.map((c, i) => `<button class="sw ${i ? '' : 'on'}" data-ac="${c}" style="--c:${c}" aria-label="Farbe ${i + 1}"></button>`).join('')}<button class="ib" data-at="erase">Radierer</button><button class="ib" data-at="finger" title="Mit dem Finger zeichnen (ohne Stift)">Finger</button><button class="ib" data-at="undo" aria-label="Rückgängig">↶</button><button class="ib" data-at="clear">Löschen</button><button class="ib done" data-at="done">Fertig</button></div>
        <div class="orig-scroll"><img id="origImg" data-src="${t.image}" ${t.imageSize ? `width="${t.imageSize[0]}" height="${t.imageSize[1]}" style="aspect-ratio:${t.imageSize[0]}/${t.imageSize[1]}"` : ""} alt="Originalaufgabe ${esc(t.id)}" draggable="false"></div></section>
      <div class="split" id="split" title="Ziehen zum Ändern der Aufteilung"></div>
      <section class="side">${rightTop}<div class="pad" id="pad"></div></section></div>`;
  }
  function wireFrame(t, m, opts) {
    const tb = $('#tutorBtn', m); if (tb && opts && opts.tutor) tb.onclick = () => openTutor(t, opts);
    const img = $('#origImg'); let z = IMGZ;
    const apply = () => { img.style.width = (z * 100) + '%'; IMGZ = z; };
    apply();
    AP2Pad.pinch($('.orig-scroll', m), () => z, nz => { z = nz; apply(); }, 0.5, 4);
    $$('[data-z]', m).forEach(b => b.onclick = () => { z = b.dataset.z === '+' ? Math.min(3, z + .25) : b.dataset.z === '-' ? Math.max(.5, z - .25) : 1; apply(); });
    const w = $('#work'), sp = $('#split');
    const saved = +(localStorage.getItem('ap2.split') || 58);
    w.style.setProperty('--left', saved + '%');
    sp.onpointerdown = e => {
      try { sp.setPointerCapture(e.pointerId); } catch (_) {}
      sp.onpointermove = ev => { const r = w.getBoundingClientRect(); const p = Math.min(80, Math.max(20, 100 * (ev.clientX - r.left) / r.width)); w.style.setProperty('--left', p + '%'); try { localStorage.setItem(w.classList.contains('big') ? 'ap2.splitBig' : 'ap2.split', p); } catch {} };
      sp.onpointerup = () => { sp.onpointermove = null; };
    };
    $('#pinBook').onclick = () => openBook(t.source.docId, t.source.page);
    const rep = $('#report'); if (rep) rep.onclick = () => report(t);
    anno = AP2Anno.attach($('.orig-scroll', m), img, { strokes: (st.anno || {})[t.id], onChange: s => { st.anno = st.anno || {}; if (s.length) st.anno[t.id] = s; else delete st.anno[t.id]; touchInk(t.id); S.save(); $('#annoBtn', m).classList.toggle('has', s.length > 0); } });
    { const ab = $('#annoBar', m), bt = $('#annoBtn', m);
      const setOn = v => { anno.setMode(v); ab.hidden = !v; bt.classList.toggle('on', v); };
      bt.onclick = () => setOn(!anno.isOn());
      ab.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.ac) { anno.setColor(b.dataset.ac); $$('[data-ac],[data-at="erase"]', ab).forEach(x => x.classList.toggle('on', x === b)); return; }
        const a = b.dataset.at;
        if (a === 'erase') { anno.setTool('erase'); $$('[data-ac],[data-at="erase"]', ab).forEach(x => x.classList.toggle('on', x === b)); }
        else if (a === 'finger') { const v = !b.classList.contains('on'); b.classList.toggle('on', v); anno.setFinger(v); AP2Toast(v ? 'Finger zeichnet jetzt – zum Scrollen „Finger“ wieder ausschalten.' : 'Finger scrollt wieder.'); }
        else if (a === 'undo') anno.undo();
        else if (a === 'clear') { if (anno.count()) ask({ title: 'Alle Eintragungen auf dieser Aufgabe löschen?', buttons: [['Löschen', true, 'danger'], ['Abbrechen', false, 'ghost']] }).then(v => { if (v) anno.clear(); }); }
        else if (a === 'done') setOn(false);
      });
    }
    pad = AP2Pad.createPad($('#pad'), { pages: st.ink[t.id], grid: st.settings.grid, allowMouse: st.settings.mouseInk, onChange: p => { st.ink[t.id] = p; touchInk(t.id); S.save(); } });
    // Großes Rechenpapier: links Aufgabe, rechts Schreibfläche – beide getrennt zoombar; Antwortfelder hinter einem Knopf
    { const bar = $('#pad .pad-bar', m), side = $('.side', m);
      bar.insertAdjacentHTML('afterbegin', '<div class="seg"><button data-big class="big-btn" title="Rechenpapier groß – Aufgabe links, Schreibfläche rechts"><svg class="ic"><use href="#i-expand"/></svg> <span>Groß</span></button></div>');
      side.insertAdjacentHTML('beforeend', '<button class="btn ans-toggle" data-ans><svg class="ic"><use href="#i-pen"/></svg> <span>Antwort eingeben</span></button>');
      const setBig = v => { w.classList.toggle('big', v); w.classList.remove('show-ans'); document.body.classList.toggle('bigpad', v); let k = null; try { k = localStorage.getItem(v ? 'ap2.splitBig' : 'ap2.split'); } catch (_) {} w.style.setProperty('--left', (+k || (v ? 50 : 58)) + '%'); try { localStorage.setItem('ap2.bigPad', v ? '1' : '0'); } catch (_) {} const sp = $('[data-big] span', m); if (sp) sp.textContent = v ? 'Normal' : 'Groß'; $('[data-ans] span', m).textContent = 'Antwort eingeben'; };
      let big = false; try { big = localStorage.getItem('ap2.bigPad') === '1'; } catch (_) {}
      setBig(big);
      $('[data-big]', m).onclick = () => { setBig(!w.classList.contains('big')); setTimeout(() => { const f = $('#pad [data-a="fit"]', m); if (f) f.click(); }, 120); };
      $('[data-ans]', m).onclick = () => { const on = w.classList.toggle('show-ans'); $('[data-ans] span', m).textContent = on ? 'Antwort ausblenden' : 'Antwort eingeben'; };
    }
  }
  async function report(t) {
    const txt = await ask({ title: 'Fehler melden', text: `Was stimmt bei ${esc(t.id)} nicht? Die Meldung wird gespeichert und mit der Sicherung exportiert.`, area: true, buttons: [['Speichern', true, 'primary'], ['Abbrechen', false, 'ghost']] });
    if (txt && txt.trim()) { const r = { task: t.id, version: t.version, text: txt.trim(), at: Date.now() }; st.reports.push(r); S.save(true); let sent = false; try { sent = window.AP2Sync && await AP2Sync.sendReport(r); } catch (_) {} AP2Toast(sent ? 'Danke – Meldung an den Administrator gesendet.' : 'Danke – Meldung gespeichert (wird beim Export mitgegeben).'); }
  }
  const optButtons = (sel, dis, cls) => `<div class="opts">${[1, 2, 3, 4, 5].map(i => `<button class="opt ${sel === i ? 'sel' : ''} ${(cls && cls[i]) || ''}" data-o="${i}" ${dis && dis.includes(i) ? 'disabled' : ''} aria-label="Antwort ${i}">${NUM[i - 1]}</button>`).join('')}</div>`;

  function session(m, [id]) {
    const s = st.sessions[id]; if (!s) { go('#/training'); return; }
    if (s.pool === 'new') {   // inzwischen woanders bearbeitet → nicht nochmal zeigen
      let k = 0; while (s.idx < s.items.length && !s.items[s.idx].result && !s.items[s.idx].fresh && st.srs[s.items[s.idx].id] && st.srs[s.items[s.idx].id].seen) { s.items[s.idx].skip = 1; s.idx++; k++; }
      if (k) { if (s.idx >= s.items.length) s.done = true; S.save(true); }
    }
    if (s.idx >= s.items.length || (s.endsAt && Date.now() > s.endsAt && !s.done)) return sessionEnd(m, s);
    const it = s.items[s.idx]; const t = TASKS[it.id];
    if (!it.fresh) { freshSheet(t.id); it.fresh = 1; S.save(true); }   // neuer Versuch = leeres Blatt (altes wird archiviert)
    if (t.type === 'open') return openSession(m, s, it, t);
    const phase = it.result ? 'done' : (it.tries.length === 1 ? 'retry' : 'ask');
    let msg = '', dis = [], cls = {};
    if (phase === 'retry') { dis = it.elim; msg = `<div class="fb warn"><b>Leider falsch.</b> Hinweis: ${it.elim.map(x => NUM[x - 1]).join(' und ')} sind falsch. Zweiter Versuch!</div>`; }
    if (phase === 'done') {
      it.tries.forEach(x => cls[x] = 'bad'); cls[t.solution.answer] = 'good'; dis = [1, 2, 3, 4, 5];
      const head = { first: '✓ Richtig!', hint: '✓ Richtig – mit Hinweis.', wrong: '✗ Leider falsch.' }[it.result];
      msg = `<div class="fb ${it.result === 'wrong' ? 'bad' : 'good'}"><b>${head}</b> Offizielle Lösung: <b>${NUM[t.solution.answer - 1]}</b>
        <span class="muted small">Beleg: IHK-Lösungsschablone ${t.solution.template}, Lösungsheft S. ${t.solution.page}</span>
        <button class="link" id="showKey">Lösungsschablone ansehen</button></div>${it.result !== 'wrong' ? `<button class="chip mark-chip ${isMarked(t.id) ? 'on' : ''}" data-mark="${t.id}" data-long="1"><svg class="ic"><use href="#i-star"/></svg> <span>${isMarked(t.id) ? 'Gemerkt fürs Fehlerheft' : 'Geraten? Merken'}</span></button>` : ''}`;
    }
    const prog = `<div class="sess-top"><button class="back" data-back="#/"><svg class="ic"><use href="#i-left"/></svg>Zurück</button><button class="ib sess-del" data-sdel="${s.id}" title="Training löschen" aria-label="Training löschen"><svg class="ic"><use href="#i-trash"/></svg></button>${sessDots(s)}
      <span class="muted">${s.idx + 1}/${s.items.length}</span>${s.endsAt ? '<span class="timer" id="timer"></span>' : ''}</div>`;
    const tOpts = { tutor: () => phase === 'done' ? 'full' : 'hint', myAnswer: () => it.tries.length ? 'Antwort ' + it.tries.join(', dann ') : '' };
    m.innerHTML = `<div class="task-page">${prog}${taskFrame(t, `<div class="answer card">${msg}<p class="q">Wähle die richtige Antwort:</p>${optButtons(null, dis, cls)}
      <div class="actions wrap">${phase === 'done' ? `<button class="btn primary" id="next">${s.idx + 1 < s.items.length ? 'Weiter →' : 'Auswertung'}</button><button class="btn ghost" id="tutorExplain"><svg class="ic"><use href="#i-spark"/></svg> Nachfragen</button>` : ''}</div>${phase === 'done' ? '<div id="xpl"></div>' : ''}</div>`, tOpts)}</div>`;
    wireFrame(t, m, tOpts);
    const te = $('#tutorExplain', m); if (te) te.onclick = () => openTutor(t, tOpts, 'explain');
    if (phase === 'done') explainInline($('#xpl', m), t, tOpts, it.result !== 'first');
    if (s.endsAt) { const upd = () => { const r = s.endsAt - Date.now(); if (r <= 0) { s.done = true; S.save(true); return route(); } $('#timer').textContent = fmt(r); }; upd(); tick = setInterval(upd, 1000); }
    $$('.opt', m).forEach(b => b.onclick = () => {
      if (b.disabled || phase === 'done') return;
      const ch = +b.dataset.o; const ok = C.gradeMC(t, ch);
      it.tries.push(ch);
      if (ok || it.tries.length === 2) {
        it.result = C.outcome(it.tries.length === 1 && ok, it.tries.length === 2 && ok);
        st.srs[t.id] = C.updateSrs(st.srs[t.id], it.result, Date.now());
        st.attempts.push({ task: t.id, v: t.version, mode: 'training', tries: it.tries.slice(), result: it.result, at: Date.now() });
      } else it.elim = C.hintEliminate(t, ch);
      s.updated = Date.now(); S.save(true); route();
    });
    const nx = $('#next'); if (nx) nx.onclick = () => { s.idx++; if (s.idx >= s.items.length) s.done = true; s.updated = Date.now(); S.save(true); route(); };
    
    const sk = $('#showKey'); if (sk) sk.onclick = () => openPage(`${t.period}_LOES`, t.solution.page, `Lösung ${t.periodLabel} (${t.solution.template})`);
  }
  /* ---------- Themen-Einstieg: Leitfaden + Übungsrechnungen (keine IHK-Aufgaben) ---------- */
  const LV = ['', 'leicht', 'mittel', 'prüfungsnah'];
  let LEARN = null;   // aktuelle Übungsrechnung { key, gi, x, ans, checked }
  function learnView(m, [key]) {
    const L = window.AP2Learn; st.learn = st.learn || {};
    if (!key) {
      m.innerHTML = `<header class="page-h"><a class="link" href="#/training">← Training</a><h1>Themen-Einstieg</h1><p>Zu jedem Thema: die wichtigsten Formeln, das Vorgehen wie in der IHK-Lösung und typische Fehler. Dann Übungsrechnungen mit immer neuen Zahlen – die App rechnet die Lösung selbst aus und zeigt den Rechenweg. Danach geht es direkt an die IHK-Aufgaben zum Thema.</p></header>
        <div class="learn-grid">${L.TOPICS.map(T => { const p = st.learn[T.key] || { n: 0, ok: 0 }; return `<a class="start learn-t" href="#/learn/${T.key}">${ic(T.icon)}<div><b>${esc(T.title)}</b><span>${esc(T.intro)}</span><small class="muted">${p.n ? `${p.n} gerechnet · ${Math.round(100 * p.ok / p.n)} % richtig` : 'noch nicht geübt'}</small></div></a>`; }).join('')}</div>
        <p class="muted small">Die Übungsrechnungen sind keine IHK-Aufgaben. Ihre Formeln sind gegen Ergebnisse aus den offiziellen Lösungsvorschlägen geprüft.</p>`;
      return;
    }
    const T = L.TOPICS.find(x => x.key === key); if (!T) { go('#/learn'); return; }
    if (!LEARN || LEARN.key !== key) LEARN = { key, gi: 0, x: T.gens[0].make(), ans: {}, checked: false };
    const g = T.gens[LEARN.gi], x = LEARN.x;
    const nIHK = gradable().filter(t => t.topic === T.topic).length;
    const res = LEARN.checked && !LEARN.shown ? x.asks.map((a, i) => { const r = C.checkNumber(LEARN.ans[i] || '', L.expect(a)); return r; }) : null;
    m.innerHTML = `<header class="page-h"><a class="link" href="#/learn">← Themen-Einstieg</a><h1>${esc(T.title)}</h1><p>${L.prose(T.intro)}</p></header>
      <div class="grid2 learn-cols">
        <section class="card guide"><h2>Formeln</h2>
          <div class="fgrid">${T.formulas.map(f => `<div class="frow"><span class="fk">${esc(f[0])}</span><span class="fv">${f[1] ? `<span class="fm">${L.math(f[1], true)}</span>` : ''}${f[2] ? `<span class="fm">${L.math(f[2], true)}</span>` : ''}${f[3] ? `<span class="fnote">${L.prose(f[3])}</span>` : ''}</span></div>`).join('')}</div>
          <h2>Vorgehen wie in der IHK-Lösung</h2><ol class="gsteps">${T.steps.map(x => `<li>${L.prose(x)}</li>`).join('')}</ol>
          <p class="muted small">In der Prüfung zählt der vollständige Rechengang: Formel, Werte mit Einheiten einsetzen, Ergebnis mit Einheit.</p>
          <h2>Typische Fehler</h2><ul class="traps">${T.traps.map(x => `<li>${L.prose(x)}</li>`).join('')}</ul></section>
        <section class="card practice"><div class="pr-h"><h2>Übungsrechnung</h2><span class="pill">Übung · keine IHK-Aufgabe</span></div>
          <div class="chips">${T.gens.map((G, i) => `<button class="chip ${i === LEARN.gi ? 'on' : ''}" data-gi="${i}">${esc(G.name)} <small>${LV[G.level]}</small></button>`).join('')}</div>
          <p class="pr-q">${esc(x.q)}</p>
          <div class="pr-asks">${x.asks.map((a, i) => `<label class="pr-a ${res ? (res[i].ok ? 'ok' : 'no') : ''}"><span>${esc(a.label)}</span><span class="pr-in"><b>${L.math(a.sym, true)} =</b><input class="inp num" data-ai="${i}" inputmode="decimal" autocomplete="off" placeholder="${a.unit ? 'Wert ' + esc(a.unit) : 'Wert'}" value="${esc(LEARN.ans[i] || '')}" ${res ? 'readonly' : ''}></span>${res ? `<small class="${res[i].ok ? 'good' : 'bad'}">${res[i].ok ? '✓ richtig' : `✗ richtig wäre ${L.fmt(a.value, a.dec)}${a.unit ? ' ' + esc(a.unit) : ''}${!(LEARN.ans[i] || '').trim() ? ' – keine Angabe' : res[i].reason === 'unit' ? ' – Einheit fehlt oder passt nicht' : res[i].reason === 'format' ? ' – Zahl nicht lesbar' : ''}`}</small>` : ''}</label>`).join('')}</div>
          ${LEARN.checked ? `<div class="pr-sol"><b>Lösungsweg</b><ol>${x.steps.map(s => `<li>${L.stepHTML(s)}</li>`).join('')}</ol></div>` : ''}
          <div class="actions wrap">${LEARN.checked ? `<button class="btn primary" id="prNew">${ic('repeat')} Neue Aufgabe</button>` : `<button class="btn primary" id="prChk">Prüfen</button><button class="btn ghost" id="prSol">Lösungsweg zeigen</button>`}</div></section>
      </div>
      <section class="card learn-next"><div><h2>Bereit für die Prüfung?</h2><p class="muted">${nIHK} Original-IHK-Aufgaben zum Thema „${esc((REG.topics || {})[T.topic] || T.title)}“.</p></div><button class="btn primary lg" id="toIHK">${ic('bolt')} IHK-Aufgaben üben</button></section>`;
    $$('[data-gi]', m).forEach(b => b.onclick = () => { LEARN = { key, gi: +b.dataset.gi, x: T.gens[+b.dataset.gi].make(), ans: {}, checked: false }; route(); });
    $$('[data-ai]', m).forEach(inp => inp.oninput = () => { LEARN.ans[+inp.dataset.ai] = inp.value; });
    const chk = $('#prChk', m); if (chk) chk.onclick = () => {
      if (!x.asks.some((a, i) => (LEARN.ans[i] || '').trim())) return AP2Toast('Erst rechnen und Ergebnisse eintragen – oder „Lösungsweg zeigen“.');
      LEARN.checked = true; const p = st.learn[key] = st.learn[key] || { n: 0, ok: 0 };
      const all = x.asks.every((a, i) => C.checkNumber(LEARN.ans[i] || '', L.expect(a)).ok);
      p.n++; if (all) p.ok++; S.save(); route();
    };
    const sol = $('#prSol', m); if (sol) sol.onclick = () => { LEARN.checked = true; LEARN.shown = true; const p = st.learn[key] = st.learn[key] || { n: 0, ok: 0 }; p.n++; S.save(); route(); };
    const nw = $('#prNew', m); if (nw) nw.onclick = () => { LEARN = { key, gi: LEARN.gi, x: g.make(), ans: {}, checked: false }; route(); };
    $('#toIHK', m).onclick = () => topicTraining(T.topic);
  }
  /* ---------- Fehlerheft: falsch oder nur mit Hinweis gelöste Aufgaben, bis sie zweimal in Folge sofort sitzen ---------- */
  function mistakeLists() {
    const all = gradable().filter(t => { const e = st.srs[t.id]; return e && (e.wrong + e.hint) > 0; });
    const open = all.filter(t => st.srs[t.id].box < 2 && !isMarked(t.id)).sort((a, b) => (st.srs[b.id].wrong - st.srs[a.id].wrong) || (st.srs[a.id].last - st.srs[b.id].last));
    const marked = gradable().filter(t => isMarked(t.id)).sort((a, b) => st.marked[b.id] - st.marked[a.id]);
    return { open: marked.concat(open), marked, solved: all.filter(t => st.srs[t.id].box >= 2 && !isMarked(t.id)) };
  }
  function startMistakes(n) {
    const { open } = mistakeLists(); if (!open.length) return AP2Toast('Keine offenen Fehler – stark!');
    const ids = open.slice(0, n || st.settings.sessionSize || 10).map(t => t.id);
    const id = 's' + Date.now().toString(36);
    st.sessions[id] = { id, items: ids.map(t => ({ id: t, tries: [], result: null })), idx: 0, created: Date.now(), updated: Date.now(), done: false, endsAt: 0, mistakes: true };
    S.save(true); go('#/session/' + id);
  }
  function mistakes(m) {
    const { open, solved, marked } = mistakeLists();
    const row = t => { const e = st.srs[t.id] || { wrong: 0, box: 0 }; const mk = isMarked(t.id);
      return `<div class="resume"><a class="row" href="#/task/${t.id}"><b>${esc(t.periodLabel)} · ${PART_SHORT[t.part]} · ${esc(t.label)}</b><span class="muted">${t.topic && REG.topics ? esc(REG.topics[t.topic] || '') : ''}</span><span class="res ${mk ? 'mk' : e.wrong ? 'wrong' : 'hint'}">${mk ? 'gemerkt' : e.wrong ? e.wrong + '× falsch' : 'mit Hinweis'}${!mk && e.box === 1 ? ' · 1× richtig' : ''}</span></a>${mk ? `<button class="ib del" data-mark="${t.id}" title="Markierung entfernen" aria-label="Markierung entfernen"><svg class="ic"><use href="#i-x"/></svg></button>` : ''}</div>`; };
    const parts = [...new Set(open.map(t => t.part))];
    m.innerHTML = `<header class="page-h"><h1>Fehlerheft</h1><p>Hier landet jede Aufgabe, die du falsch oder nur mit Hinweis gelöst hast. Erst wenn du sie zweimal hintereinander sofort richtig hast, gilt sie als gelöst und verschwindet. Aufgaben, die du mit dem Stern gemerkt hast (z. B. weil du geraten hast), bleiben drin, bis du die Markierung entfernst.</p></header>
      <section class="kpis">${kpi('Offen', open.length, marked.length ? `davon ${marked.length} gemerkt` : 'noch zu üben')}${kpi('Gelöst', solved.length, 'zweimal in Folge richtig')}${(() => { const w = open.filter(t => st.srs[t.id] && st.srs[t.id].wrong).sort((a, b) => st.srs[b.id].wrong - st.srs[a.id].wrong)[0]; return kpi('Schwerste', w ? st.srs[w.id].wrong + '×' : '–', w ? 'falsch: ' + esc(w.periodLabel + ' · ' + w.label) : 'keine'); })()}</section>
      ${open.length ? `<section class="card"><div class="actions wrap" style="margin-top:0"><button class="btn primary lg" id="mGo">${ic('repeat')} ${Math.min(open.length, st.settings.sessionSize || 10)} Fehler üben</button>${open.length > 10 ? `<button class="btn lg" id="mAll">Alle ${open.length}</button>` : ''}</div></section>
        ${parts.map(p => `<section class="card"><h2>${PART_SHORT[p]} <span class="muted small">${open.filter(t => t.part === p).length}</span></h2>${open.filter(t => t.part === p).map(row).join('')}</section>`).join('')}`
      : `<section class="card"><h2>Noch keine offenen Fehler</h2><p class="muted">${solved.length ? 'Alles, was du falsch hattest, sitzt inzwischen. Weiter so!' : 'Sobald du im Training etwas falsch beantwortest, landet es hier.'}</p><div class="actions"><a class="btn primary" href="#/training">${ic('bolt')} Training starten</a></div></section>`}`;
    const g = $('#mGo'); if (g) g.onclick = () => startMistakes();
    const a = $('#mAll'); if (a) a.onclick = () => startMistakes(open.length);
  }
  function sessionEnd(m, s) {
    s.done = true; S.save(true);
    const c = { first: 0, hint: 0, wrong: 0, open: 0 }; s.items.forEach(i => { if (!i.skip) c[i.result || 'open']++; });
    m.innerHTML = `<header class="page-h"><h1>Training abgeschlossen</h1></header>
      <section class="kpis">${kpi('Sofort richtig', c.first, '')}${kpi('Mit Hinweis', c.hint, '')}${kpi('Falsch', c.wrong, 'kommen bald wieder')}${c.open ? kpi('Nicht bearbeitet', c.open, 'Zeit abgelaufen') : ''}</section>
      <section class="card">${s.items.filter(i => !i.skip && (i.result || !s.pool)).map(i => { const t = TASKS[i.id]; return `<a class="row" href="#/task/${t.id}"><b>${esc(t.periodLabel)} · ${PART_SHORT[t.part]} · ${t.label}</b><span class="res ${i.result || ''}">${{ first: 'sofort richtig', hint: 'mit Hinweis', wrong: 'falsch' }[i.result] || 'offen'}</span></a>`; }).join('')}</section>
      <div class="actions wrap"><a class="btn primary" href="#/training">Neues Training</a>${c.wrong || c.hint ? `<a class="btn" href="#/mistakes">${ic('repeat')} Zum Fehlerheft</a>` : ''}<a class="btn ghost" href="#/">Zur Übersicht</a></div>`;
  }


  /* ---------- Offene Aufgaben (Teil B / WiSo U) ---------- */
  function openPanelHTML(t, ans, graded, ai) {
    const a = ans || {};
    const rows = t.subtasks.map(sb => {
      const g = graded && graded[sb.id];
      if (sb.check.kind === 'number') {
        const inputs = sb.check.values.map((v, i) => { const val = ((a[sb.id] || {}).values || [])[i] || ''; const r = g && g.details[i];
          return `<label class="nv"><span>${esc(v.label)} =</span><input class="inp num ${r ? (r.ok ? 'ok' : 'no') : ''}" data-s="${sb.id}" data-i="${i}" value="${esc(val)}" placeholder="Wert und Einheit${v.unit ? ', z. B. … ' + esc(v.unit) : ''}" autocomplete="off" autocapitalize="off" spellcheck="false" ${graded ? 'disabled' : ''}>${r && !r.ok ? `<small class="bad">${r.reason === 'unit' ? 'Einheit fehlt oder passt nicht' : r.reason === 'format' ? 'Zahl nicht erkannt' : 'Wert stimmt nicht'}</small>` : ''}</label>`; }).join('');
        const low = g && (g.autoPoints != null ? g.autoPoints : g.points) < sb.points;
        return `<div class="sub"><div class="sub-h"><b>${esc(sb.label)}</b><span class="pts">${g ? g.points + '/' : ''}${sb.points} P · ${g && g.self != null ? 'selbst bewertet' : 'automatisch'}</span></div>${inputs}${graded ? `<div class="soltxt">Lösung: ${esc(sb.solutionText || '')}</div>` : ''}
          ${g ? `${low && ai && ai[sb.id] ? `<div class="aisug"><b><svg class="ic"><use href="#i-spark"/></svg> KI-Vorschlag: ${ai[sb.id].points == null ? 'keine Bewertung' : ai[sb.id].points + '/' + sb.points + ' P'}</b><span>${esc(ai[sb.id].reason || '')}</span>${ai[sb.id].points != null ? `<button class="link" data-aitake="${sb.id}">übernehmen</button>` : ''}</div>` : ''}<div class="self num-self"><span>${low ? 'Auf dem Rechenpapier richtig gerechnet? Selbst bewerten' : 'Automatisch gewertet – bei Bedarf selbst anpassen'} (falsche Folgeergebnisse = 0):</span>${Array.from({ length: sb.points + 1 }, (_, p) => `<button class="pp ${g.self != null && g.self === p ? 'on' : ''}" data-sp="${sb.id}" data-p="${p}">${p}</button>`).join('')}</div>` : ''}</div>`;
      }
      return `<div class="sub"><div class="sub-h"><b>${esc(sb.label)}</b><span class="pts">${sb.points} P · Selbstkontrolle</span></div>
        <textarea class="inp" rows="2" data-s="${sb.id}" placeholder="Deine Antwort (optional – Rechnung auch auf dem Rechenpapier)" ${graded ? 'disabled' : ''}>${esc((a[sb.id] || {}).text || '')}</textarea>
        ${graded ? `${sb.solutionText ? `<div class="soltxt">Lösung: ${esc(sb.solutionText)}</div>` : ''}${ai && ai[sb.id] ? `<div class="aisug"><b><svg class="ic"><use href="#i-spark"/></svg> KI-Vorschlag: ${ai[sb.id].points == null ? 'keine Bewertung' : ai[sb.id].points + '/' + sb.points + ' P'}</b><span>${esc(ai[sb.id].reason || '')}</span>${ai[sb.id].points != null ? `<button class="link" data-aitake="${sb.id}">übernehmen</button>` : ''}</div>` : ''}<div class="self"><span>Deine Punkte:</span>${Array.from({ length: sb.points + 1 }, (_, p) => `<button class="pp ${g && g.self != null && g.points === p ? 'on' : ''}" data-sp="${sb.id}" data-p="${p}">${p}</button>`).join('')}</div>` : ''}</div>`;
    }).join('');
    return `<p class="q">${esc(t.label)} · ${t.points} Punkte${t.grading === 'self' ? ' · Bewertung durch Selbstkontrolle mit der offiziellen Musterlösung' : ''}</p>${rows}`;
  }
  function readOpen(m, t) {
    const a = {};
    for (const sb of t.subtasks) {
      if (sb.check.kind === 'number') a[sb.id] = { values: $$(`input[data-s="${sb.id}"]`, m).map(x => x.value) };
      else { const ta = $(`textarea[data-s="${sb.id}"]`, m); a[sb.id] = { text: ta ? ta.value : '' }; }
    }
    return a;
  }
  function gradeOpen(t, a, self) {
    const g = {}; let pts = 0, done = true;
    for (const sb of t.subtasks) {
      const sp = self && self[sb.id];
      const r = C.gradeSubtask(sb, a[sb.id], sp);
      if (sb.check.kind !== 'number') { r.self = sp == null ? null : sp; if (sp == null) done = false; }
      else if (sp != null) { r.autoPoints = r.points; r.self = Math.max(0, Math.min(sb.points, +sp)); r.points = r.self; }   // Selbstbewertung ersetzt die automatische Wertung (nach oben und unten)
      g[sb.id] = r; pts += r.points;
    }
    return { g, pts, done };
  }
  const openOutcome = (pts, max) => pts >= max * 0.9 ? 'first' : pts >= max * 0.5 ? 'hint' : 'wrong';
  function openWidget(m, t, rec, onFinish) {
    // rec: {ans, self, phase:'ask'|'check'|'done'}
    const box = $('#openBox', m);
    const render = () => {
      const graded = rec.phase !== 'ask' ? gradeOpen(t, rec.ans, rec.self) : null;
      const selfSubs = t.subtasks.filter(sb => sb.check.kind !== 'number');
      const hasInk = hasWork(t.id);
      const aiSubs = graded ? t.subtasks.filter(sb => sb.check.kind !== 'number' || (graded.g[sb.id].autoPoints != null ? graded.g[sb.id].autoPoints : graded.g[sb.id].points) < sb.points) : [];
      const ansText = sb => { const x = (rec.ans || {})[sb.id] || {}; return x.text != null ? x.text : (x.values || []).map((v, i) => v ? `${sb.check.values[i].label} = ${v}` : '').filter(Boolean).join('; '); };
      const canAI = graded && rec.phase === 'check' && window.AP2Sync && AP2Sync.session && t.solution.image && aiSubs.length && (hasInk || aiSubs.some(sb => ansText(sb).trim()));
      box.innerHTML = `${t.pointsEstimated ? '<p class="muted small">ℹ️ Punkteverteilung geschätzt – das Lösungsheft nennt nur die Gesamtpunktzahl.</p>' : ''}${openPanelHTML(t, rec.ans, graded && graded.g, rec.ai)}
        ${canAI ? `<div class="actions wrap"><button class="btn ghost" id="aiBtn">${rec.ai ? '<svg class="ic"><use href="#i-spark"/></svg> KI erneut fragen' : '<svg class="ic"><use href="#i-spark"/></svg> KI-Vorschlag holen'}</button>${rec.ai ? '<button class="btn ghost" id="aiAll">Alle KI-Punkte übernehmen</button>' : ''}${rec.ai && rec.aiRead ? `<div class="airead"><b><svg class="ic"><use href="#i-pen"/></svg> Das hat die KI auf deinem Rechenpapier gelesen:</b><span>${esc(rec.aiRead)}</span><small class="muted">Falsch gelesen? Dann deutlicher schreiben oder die Antwort ins Feld tippen.</small></div>` : ''}<span class="muted small" id="aiMsg">Vergleicht deine Antworten${hasInk ? ' und dein Rechenpapier' : ''} mit der Musterlösung. Nur ein Vorschlag – du entscheidest.</span></div>` : ''}
        ${graded ? `<div class="fb ${graded.done ? 'good' : 'warn'}"><b>${graded.pts} von ${t.points} Punkten</b>${graded.done ? '' : ' – bitte die Selbstkontroll-Punkte vergeben.'}
          <span class="muted small">Offizielle Musterlösung ${esc(t.label)}: Lösungsheft S. ${t.solution.pages.join(', ')} (${esc(t.solution.template)}). Falsche Folgeergebnisse zählen 0 Punkte.</span>
          <span><button class="link" id="showSol">In eigenem Fenster</button> · <button class="link" id="showPage">Ganze Lösungsseite</button></span></div>
          ${t.solution.image ? `<figure class="solimg"><img alt="Musterlösung ${esc(t.label)}" width="${t.solution.imageSize[0]}" height="${t.solution.imageSize[1]}" style="aspect-ratio:${t.solution.imageSize[0]}/${t.solution.imageSize[1]}"><figcaption>Musterlösung ${esc(t.label)} – nur diese Aufgabe</figcaption></figure>` : ''}<div id="xplO"></div>` : ''}
        <div class="actions">${rec.phase === 'ask' ? '<button class="btn primary" id="chk">Abgeben &amp; Lösung zeigen</button>' : rec.phase === 'check' ? `<button class="btn primary" id="fin" ${graded.done ? '' : 'disabled'}>Speichern &amp; weiter</button>` : '<span class="muted">Gespeichert.</span>'}</div>`;
      const si = $('.solimg img', box); if (si) imgURL(t.solution.image).then(u => si.src = u);
      const xo = $('#xplO', box); if (xo) explainInline(xo, t, { tutor: () => 'full', myAnswer: () => openAnswerText(t, rec) }, true);
      const ch = $('#chk', box); if (ch) ch.onclick = () => { rec.ans = readOpen(box, t); rec.phase = 'check'; rec.self = rec.self || {}; onFinish(rec, null); render(); if (!t.solution.image && t.solution.pages) openSol(t); else { const f = $('.solimg', box); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } };
      $$('[data-sp]', box).forEach(b => b.onclick = () => { rec.self[b.dataset.sp] = +b.dataset.p; onFinish(rec, null); render(); });
      $$('[data-aitake]', box).forEach(b => b.onclick = () => { const id = b.dataset.aitake; rec.self[id] = rec.ai[id].points; onFinish(rec, null); render(); });
      const aa = $('#aiAll', box); if (aa) aa.onclick = () => { Object.entries(rec.ai || {}).forEach(([id, v]) => { if (v.points != null) rec.self[id] = v.points; }); onFinish(rec, null); render(); };
      const ab = $('#aiBtn', box); if (ab) ab.onclick = async () => {
        ab.disabled = true; ab.innerHTML = '<svg class="ic"><use href="#i-spark"/></svg> KI prüft …';
        try {
          const r = await AP2Sync.aiGrade({ taskId: t.id, label: `${t.periodLabel} ${PART_SHORT[t.part]} ${t.label}`, taskImage: t.image, solImage: t.solution.image,
            subtasks: aiSubs.map(sb => ({ id: sb.id, label: sb.label, points: sb.points, solutionText: sb.solutionText || '' })),
            answers: Object.fromEntries(aiSubs.map(sb => [sb.id, ansText(sb)])), inkImage: await inkFor(t) });
          rec.ai = {}; r.results.forEach(x => rec.ai[x.id] = { points: x.points, reason: x.reason }); rec.aiModel = r.model; rec.aiRead = r.transcript || '';
          onFinish(rec, null); render(); AP2Toast(`KI-Vorschlag da – heute noch ${Math.max(0, r.remaining)} Anfragen.`);
        } catch (e) { AP2Toast(e.message); ab.disabled = false; ab.innerHTML = '<svg class="ic"><use href="#i-spark"/></svg> KI-Vorschlag holen'; }
      };
      const fi = $('#fin', box); if (fi) fi.onclick = () => { const gr = gradeOpen(t, rec.ans, rec.self); rec.phase = 'done'; onFinish(rec, gr); };
      const ss = $('#showSol', box); if (ss) ss.onclick = () => openSol(t);
      const sp = $('#showPage', box); if (sp) sp.onclick = () => openSolPages(t);
    };
    render();
  }
  // Musterlösung: nur der Lösungskasten dieser Aufgabe; ganze Seiten nur auf ausdrücklichen Wunsch
  function openSol(t) {
    const title = `Musterlösung ${t.periodLabel} · ${PART_SHORT[t.part]} ${t.label}`;
    if (!t.solution.image) return openSolPages(t);
    win(title, { pageImages: [t.solution.image] }, 1);
  }
  function openSolPages(t) { t.solution.pages.forEach(p => openPage(t.solution.docId, p, `Lösungsseite ${p} · ${t.periodLabel} · ${PART_SHORT[t.part]}`)); }
  function recordOpen(t, rec, gr, mode) {
    st.open = st.open || {}; st.open[t.id] = { ans: rec.ans, self: rec.self, pts: gr.pts, max: t.points, at: Date.now(), v: t.version };
    const res = openOutcome(gr.pts, t.points);
    st.srs[t.id] = C.updateSrs(st.srs[t.id], res, Date.now());
    st.attempts.push({ task: t.id, v: t.version, mode, tries: [JSON.stringify(rec.ans)], result: res, points: gr.pts, max: t.points, at: Date.now() });
    return res;
  }
  function openSession(m, s, it, t) {
    it.rec = it.rec || { ans: null, self: {}, phase: it.result ? 'done' : 'ask' };
    const oOpts = { tutor: () => it.rec.phase === 'ask' ? 'hint' : 'full', myAnswer: () => openAnswerText(t, it.rec) };
    const prog = `<div class="sess-top"><button class="back" data-back="#/"><svg class="ic"><use href="#i-left"/></svg>Zurück</button><button class="ib sess-del" data-sdel="${s.id}" title="Training löschen" aria-label="Training löschen"><svg class="ic"><use href="#i-trash"/></svg></button>${sessDots(s)}<span class="muted">${s.idx + 1}/${s.items.length}</span>${s.endsAt ? '<span class="timer" id="timer"></span>' : ''}</div>`;
    m.innerHTML = `<div class="task-page">${prog}${taskFrame(t, `<div class="answer card openc"><div id="openBox"></div><div class="actions">${it.result ? `<button class="btn primary" id="next">${s.idx + 1 < s.items.length ? 'Weiter →' : 'Auswertung'}</button>` : ''}</div></div>`, oOpts)}</div>`;
    wireFrame(t, m, oOpts); hydrate(m);
    openWidget(m, t, it.rec, (rec, gr) => { if (gr) { it.result = recordOpen(t, rec, gr, 'training'); } s.updated = Date.now(); S.save(true); if (gr) route(); });
    if (s.endsAt) { const upd = () => { const r = s.endsAt - Date.now(); if (r <= 0) { s.done = true; S.save(true); return route(); } $('#timer').textContent = fmt(r); }; upd(); tick = setInterval(upd, 1000); }
    const nx = $('#next'); if (nx) nx.onclick = () => { s.idx++; if (s.idx >= s.items.length) s.done = true; S.save(true); route(); };
    
  }
  function startBook(docId) {
    const ts = tasksOf(docId, 'open').filter(t => t.gradable); if (!ts.length) return AP2Toast('Keine bewertbaren Aufgaben in diesem Heft.');
    const id = 's' + Date.now().toString(36);
    st.sessions[id] = { id, items: ts.map(t => ({ id: t.id, tries: [], result: null })), idx: 0, created: Date.now(), updated: Date.now(), done: false, endsAt: 0, book: docId };
    S.save(true); go('#/session/' + id);
  }

  /* Einzelaufgabe aus Bibliothek (Lösung nur auf Wunsch) */
  function taskView(m, [id]) {
    const t = TASKS[id]; if (!t) return library(m, []);
    if (t.type === 'open') {
      if (!t.gradable) { m.innerHTML = `<div class="card"><h1>${esc(t.periodLabel)} · ${PART_SHORT[t.part]} ${t.label}</h1><p>${esc(t.blockedReason)}</p></div>`; return; }
      const rec = { ans: null, self: {}, phase: 'ask' };
      const lOpts = { tutor: () => rec.phase === 'ask' ? 'hint' : 'full', myAnswer: () => openAnswerText(t, rec) };
      m.innerHTML = `<div class="task-page"><div class="sess-top"><a class="link" href="#/doc/${t.source.docId}">← ${esc(doc(t.source.docId).partLabel)}</a>${hasWork(t.id) ? `<button class="btn sm fresh-btn" data-fresh="${t.id}"><svg class="ic"><use href="#i-repeat"/></svg> Neues leeres Blatt</button>` : ''}</div>${taskFrame(t, '<div class="answer card openc"><div id="openBox"></div></div>', lOpts)}</div>`;
      wireFrame(t, m, lOpts);
      openWidget(m, t, rec, (r, gr) => { if (gr) { recordOpen(t, r, gr, 'library'); S.save(true); AP2Toast(`${gr.pts}/${t.points} Punkte gespeichert.`); } });
      return;
    }
    let picked = null; const mOpts = { tutor: () => 'full', myAnswer: () => picked ? 'Antwort ' + picked : '' };
    m.innerHTML = `<div class="task-page"><div class="sess-top"><a class="link" href="#/doc/${t.source.docId}">← ${esc(doc(t.source.docId).partLabel)}</a>${hasWork(t.id) ? `<button class="btn sm fresh-btn" data-fresh="${t.id}"><svg class="ic"><use href="#i-repeat"/></svg> Neues leeres Blatt</button>` : ''}</div>${taskFrame(t, `<div class="answer card"><p class="q">Freie Übung (ohne Wertung):</p>${optButtons()}<div id="fb"></div>
      <div class="actions wrap"><button class="btn ghost" id="sol">Lösung zeigen</button><button class="btn ghost" id="tutorExplain"><svg class="ic"><use href="#i-spark"/></svg> Nachfragen</button></div><div id="xpl"></div></div>`, mOpts)}</div>`;
    wireFrame(t, m, mOpts);
    $('#tutorExplain', m).onclick = () => openTutor(t, mOpts, 'explain');
    $$('.opt', m).forEach(b => b.onclick = () => { picked = +b.dataset.o; const ok = C.gradeMC(t, +b.dataset.o); $$('.opt', m).forEach(x => x.classList.remove('good', 'bad')); b.classList.add(ok ? 'good' : 'bad'); $('#fb').innerHTML = `<div class="fb ${ok ? 'good' : 'bad'}">${ok ? '✓ Richtig' : '✗ Falsch'}</div>`; explainInline($('#xpl', m), t, mOpts, !ok); });
    $('#sol').onclick = () => { $$('.opt', m)[t.solution.answer - 1].classList.add('good'); $('#fb').innerHTML = `<div class="fb good">Offizielle Lösung: <b>${NUM[t.solution.answer - 1]}</b> <button class="link" id="sk">Schablone ${t.solution.template} ansehen</button></div>`; $('#sk').onclick = () => openPage(`${t.period}_LOES`, t.solution.page, 'Lösungsschablone ' + t.solution.template); };
  }

  /* ---------- Prüfungen ---------- */
  function exams(m) {
    m.innerHTML = `<header class="page-h"><h1>Originalprüfungen</h1><p>Teil A und WiSo (gebundene Aufgaben) in Originalreihenfolge. <b>Übung</b>: pausierbar, Lösungen nach Abgabe. <b>Simulation</b>: Timer läuft weiter (auch nach Neustart), keine Hilfen, Auto-Abgabe bei Zeitablauf.</p>
      <p class="muted small">Offizielle Zeit laut Deckblatt: Systementwurf und FuSA je 105 min für Teil A <i>und</i> B zusammen, WiSo 60 min inkl. ungebundener Aufgaben. Für Teil A allein ist keine offizielle Zeit angegeben – die vorgeschlagene Zeit ist änderbar.</p></header>
      <section class="card set-start"><h2>Komplette Prüfung</h2><p class="muted">Alle drei Bereiche eines Termins wie am Prüfungstag: Teil A, abgeben, dann Teil B auf derselben Uhr. Danach Pause oder direkt weiter.</p>
        <div class="actions wrap"><button class="btn primary" id="setRnd">${ic('dice')} Zufälliger Termin</button></div>
        <details class="fold"><summary><span>Termin auswählen</span><span class="fold-v">${fullPeriods().length} Termine</span><svg class="ic"><use href="#i-right"/></svg></summary><div class="chips">${fullPeriods().map(p => `<button class="chip" data-set="${p}">${esc(periodLabel(p))}</button>`).join('')}</div></details></section>
      <h2 class="sec-h">Einzelne Teile</h2>
      <button class="btn ghost" id="rnd"><svg class="ic"><use href="#i-dice"/></svg> Zufälliger Teil</button>
      <div class="exam-list">${periods().map(p => `<section class="card"><h2>${esc(periodLabel(p))}</h2><div class="exam-parts">${MC_PARTS.map(pt => {
        const d = doc(`${p}_${pt}`); if (!d) return ''; const ts = tasksOf(d.id); const g = ts.filter(t => t.gradable).length;
        const best = Object.values(st.exams).filter(e => e.docId === d.id && e.submitted).sort((a, b) => b.score.percent - a.score.percent)[0];
        return `<div class="ep"><b>${PART_SHORT[pt]}</b><span class="muted small">${ts.length} Aufgaben · ${g} bewertbar${best ? ` · Bestwert ${best.score.percent}%` : ''}</span>
          <div class="ep-b"><button class="btn sm" data-start="${d.id}" data-strict="0">Übung</button><button class="btn sm primary" data-start="${d.id}" data-strict="1">Simulation</button></div></div>`;
      }).join('')}</div><div class="exam-parts b">${['SE_B', 'FUSA_B', 'WISO'].map(pt => { const d = doc(`${p}_${pt}`); if (!d) return ''; const ts = tasksOf(d.id, 'open'); const g = ts.filter(t => t.gradable).length; const pts = ts.reduce((a, t) => a + ((st.open || {})[t.id] ? st.open[t.id].pts : 0), 0);
        return `<div class="ep"><b>${pt === 'WISO' ? 'WiSo offene Aufgaben' : PART_SHORT[pt]}</b><span class="muted small">${g} von ${ts.length} Aufgaben bearbeitbar · ${pts} P erreicht</span><div class="ep-b"><button class="btn sm ghost" data-book="${d.id}">Heft üben</button><button class="btn sm" data-bstart="${d.id}" data-strict="0">Übung</button><button class="btn sm primary" data-bstart="${d.id}" data-strict="1">Simulation</button></div></div>`; }).join('')}</div></section>`).join('')}</div>`;
    $$('[data-book]', m).forEach(b => b.onclick = () => startBook(b.dataset.book));
    $$('[data-bstart]', m).forEach(b => b.onclick = () => startBExam(b.dataset.bstart, b.dataset.strict === '1'));
    $$('[data-start]', m).forEach(b => b.onclick = () => startExam(b.dataset.start, b.dataset.strict === '1'));
    $('#setRnd').onclick = () => { const ps = fullPeriods(); askSet(ps[Math.floor(Math.random() * ps.length)]); };
    $$('[data-set]', m).forEach(b => b.onclick = () => askSet(b.dataset.set));
    $('#rnd').onclick = () => { const ds = DOCS.filter(d => MC_PARTS.includes(d.part)); const d = ds[Math.floor(Math.random() * ds.length)]; startExam(d.id, false); };
  }
  /* ---------- Komplette Prüfung: je Bereich Teil A, dann Teil B auf gemeinsamer Uhr; dazwischen Pause oder weiter ---------- */
  const AREAS = [
    { k: 'SE', a: 'SE_A', b: 'SE_B', min: 105, label: 'Systementwurf' },
    { k: 'FUSA', a: 'FUSA_A', b: 'FUSA_B', min: 105, label: 'Funktions- und Systemanalyse' },
    { k: 'WISO', a: 'WISO', b: 'WISO', min: 60, label: 'Wirtschafts- und Sozialkunde' }];
  const fullPeriods = () => periods().filter(p => AREAS.every(A => doc(`${p}_${A.a}`)));
  function startSet(period, strict) {
    if (!fullPeriods().includes(period)) return AP2Toast('Für diesen Termin fehlen Hefte.');
    const id = 'p' + Date.now().toString(36);
    st.sets = st.sets || {};
    st.sets[id] = { id, period, strict, created: Date.now(), areas: AREAS.map(A => ({ k: A.k, a: null, b: null, started: 0, endsAt: 0, done: 0 })), next: 0 };
    S.save(true); startArea(st.sets[id], 0);
  }
  function startArea(set, i) {
    const A = AREAS[i], ar = set.areas[i];
    ar.started = Date.now(); ar.endsAt = set.strict ? Date.now() + A.min * 60000 : 0;
    ar.a = makeExam(`${set.period}_${A.a}`, set.strict, ar.endsAt, set.id);
    set.next = i; set.justDone = null; S.save(true); go('#/exam/' + ar.a);
  }
  function setAfterA(e, auto) {
    const set = (st.sets || {})[e.set]; if (!set) return go('#/result/' + e.id);
    const i = set.areas.findIndex(x => x.a === e.id); const ar = set.areas[i], A = AREAS[i];
    ar.b = makeBExam(`${set.period}_${A.b}`, set.strict, ar.endsAt, set.id);
    S.save(true);
    if (!ar.b) return setAreaDone(set.id);
    if (!auto) AP2Toast('Teil A abgegeben und gesperrt – weiter mit Teil B. Die Uhr läuft weiter.');
    go('#/bexam/' + ar.b);
  }
  function setAreaDone(setId) {
    const set = (st.sets || {})[setId]; if (!set) return go('#/exams');
    const i = set.areas.findIndex(x => !x.done && x.started); if (i >= 0) { set.areas[i].done = Date.now(); set.justDone = i; }
    if (set.areas.every(x => x.done)) set.finished = Date.now();
    S.save(true); go('#/set/' + setId);
  }
  const setOpen = set => !set.finished;
  function setView(m, [id]) {
    const set = (st.sets || {})[id]; if (!set) { go('#/exams'); return; }
    const nextI = set.areas.findIndex(x => !x.done);
    const running = set.areas.findIndex(x => x.started && !x.done);
    const left = ar => ar.endsAt ? Math.max(0, Math.round((ar.endsAt - Date.now()) / 60000)) : null;
    const area = (A, i) => {
      const ar = set.areas[i], ea = ar.a && st.exams[ar.a], eb = ar.b && (st.bexams || {})[ar.b];
      let body;
      if (ar.done) {
        body = `<div class="set-res">${ea && ea.score ? `<a class="row" href="#/result/${ea.id}"><b>Teil A</b><span>${ea.score.right} von ${ea.score.max} richtig</span><span class="score">${ea.score.percent} %</span></a>` : ''}
          ${eb ? (eb.result ? `<a class="row" href="#/bresult/${eb.id}"><b>Teil B</b><span>${eb.result.pts} von ${eb.result.max} Punkten</span><span class="score">Note ${eb.result.note}</span></a>` : `<a class="row" href="#/bcorr/${eb.id}/0"><b>Teil B</b><span>abgegeben, noch nicht korrigiert</span><span class="btn sm primary">Korrigieren</span></a>`) : ''}</div>`;
      } else if (ar.started) {
        const inB = ea && ea.submitted;
        body = `<p>${inB ? 'Teil A ist abgegeben und gesperrt. Teil B läuft.' : 'Teil A läuft.'}${ar.endsAt ? ` Noch <b>${left(ar)} min</b> für ${inB ? 'Teil B' : 'Teil A und B'}.` : ''}</p><div class="actions"><a class="btn primary" href="#/${inB ? 'bexam/' + ar.b : 'exam/' + ar.a}">Weiter mit Teil ${inB ? 'B' : 'A'}</a></div>`;
      } else if (i === nextI && running < 0) {
        body = `<p class="muted">Teil A (gebunden), danach Teil B (ungebunden) – zusammen ${set.strict ? A.min + ' Minuten' : 'ohne Zeitlimit'}.</p><div class="actions"><button class="btn primary" data-area="${i}">${ic('timer')} ${A.label} starten</button></div>`;
      } else body = `<p class="muted">Kommt nach ${AREAS[i - 1] ? AREAS[i - 1].label : ''}.</p>`;
      return `<section class="card set-area ${ar.done ? 'done' : ar.started ? 'run' : ''}"><div class="set-h"><span class="set-no">${i + 1}</span><div><h2>${A.label}</h2><span class="muted small">${set.strict ? A.min + ' min für Teil A und B' : 'ohne Zeitlimit'}</span></div>${ar.done ? `<span class="pill ok">${ic('check')} abgegeben</span>` : ar.started ? '<span class="pill warn">läuft</span>' : ''}</div>${body}</section>`;
    };
    const jd = set.justDone, nx = set.areas.findIndex(x => !x.done);
    m.innerHTML = `<header class="page-h"><a class="link" href="#/exams">← Prüfungen</a><h1>${esc(periodLabel(set.period))} komplett</h1><p>${set.strict ? 'Mit offizieller Zeit: die Uhr läuft auch weiter, wenn du die App schließt.' : 'Ohne Zeitlimit.'} Teil A wird mit der Abgabe gesperrt, erst dann kommt Teil B. Teil B korrigierst du am Ende mit der Musterlösung.</p></header>
      ${jd != null && nx >= 0 ? `<section class="meter empty set-pause"><div class="meter-r"><h2>${AREAS[jd].label} abgegeben.</h2><ul><li><span>Pause machen oder direkt mit <b>${AREAS[nx].label}</b> weiter? Die Zeit für den nächsten Bereich startet erst, wenn du ihn beginnst.</span></li></ul><div class="actions wrap"><button class="btn primary" data-area="${nx}">${ic('timer')} Direkt weiter: ${AREAS[nx].label}</button><button class="btn" id="setPause">Pause – später weiter</button></div></div></section>` : ''}
      ${set.finished ? `<section class="meter empty"><div class="meter-r"><h2>Alle drei Prüfungsbereiche abgegeben.</h2><ul><li><span>Teil A ist schon ausgewertet. Jetzt Teil B mit der Musterlösung korrigieren, dann siehst du die Punkte und Noten.</span></li></ul></div></section>` : ''}
      ${set.finished ? gradeCard(set) : ''}
      ${AREAS.map(area).join('')}`;
    $$('[data-area]', m).forEach(b => b.onclick = () => startArea(set, +b.dataset.area));
    $$('[data-gs]', m).forEach(inp => inp.onchange = () => { const v = inp.value.trim().replace(',', '.'); st.settings[inp.dataset.gs] = v === '' ? null : Math.max(0, Math.min(100, +v)); S.save(true); route(); });
    const sp = $('#setPause'); if (sp) sp.onclick = () => { set.justDone = null; S.save(true); AP2Toast('Pause. Weiter geht es über die Startseite → Weitermachen.'); go('#/'); };
  }
  // Ergebnis eines Bereichs: Teil A (% richtig) und Teil B (% der Punkte); WiSo Teil B: nur 5 der 6 offenen Aufgaben zählen (die beste Auswahl)
  function setAreaPct(set, i) {
    const ar = set.areas[i], ea = ar.a && st.exams[ar.a], eb = ar.b && (st.bexams || {})[ar.b];
    const a = ea && ea.score ? ea.score.percent : null;
    let b = null, bOpen = false;
    if (eb) {
      const ts = bTasks(eb); if (!eb.result) bOpen = true;
      else { let rows = ts.map(t => ({ p: eb.recs[t.id].pts || 0, m: t.points }));
        if (eb.part === 'WISO' && rows.length > 5) rows = rows.sort((x, y) => (y.p - x.p) || (y.m - x.m)).slice(0, 5);
        const mx = rows.reduce((q, r) => q + r.m, 0); b = mx ? Math.round(1000 * rows.reduce((q, r) => q + r.p, 0) / mx) / 10 : 0; }
    }
    const wA = (st.settings.gradeA == null ? 50 : st.settings.gradeA) / 100;
    const total = a == null ? null : b == null ? (eb ? null : a) : C.areaResult(a, b, wA);
    return { a, b, bOpen, total };
  }
  function gradeCard(set) {
    const res = AREAS.map((A, i) => setAreaPct(set, i));
    const gv = k => st.settings[k] == null ? '' : st.settings[k];
    const inputs = `<div class="grade-in"><label>Anteil Teil A je Bereich <input class="inp" type="number" min="0" max="100" data-gs="gradeA" value="${st.settings.gradeA == null ? 50 : st.settings.gradeA}"> %</label>
      <label>Dein Ergebnis Teil 1 <input class="inp" type="number" min="0" max="100" data-gs="t1" value="${gv('t1')}" placeholder="z. B. 72"> Punkte</label>
      <label>Arbeitsauftrag (geschätzt) <input class="inp" type="number" min="0" max="100" data-gs="aa" value="${gv('aa')}" placeholder="z. B. 70"> Punkte</label></div>`;
    if (res.some(r => r.total == null)) return `<section class="card grade-card"><h2>Gesamtnote</h2><p>Sobald du Teil B aller drei Bereiche korrigiert hast, steht hier deine Note nach IHK-Schlüssel – je Bereich, für den schriftlichen Teil und mit Teil 1 und Arbeitsauftrag auch insgesamt.</p></section>`;
    const F = C.finalResult({ se: res[0].total, fusa: res[1].total, wiso: res[2].total, t1: st.settings.t1, aa: st.settings.aa });
    const g = (p, gr) => `<b>${p.toLocaleString('de-DE')}</b> P · Note ${gr.note} <span class="muted">(${gr.label})</span>`;
    const why = [];
    if (F.written < 50) why.push('Die drei schriftlichen Bereiche zusammen liegen unter 50 Punkten.');
    if (F.okAreas < 2) why.push('Weniger als zwei Bereiche sind mindestens ausreichend (50 Punkte).');
    if (F.ungen) why.push('Ein Bereich liegt unter 30 Punkten (ungenügend) – das darf nicht sein.');
    if (F.total != null && F.total < 50) why.push('Das Gesamtergebnis liegt unter 50 Punkten.');
    if (st.settings.aa != null && st.settings.aa < 50) why.push('Der Arbeitsauftrag muss mindestens 50 Punkte haben.');
    const oral = !F.writtenPass && F.areas.some(x => x.p < 50 && x.p >= 30);
    return `<section class="card grade-card"><h2>Gesamtnote nach IHK</h2>
      <table class="tbl"><thead><tr><th>Bereich</th><th>Teil A</th><th>Teil B</th><th>Ergebnis</th><th>Gewicht</th></tr></thead><tbody>
      ${AREAS.map((A, i) => `<tr><td>${A.label}</td><td>${res[i].a} %</td><td>${res[i].b == null ? '–' : res[i].b + ' %'}</td><td>${g(res[i].total, C.ihkGrade(res[i].total))}</td><td>${[20, 20, 10][i]} %</td></tr>`).join('')}
      <tr class="sum"><td>Schriftlich gesamt</td><td></td><td></td><td>${g(F.written, F.writtenGrade)}</td><td>50 %</td></tr></tbody></table>
      <div class="grade-big ${F.writtenPass ? 'ok' : 'no'}"><span>${F.writtenPass ? ic('check') + ' Schriftlicher Teil bestanden' : ic('warn') + ' Schriftlicher Teil so nicht bestanden'}</span>
        ${F.total != null ? `<span>Gesamtnote mit Teil 1 und Arbeitsauftrag: ${g(F.total, F.totalGrade)} – ${F.pass ? '<b>bestanden</b>' : '<b>nicht bestanden</b>'}</span>` : '<span class="muted small">Für die Gesamtnote unten dein Ergebnis aus Teil 1 und eine Schätzung für den Arbeitsauftrag eintragen.</span>'}</div>
      ${why.length ? `<ul class="why">${why.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}
      ${oral ? '<p class="small">Liegt ein schriftlicher Bereich knapp darunter, kann eine <b>mündliche Ergänzungsprüfung</b> (ca. 15 min) den Ausschlag geben – schriftlich und mündlich zählen dann 2:1.</p>' : ''}
      ${inputs}
      <p class="muted small">So rechnet die App: Teil 1 zählt 40 %, Teil 2 60 %. In Teil 2 zählen Arbeitsauftrag 50 %, Systementwurf 20 %, Funktions- und Systemanalyse 20 %, WiSo 10 %. Notenschlüssel: ab 92 sehr gut, ab 81 gut, ab 67 befriedigend, ab 50 ausreichend, ab 30 mangelhaft. Quelle: IHK, Erläuterungen zum Prüfungsverfahren Elektroniker/-in für Betriebstechnik. <b>Annahme:</b> Wie Teil A und Teil B innerhalb eines Bereichs verrechnet werden, ist nicht veröffentlicht – die App nimmt standardmäßig 50 : 50 an (oben änderbar). Teil A wird in % richtig der 25 (WiSo 15) gewerteten Aufgaben gemessen, WiSo Teil B mit den besten 5 von 6 offenen Aufgaben.</p></section>`;
  }
  async function askSet(period) {
    const v = await ask({ title: `${periodLabel(period)} komplett`, text: 'Systementwurf, dann Funktions- und Systemanalyse, dann WiSo – jeweils Teil A und danach Teil B. Zwischen den Bereichen kannst du Pause machen.<br><br>Mit offizieller Zeit: 105 min je Bereich für Teil A und B zusammen, WiSo 60 min.', buttons: [['Mit offizieller Zeit', 'strict', 'primary'], ['Ohne Zeitlimit', 'free', ''], ['Abbrechen', false, 'ghost']] });
    if (v === 'strict' || v === 'free') startSet(period, v === 'strict');
  }
  async function startExam(docId, strict) {
    const d = doc(docId); const ts = tasksOf(docId);
    const sugg = d.part === 'WISO' ? 45 : 60;
    const v = await ask({ title: `${d.periodLabel} · ${PART_SHORT[d.part]}`, text: `${strict ? 'Simulation' : 'Übung'}: Zeit in Minuten (Vorschlag ${sugg}, 0 = ohne Limit). Offiziell: ${esc(d.officialTime || '')}.`, input: 'number', value: sugg, buttons: [['Starten', true, 'primary'], ['Abbrechen', false, 'ghost']] });
    if (v === false || v == null) return; const mins = +v; if (isNaN(mins)) return;
    const id = makeExam(docId, strict, mins > 0 ? Date.now() + mins * 60000 : 0);
    S.save(true); go('#/exam/' + id);
  }
  function makeExam(docId, strict, endsAt, set) {
    const d = doc(docId); const ts = tasksOf(docId); const id = 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    st.exams[id] = { id, docId, period: d.period, part: d.part, strict, taskIds: ts.map(t => t.id), answers: {}, flags: {}, deselected: [], cur: 0, started: Date.now(), endsAt, submitted: 0, set: set || null };
    ts.forEach(t => freshSheet(t.id));
    return id;
  }
  function examGrid(e, mode) {
    return `<div class="egrid">${e.taskIds.map((tid, i) => { const x = TASKS[tid]; let c;
      if (mode === 'review') { const r = e.score.rows.find(r => r.id === tid); c = [r.deselected ? 'des' : r.ok ? 'okc' : 'noc', i === e.rev ? 'cur' : '', x.mandatory ? 'mand' : ''].join(' '); }
      else c = [e.answers[tid] ? 'ans' : '', e.flags[tid] ? 'flag' : '', e.deselected.includes(x.number) ? 'des' : '', i === e.cur ? 'cur' : '', x.mandatory ? 'mand' : ''].join(' ');
      return `<button class="${c}" data-go="${i}" aria-label="Aufgabe ${x.number}">${x.number}</button>`; }).join('')}</div>`;
  }
  function exam(m, [id]) {
    const e = st.exams[id]; if (!e) { go('#/exams'); return; }
    if (e.submitted) { go(e.set && !e.setReview ? '#/set/' + e.set : '#/result/' + id); return; }
    if (e.endsAt && Date.now() >= e.endsAt) return submitExam(e, true);
    const t = TASKS[e.taskIds[e.cur]];
    m.innerHTML = `<div class="task-page exam-mode">
      <div class="exam-bar"><button class="back" id="pz"><svg class="ic"><use href="#i-left"/></svg>Zurück</button><div class="eb-l"><b>${esc(periodLabel(e.period))} · ${PART_SHORT[e.part]}</b><span class="pill ${e.strict ? 'warn' : ''}">${e.set ? 'Komplette Prüfung' : e.strict ? 'Simulation' : 'Übung'}</span></div>
        ${e.endsAt ? '<span class="timer big" id="timer"></span>' : ''}<span class="muted" id="cnt"></span>
        <div class="eb-r"><button class="btn sm ghost" id="ov">▦ Übersicht</button><button class="btn sm primary" id="sub">Abgeben</button></div></div>
      <div class="ovl" id="ovl" hidden><div class="card"><div class="ovl-h"><b>Übersicht</b><span class="muted small">blau = beantwortet · gelb unterstrichen = unsicher · durchgestrichen = abgewählt · fett = Pflicht</span><button class="ib" id="ovx">✕</button></div><div id="gridBox"></div></div></div>
      ${taskFrame(t, `<div class="answer card exam-card" id="ansBox"></div>`, { noReport: e.strict })}
    </div>`;
    wireFrame(t, m); hydrate(m);
    const panel = () => {
      const a = e.answers[t.id]; const isDes = e.deselected.includes(t.number);
      $('#cnt').textContent = `${Object.keys(e.answers).length}/${e.taskIds.length} beantwortet · ${e.deselected.length}/3 abgewählt`;
      $('#gridBox').innerHTML = examGrid(e);
      $('#ansBox').innerHTML = `<div class="ex-head"><span class="ex-no">${t.number}</span><span>von ${e.taskIds.length}${t.mandatory ? ' · <b>nicht abwählbar</b>' : ''}${isDes ? ' · <b>abgewählt</b>' : ''}</span></div>
        ${optButtons(a, isDes ? [1, 2, 3, 4, 5] : [])}
        <div class="ex-sec"><button class="chip ${e.flags[t.id] ? 'on' : ''}" id="flag">${e.flags[t.id] ? '★ unsicher' : '☆ unsicher markieren'}</button>
          ${t.mandatory ? '' : `<button class="chip ${isDes ? 'on' : ''}" id="des">${isDes ? 'Abwahl aufheben' : 'Abwählen'}</button>`}
          <button class="chip" id="clr" ${a ? '' : 'disabled'}>Antwort löschen</button></div>
        <div class="ex-nav"><button class="btn lg ghost" id="prev" ${e.cur === 0 ? 'disabled' : ''}>← Zurück</button><button class="btn lg ${a ? 'primary' : ''}" id="nxt">${e.cur + 1 < e.taskIds.length ? 'Weiter →' : 'Zur Abgabe'}</button></div>`;
      $$('#gridBox [data-go]').forEach(b => b.onclick = () => { $('#ovl').hidden = true; nav(+b.dataset.go); });
      $$('#ansBox .opt').forEach(b => b.onclick = () => { if (b.disabled) return; e.answers[t.id] = +b.dataset.o; S.save(true); panel(); });
      $('#prev').onclick = () => nav(e.cur - 1);
      $('#nxt').onclick = () => e.cur + 1 < e.taskIds.length ? nav(e.cur + 1) : $('#sub').click();
      $('#flag').onclick = () => { e.flags[t.id] = !e.flags[t.id]; S.save(true); panel(); };
      const cl = $('#clr'); if (cl) cl.onclick = () => { delete e.answers[t.id]; S.save(true); panel(); };
      const ds = $('#des'); if (ds) ds.onclick = () => { if (isDes) e.deselected = e.deselected.filter(n => n !== t.number); else if (e.deselected.length >= 3) return AP2Toast('Es dürfen höchstens 3 Aufgaben abgewählt werden.'); else e.deselected.push(t.number); S.save(true); panel(); };
    };
    const nav = i => { e.cur = Math.max(0, Math.min(e.taskIds.length - 1, i)); S.save(true); route(); };
    panel();
    $('#ov').onclick = () => { $('#ovl').hidden = !$('#ovl').hidden; };
    $('#ovx').onclick = () => { $('#ovl').hidden = true; };
    const tm = $('#timer'); if (tm) { const upd = () => { const r = e.endsAt - Date.now(); if (r <= 0) return submitExam(e, true); tm.textContent = fmt(r); tm.classList.toggle('low', r < 300000); }; upd(); tick = setInterval(upd, 1000); }
    $('#sub').onclick = async () => { const open = e.taskIds.filter(x => !e.answers[x] && !e.deselected.includes(TASKS[x].number)).length; const fl = Object.values(e.flags).filter(Boolean).length; if (await ask({ title: 'Prüfung abgeben?', text: (open ? `${open} Aufgaben sind noch offen.` : 'Alle Aufgaben sind beantwortet.') + (fl ? ` ${fl} als unsicher markiert.` : ''), buttons: [['Abgeben', true, 'primary'], ['Weiter bearbeiten', false, 'ghost']] })) submitExam(e, false); };
    const pz = $('#pz'); if (pz) pz.onclick = () => { if (e.strict) AP2Toast('Gespeichert. Bei der Simulation läuft die Zeit weiter.'); go(e.set ? '#/set/' + e.set : '#/exams'); };
  }
  /* Korrekturdurchgang nach Abgabe: Aufgabe für Aufgabe, mit eigener und offizieller Antwort */
  function review(m, [id, idx]) {
    const e = st.exams[id]; if (!e || !e.submitted) { go('#/exams'); return; }
    e.rev = Math.max(0, Math.min(e.taskIds.length - 1, +idx || 0));
    const t = TASKS[e.taskIds[e.rev]]; const r = e.score.rows.find(x => x.id === t.id);
    const cls = {}; if (r.answer) cls[r.answer] = r.ok ? 'good' : 'bad'; cls[r.correct] = 'good';
    const rOpts = { tutor: () => 'full', myAnswer: () => r.answer ? 'Antwort ' + r.answer : 'nicht beantwortet' };
    const verdict = r.deselected ? 'Abgewählt – nicht gewertet' : r.blocked ? 'Laut IHK nicht gewertet' : r.ok ? '✓ Richtig' : r.answer ? '✗ Falsch' : '✗ Nicht beantwortet';
    m.innerHTML = `<div class="task-page exam-mode">
      <div class="exam-bar"><div class="eb-l"><a class="btn sm ghost" href="#/result/${e.id}">← Auswertung</a><b>Korrektur: ${esc(periodLabel(e.period))} · ${PART_SHORT[e.part]}</b></div><span class="muted">${e.score.right}/${e.score.max} richtig</span>
        <div class="eb-r"><button class="btn sm ghost" id="ov">▦ Übersicht</button></div></div>
      <div class="ovl" id="ovl" hidden><div class="card"><div class="ovl-h"><b>Übersicht</b><span class="muted small">grün = richtig · rot = falsch/offen · grau = abgewählt</span><button class="ib" id="ovx">✕</button></div>${examGrid(e, 'review')}</div></div>
      ${taskFrame(t, `<div class="answer card exam-card"><div class="ex-head"><span class="ex-no">${t.number}</span><span>von ${e.taskIds.length}</span></div>
        <div class="fb ${r.ok ? 'good' : r.deselected || r.blocked ? 'warn' : 'bad'}"><b>${verdict}</b><span>Deine Antwort: ${r.answer ? NUM[r.answer - 1] : '–'} · Lösung: ${NUM[r.correct - 1]}</span><span class="muted small">Beleg: IHK-Schablone ${t.solution.template}, Lösungsheft S. ${t.solution.page}</span><button class="link" id="sk">Lösungsschablone ansehen</button></div>
        ${optButtons(null, [1, 2, 3, 4, 5], cls)}
        <div class="ex-sec"><button class="chip" id="onlyWrong">Nur Fehler durchgehen: ${e.reviewWrong ? 'an' : 'aus'}</button><button class="chip" id="tutorExplain"><svg class="ic"><use href="#i-spark"/></svg> Nachfragen</button></div><div id="xpl"></div>
        <div class="ex-nav"><button class="btn lg ghost" id="prev">← Zurück</button><button class="btn lg primary" id="nxt">Weiter →</button></div></div>`, rOpts)}
    </div>`;
    wireFrame(t, m, rOpts); hydrate(m);
    $('#tutorExplain', m).onclick = () => openTutor(t, rOpts, 'explain');
    if (!r.deselected && !r.blocked) explainInline($('#xpl', m), t, rOpts, !r.ok);
    const wrongIdx = e.score.rows.map((x, i) => (!x.ok && !x.deselected && !x.blocked) ? i : -1).filter(i => i >= 0);
    const step = d => { let i = e.rev + d; if (e.reviewWrong) { const l = d > 0 ? wrongIdx.filter(j => j > e.rev) : wrongIdx.filter(j => j < e.rev).reverse(); if (!l.length) return AP2Toast('Keine weiteren Fehler.'); i = l[0]; } if (i < 0 || i >= e.taskIds.length) return; go(`#/review/${e.id}/${i}`); };
    $('#prev').onclick = () => step(-1); $('#nxt').onclick = () => step(1);
    $('#onlyWrong').onclick = () => { e.reviewWrong = !e.reviewWrong; S.save(true); route(); };
    $('#sk').onclick = () => openPage(`${t.period}_LOES`, t.solution.page, 'Lösungsschablone ' + t.solution.template);
    $$('#ovl [data-go]').forEach(b => b.onclick = () => go(`#/review/${e.id}/${b.dataset.go}`));
    $('#ov').onclick = () => { $('#ovl').hidden = !$('#ovl').hidden; }; $('#ovx').onclick = () => { $('#ovl').hidden = true; };
  }
  function submitExam(e, auto) {
    const ts = e.taskIds.map(id => TASKS[id]);
    e.score = C.scoreExam(ts, e.answers, e.deselected); e.submitted = Date.now(); e.auto = !!auto;
    for (const r of e.score.rows) if (r.graded && r.answer != null) { const t = TASKS[r.id]; st.srs[r.id] = C.updateSrs(st.srs[r.id], r.ok ? 'first' : 'wrong', Date.now()); st.attempts.push({ task: r.id, v: t.version, mode: e.strict ? 'simulation' : 'exam', tries: [r.answer], result: r.ok ? 'first' : 'wrong', at: Date.now() }); }
    S.save(true); if (auto) AP2Toast('Zeit abgelaufen – automatisch abgegeben.');
    if (e.set) return setAfterA(e, auto);
    go('#/result/' + e.id);
  }
  function result(m, [id]) {
    const e = st.exams[id]; if (!e || !e.submitted) { go('#/exams'); return; }
    const sc = e.score;
    m.innerHTML = `<header class="page-h"><h1>Auswertung: ${esc(periodLabel(e.period))} · ${PART_SHORT[e.part]}</h1>
      <p>${e.strict ? 'Simulation' : 'Übung'}${e.auto ? ' · automatisch abgegeben (Zeit)' : ''} · Dauer ${fmt(e.submitted - e.started)}</p></header>
      <section class="kpis">${kpi('Richtig', `${sc.right}<small>/${sc.max}</small>`, 'gewertete Aufgaben')}${kpi('Quote', sc.percent + '%', 'keine offizielle Note')}${kpi('Abgewählt', sc.deselected.join(', ') || '–', sc.deselected.length && !e.deselected.length ? 'automatisch: letzte abwählbare' : '')}</section>
      <section class="card"><table class="tbl"><thead><tr><th>Nr.</th><th>Deine Antwort</th><th>Lösung</th><th>Ergebnis</th><th></th></tr></thead><tbody>
      ${sc.rows.map(r => `<tr class="${r.deselected ? 'des' : r.ok ? 'ok' : 'no'}"><td>${r.number}${TASKS[r.id].mandatory ? ' <small class="muted">P</small>' : ''}</td><td>${r.answer ? NUM[r.answer - 1] : '–'}</td><td>${NUM[r.correct - 1]}</td><td>${r.deselected ? 'abgewählt' : r.blocked ? 'nicht gewertet (IHK)' : r.ok ? '✓' : '✗'}</td><td><a class="link" href="#/review/${e.id}/${sc.rows.indexOf(r)}">ansehen</a></td></tr>`).join('')}
      </tbody></table><p class="muted small">P = Pflichtaufgabe. Lösungen laut IHK-Lösungsschablone ${TASKS[e.taskIds[0]].solution.template}, Lösungsheft S. ${TASKS[e.taskIds[0]].solution.page}. ${sc.rows.some(r => r.blocked) ? 'Aufgaben, die laut IHK-Änderungsmitteilung nicht lösbar sind, werden nicht gewertet.' : ''}</p></section>
      <div class="actions wrap"><a class="btn primary" href="#/review/${e.id}/0">Korrektur Aufgabe für Aufgabe</a><a class="btn ghost" href="#/exams">Weitere Prüfung</a><button class="btn ghost" id="key">Lösungsschablone ansehen</button></div>`;
    $('#key').onclick = () => openPage(`${e.period}_LOES`, TASKS[e.taskIds[0]].solution.page, 'Lösungsschablone');
  }

  /* ---------- Bibliothek ---------- */
  function library(m) {
    m.innerHTML = `<header class="page-h"><h1>Bibliothek</h1><p>Alle ${DOCS.length} Originalhefte (neueste zuerst) als Originalseiten. Teil A/WiSo als MC-Aufgaben, Teil B und WiSo U als offene Aufgaben mit Musterlösung.</p></header>
      <div class="lib">${periods().map(p => `<section class="card"><h2>${esc(periodLabel(p))}</h2><div class="docs">${['SE_A', 'SE_B', 'FUSA_A', 'FUSA_B', 'WISO', 'LOES'].map(pt => { const d = doc(`${p}_${pt}`); if (!d) return ''; return `<a class="docc" href="#/doc/${d.id}"><img loading="lazy" data-src="${d.pageImages[0]}" alt=""><b>${PART_SHORT[pt]}</b><span class="muted small">${d.pages} S.${d.mcCount ? ` · ${d.mcCount} Aufg.` : ''}${tasksOf(d.id, 'open').length ? ` · U1–U${tasksOf(d.id, 'open').length}` : ''}</span></a>`; }).join('')}</div></section>`).join('')}</div>`;
  }
  function docview(m, [id, pg]) {
    const d = doc(id); if (!d) return library(m);
    const ts = tasksOf(id).concat(tasksOf(id, 'open')); const p = Math.max(1, Math.min(d.pageImages.length, +pg || 1));
    m.innerHTML = `<header class="page-h"><a class="link" href="#/library">← Bibliothek</a><h1>${esc(d.periodLabel)} · ${esc(d.partLabel)}</h1>
      <p class="muted small">SHA-256 ${d.sha256.slice(0, 16)}… · ${d.pages} Seiten${d.officialTime ? ' · Zeit: ' + esc(d.officialTime) : ''}</p></header>
      ${ts.length ? `<section class="card"><h2>Einzelaufgaben</h2><div class="tgrid">${ts.map(t => { const e = st.srs[t.id]; return `<a href="#/task/${t.id}" class="tb ${t.gradable ? '' : 'blk'} ${e && e.seen ? (e.box >= 2 ? 'good' : 'weak') : ''}" title="${t.gradable ? 'bewertbar' : esc(t.blockedReason)}">${t.type === 'open' ? t.label : t.number}</a>`; }).join('')}</div></section>` : ''}
      <section class="card pv"><div class="pv-bar"><button class="btn sm ghost" id="pp">‹</button><span>Seite ${p}/${d.pageImages.length}</span><button class="btn sm ghost" id="np">›</button><button class="btn sm ghost" id="pin"><svg class="ic"><use href="#i-clip"/></svg> anheften</button></div>
      <img class="page" data-src="${d.pageImages[p - 1]}" alt="Seite ${p}"></section>`;
    $('#pp').onclick = () => go(`#/doc/${id}/${Math.max(1, p - 1)}`);
    $('#np').onclick = () => go(`#/doc/${id}/${Math.min(d.pageImages.length, p + 1)}`);
    $('#pin').onclick = () => openPage(id, p);
  }

  /* ---------- schwebende Fenster (Anlagen anheften) ---------- */
  let zTop = 100;
  function openPage(docId, page, title) {
    const d = doc(docId); if (!d) return AP2Toast('Seite nicht verfügbar.');
    win(title || `${d.periodLabel} · ${PART_SHORT[d.part]}`, d, page);
  }
  const openBook = (docId, page) => openPage(docId, page);
  function win(title, d, page) {
    const w = document.createElement('div'); w.className = 'win'; w.style.zIndex = ++zTop;
    const n = $$('.win').length; w.style.left = (80 + n * 30) + 'px'; w.style.top = (70 + n * 30) + 'px';
    let p = page || 1, z = 1;
    w.innerHTML = `<div class="win-h"><b>${esc(title)}</b><span class="pg"></span><button data-a="p">‹</button><button data-a="n">›</button><button data-a="-">−</button><button data-a="+">+</button><button data-a="x" aria-label="Schließen">✕</button></div><div class="win-b"><img alt=""></div>`;
    $('#windows').appendChild(w);
    const show = async () => { $('img', w).src = await imgURL(d.pageImages[p - 1]); $('img', w).style.width = z * 100 + '%'; $('.pg', w).textContent = `S. ${p}/${d.pageImages.length}`; };
    show();
    w.addEventListener('pointerdown', () => w.style.zIndex = ++zTop);
    $('.win-h', w).addEventListener('click', e => { const a = e.target.dataset.a; if (!a) return; if (a === 'x') w.remove(); if (a === 'p') p = Math.max(1, p - 1); if (a === 'n') p = Math.min(d.pageImages.length, p + 1); if (a === '+') z = Math.min(4, z + .25); if (a === '-') z = Math.max(.5, z - .25); show(); });
    const h = $('.win-h', w);
    h.addEventListener('pointerdown', e => { if (e.target.tagName === 'BUTTON') return; const sx = e.clientX - w.offsetLeft, sy = e.clientY - w.offsetTop; try { h.setPointerCapture(e.pointerId); } catch (_) {} h.onpointermove = ev => { w.style.left = Math.max(0, ev.clientX - sx) + 'px'; w.style.top = Math.max(0, ev.clientY - sy) + 'px'; }; h.onpointerup = () => h.onpointermove = null; });
  }

  /* ---------- Prüfungssimulation Teil B / WiSo offen: schreiben → abgeben → korrigieren (Musterlösung, Zahlen automatisch, KI-Vorschlag) → Note ---------- */
  const bPartLabel = p => p === 'WISO' || p === 'WISO_U' ? 'WiSo offene Aufgaben' : PART_SHORT[p];
  const bTasks = e => e.taskIds.map(id => TASKS[id]).filter(Boolean);
  const bHasAnswer = (e, t) => { const r = e.recs[t.id]; const a = (r && r.ans) || {}; return Object.values(a).some(x => (x.text && x.text.trim()) || (x.values || []).some(v => v && String(v).trim())) || (st.ink[t.id] || []).some(pg => pg && pg.length); };
  const bProgress = e => e.submitted ? `${bTasks(e).filter(t => e.recs[t.id].phase === 'done').length}/${e.taskIds.length} korrigiert` : `${bTasks(e).filter(t => bHasAnswer(e, t)).length}/${e.taskIds.length} bearbeitet`;
  async function startBExam(docId, strict) {
    const d = doc(docId); const ts = tasksOf(docId, 'open').filter(t => t.gradable);
    if (!ts.length) return AP2Toast('Keine bewertbaren Aufgaben in diesem Heft.');
    const wiso = d.part === 'WISO'; const sugg = wiso ? 30 : 60;
    const skipped = tasksOf(docId, 'open').length - ts.length;
    const v = await ask({ title: `${d.periodLabel} · ${bPartLabel(d.part)}`, text: `${strict ? 'Simulation' : 'Übung'} mit ${ts.length} Aufgaben (${ts.reduce((a, t) => a + t.points, 0)} Punkte)${skipped ? `, ${skipped} wegen fehlender Scanseite ausgelassen` : ''}. Teil B: keine Abwahl möglich.<br>Zeit in Minuten (Vorschlag ${sugg}, 0 = ohne Limit). Offiziell: ${wiso ? 'WiSo 60 min für gebundene und offene Aufgaben zusammen' : '105 min für Teil A und B zusammen'}.<br>Rechnen kannst du auf dem Rechenpapier; Zahlenergebnisse bitte ins Feld tippen.`, input: 'number', value: sugg, buttons: [['Starten', true, 'primary'], ['Abbrechen', false, 'ghost']] });
    if (v === false || v == null) return; const mins = +v; if (isNaN(mins)) return;
    const id = makeBExam(docId, strict, mins > 0 ? Date.now() + mins * 60000 : 0);
    S.save(true); go('#/bexam/' + id);
  }
  function makeBExam(docId, strict, endsAt, set) {
    const d = doc(docId); const ts = tasksOf(docId, 'open').filter(t => t.gradable); if (!ts.length) return null;
    const id = 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    st.bexams = st.bexams || {};
    st.bexams[id] = { id, docId, period: d.period, part: d.part, strict, taskIds: ts.map(t => t.id), recs: Object.fromEntries(ts.map(t => [t.id, { ans: null, self: {}, phase: 'ask' }])), cur: 0, started: Date.now(), endsAt, submitted: 0, result: null, set: set || null };
    // eigenes, leeres Rechenpapier für die Prüfung (vorheriges wird gesichert)
    ts.forEach(t => freshSheet(t.id));
    return id;
  }
  function bGrid(e, mode) {
    return `<div class="egrid">${bTasks(e).map((t, i) => { const r = e.recs[t.id];
      const c = mode === 'corr' ? [r.phase === 'done' ? 'okc' : '', i === e.cur ? 'cur' : ''].join(' ') : [bHasAnswer(e, t) ? 'ans' : '', i === e.cur ? 'cur' : ''].join(' ');
      return `<button class="${c}" data-go="${i}">${esc(t.label)}</button>`; }).join('')}</div>`;
  }
  function bexam(m, [id]) {
    const e = (st.bexams || {})[id]; if (!e) { go('#/exams'); return; }
    if (e.submitted) { go('#/bresult/' + id); return; }
    if (e.endsAt && Date.now() >= e.endsAt) return bSubmit(e, true);
    const ts = bTasks(e); e.cur = Math.max(0, Math.min(ts.length - 1, e.cur)); const t = ts[e.cur]; const rec = e.recs[t.id];
    m.innerHTML = `<div class="task-page exam-mode">
      <div class="exam-bar"><button class="back" id="pz"><svg class="ic"><use href="#i-left"/></svg>Zurück</button><div class="eb-l"><b>${esc(periodLabel(e.period))} · ${e.set ? (e.part === 'WISO' ? 'WiSo Teil B (offen)' : bPartLabel(e.part)) : bPartLabel(e.part)}</b><span class="pill ${e.strict ? 'warn' : ''}">${e.set ? 'Komplette Prüfung · Teil A gesperrt' : e.strict ? 'Simulation' : 'Übung'}</span></div>
        ${e.endsAt ? '<span class="timer big" id="timer"></span>' : ''}<span class="muted" id="cnt">${bProgress(e)}</span>
        <div class="eb-r"><button class="btn sm ghost" id="ov">▦ Übersicht</button><button class="btn sm primary" id="sub">Abgeben</button></div></div>
      <div class="ovl" id="ovl" hidden><div class="card"><div class="ovl-h"><b>Übersicht</b><span class="muted small">blau = bearbeitet</span><button class="ib" id="ovx">✕</button></div>${bGrid(e)}</div></div>
      ${taskFrame(t, `<div class="answer card exam-card openc"><div class="ex-head"><span class="ex-no">${esc(t.label)}</span><span>${e.cur + 1} von ${ts.length} · ${t.points} Punkte</span></div>
        <div id="bBox">${openPanelHTML(t, rec.ans, null).replace(/ · Bewertung durch Selbstkontrolle[^<]*/, '')}</div>
        <div class="ex-nav"><button class="btn lg ghost" id="prev" ${e.cur ? '' : 'disabled'}>← Zurück</button><button class="btn lg primary" id="nxt">${e.cur + 1 < ts.length ? 'Weiter →' : 'Zur Abgabe'}</button></div></div>`, { noReport: e.strict })}
    </div>`;
    wireFrame(t, m); hydrate(m);
    const box = $('#bBox', m); let tmo = null;
    box.addEventListener('input', () => { clearTimeout(tmo); tmo = setTimeout(() => { if (!box.isConnected) return; rec.ans = readOpen(box, t); S.save(); const c = $('#cnt'); if (c) c.textContent = bProgress(e); }, 300); });
    const keep = () => { rec.ans = readOpen(box, t); S.save(true); };
    const nav = i => { keep(); e.cur = i; S.save(true); route(); };
    $('#prev').onclick = () => nav(e.cur - 1);
    $('#nxt').onclick = () => e.cur + 1 < ts.length ? nav(e.cur + 1) : $('#sub').click();
    $$('#ovl [data-go]', m).forEach(b => b.onclick = () => nav(+b.dataset.go));
    $('#ov').onclick = () => { $('#ovl').hidden = !$('#ovl').hidden; }; $('#ovx').onclick = () => { $('#ovl').hidden = true; };
    const pz = $('#pz'); if (pz) pz.onclick = () => { keep(); if (e.strict) AP2Toast('Gespeichert. Bei der Simulation läuft die Zeit weiter.'); go(e.set ? '#/set/' + e.set : '#/exams'); };
    const tm = $('#timer'); if (tm) { const upd = () => { const r = e.endsAt - Date.now(); if (r <= 0) { keep(); return bSubmit(e, true); } tm.textContent = fmt(r); tm.classList.toggle('low', r < 300000); }; upd(); tick = setInterval(upd, 1000); }
    $('#sub').onclick = async () => { keep(); const open = ts.filter(x => !bHasAnswer(e, x)).length;
      if (await ask({ title: 'Prüfung abgeben?', text: (open ? `${open} Aufgaben sind noch ohne Antwort.` : 'Alle Aufgaben bearbeitet.') + ' Danach korrigierst du Aufgabe für Aufgabe mit der Musterlösung.', buttons: [['Abgeben', true, 'primary'], ['Weiter bearbeiten', false, 'ghost']] })) bSubmit(e, false); };
  }
  function bSubmit(e, auto) {
    e.submitted = Date.now(); e.cur = 0;
    bTasks(e).forEach(t => { const r = e.recs[t.id]; r.ans = r.ans || {}; r.phase = 'check'; r.self = r.self || {}; });
    S.save(true); if (auto) AP2Toast('Zeit abgelaufen – automatisch abgegeben.');
    if (e.set) return setAreaDone(e.set);
    go(`#/bcorr/${e.id}/0`);
  }
  function bFinish(e) {
    const ts = bTasks(e); if (!ts.every(t => e.recs[t.id].phase === 'done')) return;
    const pts = ts.reduce((a, t) => a + (e.recs[t.id].pts || 0), 0), max = ts.reduce((a, t) => a + t.points, 0);
    const percent = max ? Math.round(1000 * pts / max) / 10 : 0; const g = C.ihkGrade(percent);
    e.result = { pts, max, percent, note: g.note, label: g.label, passed: g.passed, at: Date.now() };
  }
  function bcorr(m, [id, idx]) {
    const e = (st.bexams || {})[id]; if (!e || !e.submitted) { go('#/exams'); return; }
    const ts = bTasks(e); e.cur = Math.max(0, Math.min(ts.length - 1, +idx || 0)); const t = ts[e.cur]; const rec = e.recs[t.id];
    const cOpts = { tutor: () => 'full', myAnswer: () => openAnswerText(t, rec) };
    m.innerHTML = `<div class="task-page exam-mode">
      <div class="exam-bar"><div class="eb-l"><a class="btn sm ghost" href="#/bresult/${e.id}">← Auswertung</a><b>Korrektur: ${esc(periodLabel(e.period))} · ${bPartLabel(e.part)}</b></div><span class="muted">${bProgress(e)}</span>
        <div class="eb-r"><button class="btn sm ghost" id="ov">▦ Übersicht</button></div></div>
      <div class="ovl" id="ovl" hidden><div class="card"><div class="ovl-h"><b>Übersicht</b><span class="muted small">grün = korrigiert</span><button class="ib" id="ovx">✕</button></div>${bGrid(e, 'corr')}</div></div>
      ${taskFrame(t, `<div class="answer card exam-card openc"><div class="ex-head"><span class="ex-no">${esc(t.label)}</span><span>${e.cur + 1} von ${ts.length}</span></div><div id="openBox"></div>
        <div class="ex-nav"><button class="btn lg ghost" id="prev" ${e.cur ? '' : 'disabled'}>← Zurück</button><button class="btn lg ${rec.phase === 'done' ? 'primary' : 'ghost'}" id="nxt">${e.cur + 1 < ts.length ? 'Weiter →' : 'Zur Auswertung'}</button></div></div>`, cOpts)}
    </div>`;
    wireFrame(t, m, cOpts); hydrate(m);
    openWidget(m, t, rec, (r, gr) => { if (gr) { rec.pts = gr.pts; recordOpen(t, r, gr, 'bexam'); bFinish(e); S.save(true); if (e.result) go('#/bresult/' + e.id); else { const nx = ts.findIndex((x, i) => i > e.cur && e.recs[x.id].phase !== 'done'); go(`#/bcorr/${e.id}/${nx >= 0 ? nx : ts.findIndex(x => e.recs[x.id].phase !== 'done')}`); } } else S.save(); });
    $('#prev').onclick = () => go(`#/bcorr/${e.id}/${e.cur - 1}`);
    $('#nxt').onclick = () => go(e.cur + 1 < ts.length ? `#/bcorr/${e.id}/${e.cur + 1}` : `#/bresult/${e.id}`);
    $$('#ovl [data-go]', m).forEach(b => b.onclick = () => go(`#/bcorr/${e.id}/${b.dataset.go}`));
    $('#ov').onclick = () => { $('#ovl').hidden = !$('#ovl').hidden; }; $('#ovx').onclick = () => { $('#ovl').hidden = true; };
  }
  function bresult(m, [id]) {
    const e = (st.bexams || {})[id]; if (!e) { go('#/exams'); return; }
    if (!e.submitted) { go('#/bexam/' + id); return; }
    const ts = bTasks(e); const done = ts.filter(t => e.recs[t.id].phase === 'done');
    const pts = done.reduce((a, t) => a + (e.recs[t.id].pts || 0), 0), max = ts.reduce((a, t) => a + t.points, 0);
    const R = e.result;
    m.innerHTML = `<header class="page-h"><h1>${esc(periodLabel(e.period))} · ${bPartLabel(e.part)}</h1><p>${e.strict ? 'Simulation' : 'Übung'} · abgegeben ${new Date(e.submitted).toLocaleString('de-DE')} · Bearbeitungszeit ${fmt(e.submitted - e.started)}</p></header>
      <section class="kpis">${R ? `${kpi('Punkte', `${R.pts}<small>/${R.max}</small>`, R.percent + ' %')}${kpi('IHK-Note', R.note, R.label)}${kpi('Ergebnis', R.passed ? '✓' : '✗', R.passed ? 'bestanden (ab 50 %)' : 'unter 50 %')}` : `${kpi('Korrigiert', `${done.length}<small>/${ts.length}</small>`, 'Aufgaben')}${kpi('Bisher', `${pts}<small>/${max}</small>`, 'Punkte')}`}</section>
      <section class="card"><table class="tbl"><thead><tr><th>Aufgabe</th><th>Punkte</th><th></th></tr></thead><tbody>
        ${ts.map((t, i) => { const r = e.recs[t.id]; return `<tr><td>${esc(t.label)}</td><td>${r.phase === 'done' ? `<b>${r.pts}</b> / ${t.points}` : '<span class="muted">offen</span>'}</td><td><a class="btn sm ${r.phase === 'done' ? 'ghost' : 'primary'}" href="#/bcorr/${e.id}/${i}">${r.phase === 'done' ? 'ansehen' : 'korrigieren'}</a></td></tr>`; }).join('')}
      </tbody></table><p class="muted small">Bewertung: Zahlenwerte automatisch (falsche Folgeergebnisse 0 Punkte), übrige Teilaufgaben per Selbstkontrolle mit der offiziellen Musterlösung – optional mit KI-Vorschlag. Notenschlüssel: 100–92 sehr gut, &lt;92–81 gut, &lt;81–67 befriedigend, &lt;67–50 ausreichend, &lt;50–30 mangelhaft, darunter ungenügend.${ts.length < 8 && e.part !== 'WISO' ? ' Einzelne Aufgaben fehlen im Scan und sind nicht enthalten.' : ''}</p></section>
      <div class="actions wrap">${R ? '' : `<a class="btn primary" href="#/bcorr/${e.id}/${Math.max(0, ts.findIndex(t => e.recs[t.id].phase !== 'done'))}">Korrektur fortsetzen</a>`}<a class="btn ghost" href="#/exams">Weitere Prüfung</a></div>`;
  }

  /* ---------- KI-Tutor: Tipps, Erklärungen, Rückfragen zu einer Originalaufgabe ---------- */
  const TUTOR = {};
  function openAnswerText(t, rec) {
    const a = (rec && rec.ans) || {};
    return t.subtasks.map(sb => { const x = a[sb.id] || {}; const v = x.text != null ? x.text : (x.values || []).filter(Boolean).join('; '); return v && v.trim() ? `${sb.label}: ${v.trim()}` : ''; }).filter(Boolean).join('\n');
  }
  function tutorMd(txt) {
    let s = String(txt || '').replace(/\$+/g, '').replace(/\\text\{([^}]*)\}/g, '$1').replace(/\\cdot/g, '·').replace(/\\sqrt\{([^}]*)\}/g, '√($1)').replace(/\\(Omega)/g, 'Ω').replace(/\\varphi|\\phi/g, 'φ').replace(/\\eta/g, 'η').replace(/\\Delta/g, 'Δ').replace(/\\approx/g, '≈').replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1)/($2)').replace(/_\{([^}]*)\}/g, '_$1').replace(/\\/g, '');
    s = esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|\s)\*(\S[^*]*?)\*(?=\s|$|[.,;:!?])/g, '$1<i>$2</i>').replace(/_([A-Za-zäöü0-9]{1,6})(?![A-Za-z0-9])/g, '<sub>$1</sub>');
    const out = []; let list = false;
    for (const line of s.split('\n')) {
      const m = line.match(/^\s*(?:[-•*]|\d+\.)\s+(.*)$/);
      if (m) { if (!list) { out.push('<ul>'); list = true; } out.push(`<li>${m[1]}</li>`); continue; }
      if (list) { out.push('</ul>'); list = false; }
      out.push(line.trim() ? `<p>${line}</p>` : '');
    }
    if (list) out.push('</ul>');
    return out.join('');
  }
  /* Erklärung direkt unter der Aufgabe (automatisch bei Fehlern, sonst auf Knopfdruck); teilt den Verlauf mit dem Tutor-Chat */
  function explainInline(host, t, opts, auto) {
    if (!host) return; const Y = window.AP2Sync;
    const T = TUTOR[t.id] = TUTOR[t.id] || { msgs: [] };
    const paint = () => {
      if (!host.isConnected) return;
      if (T.explain || T.partial) { host.innerHTML = `<div class="xpl"><div class="xpl-h"><b><svg class="ic"><use href="#i-spark"/></svg> So geht's richtig${T.withInk ? ' <small class="muted">· mit deinem Rechenpapier</small>' : ''}</b><button class="link" data-more>Nachfragen</button></div><div class="xpl-b">${tutorMd(T.explain || T.partial)}${T.explBusy ? ' <span class="dots3"><i></i><i></i><i></i></span>' : ''}</div><p class="muted small">KI-Erklärung – maßgeblich ist die offizielle IHK-Lösung.</p></div>`; }
      else if (T.explBusy) host.innerHTML = `<div class="xpl"><div class="xpl-b muted"><span class="dots3"><i></i><i></i><i></i></span> KI erklärt die Lösung${T.withInk ? ' und liest dein Rechenpapier' : ''} …</div></div>`;
      else if (T.explErr) host.innerHTML = `<div class="xpl"><div class="xpl-b muted"><svg class="ic"><use href="#i-warn"/></svg> ${esc(T.explErr)}</div><button class="btn sm ghost" data-go>Nochmal versuchen</button></div>`;
      else if (!Y || !Y.session) host.innerHTML = '';
      else host.innerHTML = '<button class="btn ghost xpl-btn" data-go><svg class="ic"><use href="#i-spark"/></svg> Warum ist das so? Erklären lassen</button>';
      const g = $('[data-go]', host); if (g) g.onclick = () => run();
      const mo = $('[data-more]', host); if (mo) mo.onclick = () => openTutor(t, opts);
    };
    const run = async () => {
      if (!Y || !Y.session || T.explBusy) return;
      T.withInk = hasWork(t.id);
      T.explBusy = true; T.explErr = null; paint();
      try {
        const r = await Y.aiTutor({ taskId: t.id, label: `${t.periodLabel} · ${PART_SHORT[t.part]} · ${t.label}`, type: t.type === 'open' ? 'open' : 'mc', taskImage: t.image, solImage: t.type === 'open' ? t.solution.image : null,
          action: 'explain', mode: 'full', question: '', history: [], myAnswer: opts && opts.myAnswer ? opts.myAnswer() : '', inkImage: await inkFor(t) }, txt => { T.partial = txt; paint(); });
        T.explain = r.text; T.msgs.push({ role: 'user', text: 'Lösung erklären' }, { role: 'model', text: r.text });
      } catch (e) { T.explErr = e.message; }
      T.explBusy = false; T.partial = null; paint();
    };
    paint();
    if (auto && !T.explain && !T.explBusy && !T.explErr && Y && Y.session) run();
  }
  function openTutor(t, opts, autoAction) {
    $$('.tutor-panel').forEach(x => x.remove());
    const Y = window.AP2Sync;
    const st_ = TUTOR[t.id] = TUTOR[t.id] || { msgs: [] };
    const mode = () => (opts && opts.tutor ? opts.tutor() : 'full');
    const w = document.createElement('div'); w.className = 'tutor-panel'; w.setAttribute('role', 'dialog');
    $('#windows').appendChild(w);
    const label = `${t.periodLabel} · ${PART_SHORT[t.part]} · ${t.label}`;
    const chipsFor = md => (md === 'hint'
      ? [['hint', '<svg class="ic"><use href="#i-bulb"/></svg> Tipp geben'], ['basics', '<svg class="ic"><use href="#i-book"/></svg> Grundlagen erklären']]
      : [['explain', '<svg class="ic"><use href="#i-check"/></svg> Lösung erklären'], ...(hasWork(t.id) ? [['check', '<svg class="ic"><use href="#i-search"/></svg> Meine Rechnung prüfen']] : []), ['basics', '<svg class="ic"><use href="#i-book"/></svg> Grundlagen erklären'], ['similar', '<svg class="ic"><use href="#i-repeat"/></svg> Ähnliche Übung'], ['hint', '<svg class="ic"><use href="#i-bulb"/></svg> Tipp']]);
    const draw = busy => {
      const md = mode();
      w.innerHTML = `<div class="tp-h"><b><svg class="ic"><use href="#i-spark"/></svg> KI-Tutor</b><span class="muted small">${esc(label)}</span><button class="ib" data-x aria-label="Schließen">✕</button></div>
        <div class="tp-msgs" id="tpMsgs">${st_.msgs.length ? '' : `<div class="tp-empty"><p>Frag mich alles zu dieser Aufgabe – oder tipp unten auf einen Vorschlag.</p><p class="muted small">Was du auf dem Rechenpapier geschrieben hast, sehe ich mit – frag z. B. „Wo ist mein Fehler?“</p>${md === 'hint' ? '<p class="muted small">Solange du die Aufgabe noch nicht beantwortet hast, gebe ich nur Tipps und verrate die Lösung nicht.</p>' : ''}</div>`}
          ${st_.msgs.map(x => `<div class="tp-m ${x.role} done">${x.role === 'model' ? tutorMd(x.text) : esc(x.text)}</div>`).join('')}${busy ? (st_.partial ? `<div class="tp-m model">${tutorMd(st_.partial)} <span class="dots3"><i></i><i></i><i></i></span></div>` : '<div class="tp-m model busy"><span class="dots3"><i></i><i></i><i></i></span> denkt nach …</div>') : ''}</div>
        <div class="tp-chips">${chipsFor(md).map(([a, l]) => `<button class="chip" data-a="${a}" ${busy ? 'disabled' : ''}>${l}</button>`).join('')}</div>
        <form class="tp-in" id="tpForm"><textarea class="inp" id="tpQ" rows="1" placeholder="Frage stellen, z. B. „Warum nimmt man hier cos φ?“" ${busy ? 'disabled' : ''}></textarea><button class="btn primary" ${busy ? 'disabled' : ''}>Senden</button></form>
        <p class="tp-foot muted small">KI kann sich irren – maßgeblich ist die offizielle IHK-Lösung.</p>`;
      const box = $('#tpMsgs', w); box.scrollTop = box.scrollHeight;
      $('[data-x]', w).onclick = () => w.remove();
      $$('.tp-chips [data-a]', w).forEach(b => b.onclick = () => b.dataset.a === 'check' ? ask_('chat', 'Meine Rechnung prüfen', 'Prüfe meine Rechnung auf dem Rechenpapier Schritt für Schritt: Was stimmt, wo genau ist ein Fehler (Formel, Einsetzen, Einheit, Rundung)?') : ask_(b.dataset.a, b.textContent.trim()));
      const q = $('#tpQ', w);
      q.addEventListener('input', () => { q.style.height = 'auto'; q.style.height = Math.min(140, q.scrollHeight) + 'px'; });
      q.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#tpForm', w).requestSubmit(); } });
      $('#tpForm', w).onsubmit = e => { e.preventDefault(); const v = q.value.trim(); if (v) ask_('chat', v, v); };
    };
    const ask_ = async (action, shown, question) => {
      if (!Y || !Y.session) { AP2Toast('Für den KI-Tutor bitte anmelden (Konto).'); return; }
      const history = st_.msgs.map(x => ({ role: x.role, text: x.text }));
      st_.msgs.push({ role: 'user', text: shown }); draw(true);
      try {
        const r = await Y.aiTutor({ taskId: t.id, label, type: t.type === 'open' ? 'open' : 'mc', taskImage: t.image, solImage: t.type === 'open' ? t.solution.image : null,
          action, mode: mode(), question: question || '', history, myAnswer: opts && opts.myAnswer ? opts.myAnswer() : '', inkImage: await inkFor(t) }, txt => {
            st_.partial = txt; if (!w.isConnected) return; const box = $('#tpMsgs', w); const last = box && box.lastElementChild;
            if (last && last.classList.contains('model') && !last.classList.contains('done')) { last.classList.remove('busy'); last.innerHTML = tutorMd(txt) + ' <span class="dots3"><i></i><i></i><i></i></span>'; const near = box.scrollHeight - box.scrollTop - box.clientHeight < 80; if (near) box.scrollTop = box.scrollHeight; }
          });
        st_.msgs.push({ role: 'model', text: r.text });
      } catch (e) { st_.msgs.push({ role: 'model', text: '⚠️ ' + e.message }); }
      st_.partial = null;
      if (w.isConnected) draw(false);
    };
    draw(false);
    if (autoAction && !st_.msgs.length) ask_(autoAction, { explain: 'Lösung erklären', hint: 'Tipp geben' }[autoAction] || autoAction);
  }

  /* ---------- Duelle (privat 1:1, gleiche Aufgaben, Server bewertet) ---------- */
  const duelPlayState = id => { st.duelPlay = st.duelPlay || {}; return st.duelPlay[id]; };
  const duelWinner = d => d.my_score == null || d.opp_score == null ? null : d.my_score !== d.opp_score ? (d.my_score > d.opp_score ? 'win' : 'lose') : d.my_time === d.opp_time ? 'draw' : (d.my_time < d.opp_time ? 'win' : 'lose');
  let DUELS = null;
  function duels(m) {
    const Y = window.AP2Sync;
    m.innerHTML = `<header class="page-h"><h1>Duelle</h1><p>Fordere jemanden heraus: Ihr bekommt dieselben Original-Aufgaben (Multiple Choice), jeder spielt, wann er will. Mehr richtige Antworten gewinnen, bei Gleichstand die kürzere Zeit. Bewertet wird auf dem Server gegen die offiziellen IHK-Schablonen.</p></header>
      ${Y && Y.session ? `<section class="card" id="board"><h2><svg class="ic"><use href="#i-trophy"/></svg> Rangliste</h2><p class="muted">Wird geladen …</p></section><div class="grid2"><section class="card form" id="newDuel"><h2>Neues Duell</h2><p class="muted">Gegner werden geladen …</p></section><section class="card" id="duelList"><h2>Deine Duelle</h2><p class="muted">Wird geladen …</p></section></div>`
        : '<section class="card"><p>Für Duelle musst du angemeldet sein (Daten &amp; Einstellungen → Konto).</p><a class="btn primary" href="#/settings">Zum Konto</a></section>'}`;
    if (!Y || !Y.session) return;
    if (Y.push) Y.push.status().then(x => { if (x === 'off' && !st.settings.pushAsked && $('#board')) { $('#board').insertAdjacentHTML('beforebegin', '<a class="banner" href="#/settings" id="pushTip"><svg class="ic"><use href="#i-bell"/></svg> Willst du Bescheid bekommen, wenn dich jemand herausfordert? Mitteilungen einschalten →</a>'); $('#pushTip').onclick = () => { st.settings.pushAsked = 1; S.save(true); }; } }).catch(() => {});
        Y.leaderboard().then(renderBoard).catch(e => { const b = $('#board'); if (b) b.innerHTML = `<h2><svg class="ic"><use href="#i-trophy"/></svg> Rangliste</h2><p class="muted">${esc(e.message)}</p>`; });
        Promise.all([Y.duels.players(), Y.duels.list()]).then(([pl, ls]) => { DUELS = ls; if (!$('#newDuel')) return; renderNewDuel(pl); renderDuelList(ls); })
      .catch(e => { const b = $('#duelList'); if (b) b.innerHTML = `<h2>Deine Duelle</h2><p class="bad">${esc(e.message)}</p>`; });
  }
  async function renderPush() {
    const box = $('#pushBox'); const Y = window.AP2Sync; if (!box || !Y || !Y.push) return;
    if (!Y.session) { box.innerHTML = ''; return; }
    const stt = await Y.push.status().catch(() => 'unsupported');
    const ios = Y.push.standaloneNeeded();
    box.innerHTML = `<label>Mitteilungen bei Duellen</label>
      ${stt === 'on' ? `<p><svg class="ic"><use href="#i-bell"/></svg> Aktiv auf diesem Gerät – du bekommst Bescheid, wenn dich jemand herausfordert oder euer Duell gespielt hat.</p><label class="tg"><input type="checkbox" id="remind" ${st.settings.reminder === false ? '' : 'checked'}> Abends um 19 Uhr erinnern, wenn das Tagesziel noch offen ist</label><button class="btn sm ghost" id="pushOff">Mitteilungen ausschalten</button>`
      : stt === 'denied' ? '<p class="muted">Mitteilungen sind für diese Seite blockiert. Erlauben kannst du sie in den Browser-/Systemeinstellungen.</p>'
      : stt === 'unsupported' && ios ? '<p class="muted">Auf iPhone/iPad: erst über Teilen → „Zum Home-Bildschirm“ installieren und die App von dort öffnen – dann kannst du Mitteilungen hier einschalten.</p>'
      : stt === 'unsupported' ? '<p class="muted">Dieser Browser unterstützt keine Mitteilungen.</p>'
      : '<button class="btn sm primary" id="pushOn"><svg class="ic"><use href="#i-bell"/></svg> Mitteilungen einschalten</button>'}`;
    const on = $('#pushOn', box), off = $('#pushOff', box);
    if (on) on.onclick = async () => { on.disabled = true; try { await Y.push.enable(); AP2Toast('Mitteilungen eingeschaltet.'); } catch (e) { AP2Toast(e.message); } renderPush(); };
    const rm = $('#remind', box); if (rm) rm.onchange = () => { st.settings.reminder = rm.checked; S.save(true); };
    if (off) off.onclick = async () => { off.disabled = true; try { await Y.push.disable(); } catch (e) { AP2Toast(e.message); } renderPush(); };
  }
  function renderBoard(rows) {
    const b = $('#board'); if (!b) return;
    const score = r => r.week_ok * 2 + (r.week_n - r.week_ok) + r.streak * 3;   // richtig zählt doppelt, Lerntage-Serie gibt Bonus
    rows = rows.slice().sort((a, c) => score(c) - score(a) || c.total_tasks - a.total_tasks);
    
    const ago = ts => { if (!ts) return 'noch nie'; const d = Math.floor((Date.now() - ts) / 864e5); return d <= 0 ? 'heute' : d === 1 ? 'gestern' : `vor ${d} Tagen`; };
    b.innerHTML = `<h2><svg class="ic"><use href="#i-trophy"/></svg> Rangliste <small class="muted">letzte 7 Tage</small></h2>
      <div class="board">${rows.map((r, i) => `<div class="brow ${r.me ? 'me' : ''}"><span class="rk">${i + 1}</span><b>${esc(r.name)}${r.me ? ' (du)' : ''}</b>
        <span class="bst"><span title="Aufgaben diese Woche"><b>${r.week_n}</b> Aufg.</span><span title="Sofort richtig diese Woche">${r.week_n ? Math.round(100 * r.week_ok / r.week_n) : 0}% richtig</span><span title="Lerntage am Stück"><svg class="ic"><use href="#i-flame"/></svg> ${r.streak}</span><span title="Gewonnene Duelle"><svg class="ic"><use href="#i-duel"/></svg> ${r.duel_wins}</span></span>
        <span class="muted small">${r.total_tasks} versch. Aufgaben · zuletzt ${ago(r.last_at)}</span></div>`).join('')}</div>
      <p class="muted small">Punkte: richtige Antwort 2, sonstige 1, je Lerntag in Serie 3. Wer nicht erscheinen will: Einstellungen → Rangliste.</p>`;
  }
  function renderNewDuel(pl) {
    const b = $('#newDuel');
    if (!pl.length) { b.innerHTML = '<h2>Neues Duell</h2><p class="muted">Noch keine weiteren Personen angemeldet.</p>'; return; }
    b.innerHTML = `<h2>Neues Duell</h2>
      <label>Gegner</label><div class="chips" id="dOpp">${pl.map((p, i) => `<button class="chip ${i ? '' : 'on'}" data-id="${p.id}">${esc(p.display_name)}</button>`).join('')}</div>
      <label>Anzahl Aufgaben</label><div class="seg" id="dN">${[5, 10, 15].map(n => `<button data-n="${n}" class="${n === 10 ? 'on' : ''}">${n}</button>`).join('')}</div>
      <label>Bereiche</label><div class="chips" id="dParts">${MC_PARTS.map(p => `<button class="chip on" data-p="${p}">${PART_SHORT[p]}</button>`).join('')}</div>
      <div class="actions"><button class="btn primary lg" id="dGo"><svg class="ic"><use href="#i-duel"/></svg> Herausfordern</button></div>`;
    const one = id => $(id).addEventListener('click', e => { const x = e.target.closest('button'); if (!x) return; $$(id + ' button').forEach(y => y.classList.toggle('on', y === x)); });
    one('#dOpp'); one('#dN');
    $('#dParts').addEventListener('click', e => { const x = e.target.closest('button'); if (x) x.classList.toggle('on'); });
    $('#dGo').onclick = async () => {
      const opp = $('#dOpp .on').dataset.id, n = +$('#dN .on').dataset.n, parts = $$('#dParts .on').map(x => x.dataset.p);
      if (!parts.length) return AP2Toast('Bitte mindestens einen Bereich wählen.');
      const pool = gradable().filter(t => t.type !== 'open' && parts.includes(t.part));
      const ids = []; const used = new Set();
      while (ids.length < n && used.size < pool.length) { const t = pool[Math.floor(Math.random() * pool.length)]; if (used.has(t.id)) continue; used.add(t.id); ids.push(t.id); }
      $('#dGo').disabled = true;
      try { const id = await AP2Sync.duels.create(opp, ids, parts.map(p => PART_SHORT[p]).join(', ')); AP2Toast('Duell erstellt – du kannst gleich loslegen.'); go('#/duel/' + id); }
      catch (e) { AP2Toast(e.message); $('#dGo').disabled = false; }
    };
  }
  function renderDuelList(ls) {
    const b = $('#duelList');
    const mine = ls.filter(d => d.status === 'open' && d.my_score == null), wait = ls.filter(d => d.status === 'open' && d.my_score != null), done = ls.filter(d => d.status === 'done'), dec = ls.filter(d => d.status === 'declined');
    const when = d => new Date(d.created_at).toLocaleDateString('de-DE');
    const res = { win: '<svg class="ic"><use href="#i-trophy"/></svg> gewonnen', lose: 'verloren', draw: 'unentschieden' };
    b.innerHTML = `<h2>Deine Duelle</h2>${ls.length ? '' : '<p class="muted">Noch keine Duelle.</p>'}
      ${mine.length ? `<h3>Du bist dran</h3>${mine.map(d => `<div class="row"><b>gegen ${esc(d.opp_name)}</b><span class="muted">${d.task_ids.length} Aufgaben · ${esc(d.label || '')} · ${when(d)}${d.opp_done ? ' · Gegner hat schon gespielt' : ''}</span><span><a class="btn sm primary" href="#/duel/${d.id}">Spielen</a> <button class="btn sm ghost" data-dec="${d.id}">Ablehnen</button></span></div>`).join('')}` : ''}
      ${wait.length ? `<h3>Wartet auf Gegner</h3>${wait.map(d => `<a class="row" href="#/duelr/${d.id}"><b>gegen ${esc(d.opp_name)}</b><span class="muted">${when(d)}</span><span class="score">du: ${d.my_score}/${d.task_ids.length}</span></a>`).join('')}` : ''}
      ${done.length ? `<h3>Abgeschlossen</h3>${done.map(d => { const w = duelWinner(d); return `<a class="row" href="#/duelr/${d.id}"><b>gegen ${esc(d.opp_name)}</b><span class="res ${w === 'win' ? 'first' : w === 'lose' ? 'wrong' : 'hint'}">${res[w]}</span><span class="score">${d.my_score} : ${d.opp_score}</span></a>`; }).join('')}` : ''}
      ${dec.length ? `<p class="muted small">${dec.length} abgelehnte Duelle</p>` : ''}`;
    $$('[data-dec]', b).forEach(x => x.onclick = async () => { if (!(await ask({ title: 'Duell ablehnen?', buttons: [['Ablehnen', true, 'primary'], ['Abbrechen', false, 'ghost']] }))) return; try { await AP2Sync.duels.decline(x.dataset.dec); route(); } catch (e) { AP2Toast(e.message); } });
  }
  async function duelPlay(m, [id]) {
    m.innerHTML = '<p class="muted pad1">Duell wird geladen …</p>';
    let d;
    try { const ls = DUELS && DUELS.find(x => x.id === id) ? DUELS : (DUELS = await AP2Sync.duels.list()); d = ls.find(x => x.id === id); } catch (e) { m.innerHTML = `<section class="card"><p class="bad">${esc(e.message)}</p></section>`; return; }
    if (!d) { go('#/duels'); return; }
    if (d.my_score != null || d.status !== 'open') { go('#/duelr/' + id); return; }
    st.duelPlay = st.duelPlay || {};
    const p = st.duelPlay[id] = st.duelPlay[id] || { answers: d.task_ids.map(() => 0), cur: 0, started: Date.now(), elapsed: 0 };
    p.elapsed = p.elapsed || 0; // Zeit zählt nur, solange das Duell offen ist (Pause = Uhr steht)
    const draw = () => {
      if (ROUTE !== '#/duel/' + id) return;
      const t = TASKS[d.task_ids[p.cur]]; if (pad) { pad.destroy(); pad = null; } if (anno) { anno.destroy(); anno = null; }
      m.innerHTML = `<div class="task-page exam-mode"><div class="exam-bar"><button class="back" id="dPause"><svg class="ic"><use href="#i-left"/></svg>Zurück</button><div class="eb-l"><b><svg class="ic"><use href="#i-duel"/></svg> Duell gegen ${esc(d.opp_name)}</b></div><span class="timer big" id="timer"></span>
        <span class="muted">${p.answers.filter(Boolean).length}/${p.answers.length} beantwortet</span><div class="eb-r"><button class="btn sm primary" id="dSub">Abgeben</button></div></div>
        <div class="dots duel-dots">${p.answers.map((a, i) => `<button class="${a ? 'ans' : ''} ${i === p.cur ? 'cur' : ''}" data-go="${i}">${i + 1}</button>`).join('')}</div>
        ${taskFrame(t, `<div class="answer card exam-card"><div class="ex-head"><span class="ex-no">${p.cur + 1}</span><span>von ${p.answers.length}</span></div>${optButtons(p.answers[p.cur] || null, [])}
          <div class="ex-nav"><button class="btn lg ghost" id="dPrev" ${p.cur ? '' : 'disabled'}>← Zurück</button><button class="btn lg ${p.answers[p.cur] ? 'primary' : ''}" id="dNext">${p.cur + 1 < p.answers.length ? 'Weiter →' : 'Zur Abgabe'}</button></div></div>`, { noReport: true })}</div>`;
      wireFrame(t, m); hydrate(m);
      let last = Date.now(), n = 0; const upd = () => { const now = Date.now(); if (document.visibilityState === 'visible') p.elapsed += Math.min(5000, now - last); last = now; if (++n % 10 === 0) S.save(); const tm = $('#timer'); if (tm) tm.textContent = fmt(p.elapsed); }; upd(); clearInterval(tick); tick = setInterval(upd, 1000);
      $$('.opt', m).forEach(b => b.onclick = () => { p.answers[p.cur] = +b.dataset.o; S.save(true); $$('.opt', m).forEach(x => x.classList.toggle('sel', x === b)); $('#dNext').classList.add('primary'); $$('.duel-dots button')[p.cur].classList.add('ans'); });
      $$('.duel-dots [data-go]', m).forEach(b => b.onclick = () => { p.cur = +b.dataset.go; S.save(true); draw(); });
      $('#dPrev').onclick = () => { p.cur--; S.save(true); draw(); };
      $('#dNext').onclick = () => { if (p.cur + 1 < p.answers.length) { p.cur++; S.save(true); draw(); } else $('#dSub').click(); };
      $('#dPause').onclick = () => go('#/duels');
      $('#dSub').onclick = async () => {
        const open = p.answers.filter(a => !a).length;
        if (!(await ask({ title: 'Duell abgeben?', text: open ? `${open} Aufgaben sind noch unbeantwortet (zählen als falsch).` : 'Alle Aufgaben beantwortet.', buttons: [['Abgeben', true, 'primary'], ['Weiter bearbeiten', false, 'ghost']] }))) return;
        try { const r = await AP2Sync.duels.submit(id, p.answers, p.elapsed); delete st.duelPlay[id]; S.save(true); DUELS = null; AP2Toast(`${r.score} von ${r.n} richtig.`); go('#/duelr/' + id); }
        catch (e) { AP2Toast(e.message); }
      };
    };
    draw();
  }
  async function duelResult(m, [id]) {
    m.innerHTML = '<p class="muted pad1">Ergebnis wird geladen …</p>';
    let d; try { DUELS = await AP2Sync.duels.list(); d = DUELS.find(x => x.id === id); } catch (e) { m.innerHTML = `<section class="card"><p class="bad">${esc(e.message)}</p></section>`; return; }
    if (!d) { go('#/duels'); return; }
    const w = duelWinner(d), n = d.task_ids.length;
    const head = d.status !== 'done' ? `Du hast ${d.my_score} von ${n} richtig. ${esc(d.opp_name)} hat noch nicht gespielt.` : { win: `<svg class="ic"><use href="#i-trophy"/></svg> Gewonnen gegen ${esc(d.opp_name)}!`, lose: `${esc(d.opp_name)} hat gewonnen.`, draw: 'Unentschieden!' }[w];
    const cell = (a, k) => a ? `<span class="${a === k ? 'good' : 'bad'}">${NUM[a - 1]}</span>` : '<span class="muted">–</span>';
    m.innerHTML = `<header class="page-h"><h1>Duell gegen ${esc(d.opp_name)}</h1><p>${head}</p></header>
      <section class="kpis">${kpi('Du', `${d.my_score}<small>/${n}</small>`, 'Zeit ' + fmt(d.my_time || 0))}${kpi(esc(d.opp_name), d.opp_score != null ? `${d.opp_score}<small>/${n}</small>` : '…', d.opp_time != null ? 'Zeit ' + fmt(d.opp_time) : 'noch offen')}</section>
      <section class="card"><table class="tbl"><thead><tr><th>Nr.</th><th>Aufgabe</th><th>Du</th><th>${esc(d.opp_name)}</th><th>Lösung</th></tr></thead><tbody>
        ${d.task_ids.map((tid, i) => { const t = TASKS[tid]; const k = d.keys && d.keys[i]; return `<tr><td>${i + 1}</td><td><a href="#/task/${tid}">${t ? `${esc(t.periodLabel)} · ${PART_SHORT[t.part]} · ${esc(t.label)}` : esc(tid)}</a></td><td>${cell(d.my_answers && d.my_answers[i], k)}</td><td>${d.opp_answers ? cell(d.opp_answers[i], k) : '<span class="muted">verdeckt</span>'}</td><td>${k ? NUM[k - 1] : ''}</td></tr>`; }).join('')}
      </tbody></table><p class="muted small">Die Antworten des Gegners werden erst gezeigt, wenn beide gespielt haben. Lösungen laut IHK-Lösungsschablone; ein Klick auf die Aufgabe öffnet sie mit Schablonen-Beleg.</p></section>
      <div class="actions"><a class="btn primary" href="#/duels">Zu den Duellen</a></div>`;
    // Ergebnisse auch ins eigene Lernprotokoll (Wiederholung falscher Aufgaben)
    st.duelSeen = st.duelSeen || {};
    if (!st.duelSeen[id] && d.keys) { d.task_ids.forEach((tid, i) => { const a = d.my_answers[i]; if (!TASKS[tid]) return; const r = a === d.keys[i] ? 'first' : 'wrong'; st.srs[tid] = C.updateSrs(st.srs[tid], r, Date.now()); st.attempts.push({ task: tid, v: TASKS[tid].version, mode: 'duel', tries: a ? [a] : [], result: r, at: Date.now() }); }); st.duelSeen[id] = 1; S.save(true); }
  }

  /* ---------- Statistik ---------- */
  function stats(m) {
    const rows = periods().map(p => {
      const cells = MC_PARTS.map(pt => { const ts = tasksOf(`${p}_${pt}`).filter(t => t.gradable); const seen = ts.filter(t => st.srs[t.id] && st.srs[t.id].seen); const good = seen.filter(t => st.srs[t.id].box >= 2).length; return `<td><div class="mini"><i style="width:${ts.length ? 100 * seen.length / ts.length : 0}%"></i></div><small>${seen.length}/${ts.length}${seen.length ? ` · ${good} sicher` : ''}</small></td>`; }).join('');
      return `<tr><th>${esc(periodLabel(p))}</th>${cells}</tr>`;
    }).join('');
    const weak = gradable().filter(t => st.srs[t.id] && st.srs[t.id].wrong > 0).sort((a, b) => st.srs[b.id].wrong - st.srs[a.id].wrong).slice(0, 12);
    m.innerHTML = `<header class="page-h"><h1>Statistik</h1></header>
      <section class="card"><h2>Themengebiete</h2><p class="muted small">Wie sicher du in jedem Thema bist (Anteil „sofort richtig“ bei bearbeiteten Aufgaben). Themen wurden automatisch anhand des Aufgabentexts zugeordnet.</p>${topicBars()}</section>
      <section class="card"><h2>Bereiche</h2>${partBars()}</section>
      <section class="card"><h2>Fortschritt je Prüfungstermin</h2><table class="tbl prog"><thead><tr><th></th>${MC_PARTS.map(p => `<th>${PART_SHORT[p]}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></section>
      <section class="card"><h2>Häufigste Fehler</h2>${weak.length ? weak.map(t => `<a class="row" href="#/task/${t.id}"><b>${esc(t.periodLabel)} · ${PART_SHORT[t.part]} · ${t.label}</b><span>${st.srs[t.id].wrong}× falsch</span></a>`).join('') : '<p class="muted">Noch keine Fehler erfasst.</p>'}</section>
      <div class="actions"><button class="btn ghost" id="csv">Versuche als CSV exportieren</button></div>`;
    $$('[data-topic]', m).forEach(b => b.onclick = () => topicTraining(b.dataset.topic));
    $('#csv').onclick = () => download('ap2-versuche.csv', 'Aufgabe;Version;Modus;Antworten;Ergebnis;Zeit\n' + st.attempts.map(a => [a.task, a.v, a.mode, a.tries.join('/'), a.result, new Date(a.at).toISOString()].join(';')).join('\n'), 'text/csv');
  }

  function topicStats() {
    const by = {};
    for (const t of gradable()) { if (!t.topic) continue; const b = by[t.topic] = by[t.topic] || { total: 0, seen: 0, first: 0, att: 0, wiso: t.part.startsWith('WISO') };
      b.total++; const e = st.srs[t.id]; if (e && e.seen) { b.seen++; b.first += e.first; b.att += e.seen; } }
    return by;
  }
  function topicBars() {
    const by = topicStats(); const N = (REG.topics || {});
    const row = k => { const b = by[k]; const q = b.att ? Math.round(100 * b.first / b.att) : null; const cls = q == null ? '' : q >= 75 ? 'ok' : q >= 50 ? 'mid' : 'low';
      return `<div class="bar topic ${cls}"><div class="bar-l"><b>${esc(N[k] || k)}</b><span class="muted">${b.seen}/${b.total} bearbeitet</span></div><div class="track"><i style="width:${q || 0}%"></i></div><span class="pct">${q == null ? '–' : q + '%'}</span><button class="btn sm ghost" data-topic="${k}">Üben</button></div>`; };
    const keys = Object.keys(by).sort((a, b) => (by[a].wiso - by[b].wiso) || (N[a] || a).localeCompare(N[b] || b));
    const tech = keys.filter(k => !by[k].wiso), wiso = keys.filter(k => by[k].wiso);
    return keys.length ? `${tech.map(row).join('')}${wiso.length ? `<h3>WiSo</h3>${wiso.map(row).join('')}` : ''}` : '<p class="muted">Noch keine Themen zugeordnet.</p>';
  }
  function topicTraining(k) {
    const ids = C.pickSession(REG.tasks, st.srs, st.settings.sessionSize || 10, { topics: [k] });
    if (!ids.length) return AP2Toast('Keine Aufgaben zu diesem Thema.');
    const id = 's' + Date.now().toString(36);
    st.sessions[id] = { id, items: ids.map(t => ({ id: t, tries: [], result: null })), idx: 0, created: Date.now(), updated: Date.now(), done: false, endsAt: 0, topic: k };
    S.save(true); go('#/session/' + id);
  }
  /* ---------- Einstellungen & Daten ---------- */
  function settings(m) {
    const b = S.backups();
    const audit = REG.tasks.reduce((a, t) => { a[t.status] = (a[t.status] || 0) + 1; return a; }, {});
    m.innerHTML = `<header class="page-h"><h1>Daten &amp; Einstellungen</h1></header>
      <section class="card form"><h2>Prüfung, Rangliste &amp; Mitteilungen</h2>
        <label for="exd">Dein Prüfungstag (schriftlich)</label><input class="inp" type="date" id="exd" value="${esc(st.settings.examDate || '')}" style="max-width:220px">
        <p class="muted small">Daraus berechnet die Startseite dein Tagesziel bis zur Prüfung.</p>
        <div id="pushBox"></div>
        <label class="tg"><input type="checkbox" id="board" ${st.settings.hideBoard ? '' : 'checked'}> In der Rangliste für die anderen sichtbar sein (nur Anzahl Aufgaben, Trefferquote, Lerntage, Duellsiege)</label></section>
      <section class="card form"><h2>Rechenpapier</h2>
        <label class="tg"><input type="checkbox" id="mouse" ${st.settings.mouseInk ? 'checked' : ''}> Zeichnen mit Maus erlauben (für PCs ohne Stift)</label>
        <label>Karogröße</label><div class="seg" id="grid">${[16, 20, 24, 32].map(g => `<button data-g="${g}" class="${g === st.settings.grid ? 'on' : ''}">${g}px</button>`).join('')}</div></section>
      <section class="card"><h2>Sicherung</h2><p class="muted">${window.AP2Sync && AP2Sync.session ? 'Dein Lernstand wird automatisch in der Cloud gesichert und auf deinen Geräten abgeglichen. Zusätzlich kannst du hier eine Datei exportieren.' : 'Dein Lernstand liegt nur in diesem Browser. Melde dich an (Cloud-Sicherung) oder exportiere regelmäßig eine Sicherung.'}</p>
        <div class="actions wrap"><button class="btn primary" id="exp">Sicherung exportieren</button><label class="btn ghost">Sicherung importieren<input type="file" id="imp" accept=".json" hidden></label><button class="btn ghost" id="paste">Sicherung einfügen</button></div>
        <h3>Automatische Sicherungen (dieses Gerät)</h3>${b.length ? b.map((x, i) => `<div class="row"><span>${new Date(x.at).toLocaleString('de-DE')}</span><span class="muted">${esc(REASON[x.reason] || x.reason)}</span><button class="btn sm ghost" data-r="${i}">Wiederherstellen</button></div>`).join('') : '<p class="muted">Noch keine.</p>'}</section>
      <section class="card"><h2>Aufgabenbestand</h2><p>${REG.tasks.length} Aufgaben im Register · ${audit.released || 0} freigegeben · ${audit.blocked || 0} gesperrt (laut IHK nicht lösbar oder Scanseite fehlt – werden nicht gewertet).</p>
        <p class="muted small">Jede Aufgabe enthält Quell-PDF-Hash, Seite, Bildkoordinaten, offizielle Lösung mit Schablone und Seite sowie Prüfvermerk. Offene Aufgaben (Teil B, WiSo U) werden mit der offiziellen Musterlösung per Selbstkontrolle bewertet; Zahlenwerte mit Einheit werden – wo übertragen und nachgerechnet – automatisch geprüft.</p>
        ${st.reports.length ? `<h3>Deine Fehlermeldungen (${st.reports.length})</h3>${st.reports.map(r => `<div class="row"><b>${esc(r.task)}</b><span>${esc(r.text)}</span></div>`).join('')}` : ''}</section>
      <section class="card form" id="acct"></section>
      <section class="card danger-zone"><h2>Lernstand zurücksetzen</h2><p class="muted">Setzt alles auf 0: bearbeitete Aufgaben, Wiederholungen, Statistik, angefangene Trainings und Prüfungen, Rechenpapier. Einstellungen, Prüfungstag und Konto bleiben. Vorher wird automatisch eine Sicherung angelegt, die du unter „Sicherung“ wiederherstellen kannst.</p>
        <div class="actions"><button class="btn danger" id="resetAll">Lernstand auf 0 setzen</button></div></section>
      <section class="card" id="adminBox" hidden></section>
      <div class="actions" style="justify-content:center;margin-bottom:24px"><span class="muted small">App-Version ${APPV}</span><button class="btn sm" id="upd">Nach Update suchen</button></div>`;
    renderAccount();
    $('#upd').onclick = async () => {
      const bt = $('#upd'); bt.disabled = true; bt.textContent = 'Suche …';
      try {
        const r = await fetch('sw.js', { cache: 'no-store' }).then(x => x.text()); const v = (r.match(/ap2-claude-v(\d+)/) || [])[1];
        if (v && +v > APPV) { AP2Toast('Update gefunden – wird geladen …'); if (SWREG) await SWREG.update().catch(() => {}); setTimeout(() => location.reload(), 1200); return; }
        AP2Toast('Du hast schon die neueste Version.');
      } catch (e) { AP2Toast('Keine Verbindung – später nochmal versuchen.'); }
      bt.disabled = false; bt.textContent = 'Nach Update suchen';
    };
    $('#resetAll').onclick = async () => {
      const v = await ask({ title: 'Wirklich alles auf 0 setzen?', text: 'Zum Bestätigen <b>null</b> eintippen.', input: 'text', buttons: [['Auf 0 setzen', true, 'danger'], ['Abbrechen', false, 'ghost']] });
      if (v === false || v == null) return;
      if (String(v).trim().toLowerCase() !== 'null' && String(v).trim() !== '0') return AP2Toast('Nicht zurückgesetzt – bitte „null“ eintippen.');
      S.backup('vor-zuruecksetzen');
      Object.assign(st, { srs: {}, attempts: [], sessions: {}, exams: {}, bexams: {}, sets: {}, open: {}, ink: {}, anno: {}, duelPlay: {}, inkAt: {}, resetAt: Date.now() });
      for (const k in TUTOR) delete TUTOR[k];
      S.save(true); AP2Toast('Lernstand ist auf 0. Die Sicherung davor findest du unter „Sicherung“.'); go('#/');
    };
    $('#mouse').onchange = e => { st.settings.mouseInk = e.target.checked; S.save(true); };
    $('#exd').onchange = e => { st.settings.examDate = e.target.value || null; S.save(true); AP2Toast(e.target.value ? 'Prüfungstag gespeichert – dein Lernplan ist auf der Startseite.' : 'Prüfungstag entfernt.'); };
    $('#board').onchange = e => { st.settings.hideBoard = !e.target.checked; S.save(true); };
    renderPush();
    $('#grid').onclick = e => { const g = e.target.dataset.g; if (!g) return; st.settings.grid = +g; S.save(true); route(); };
    $('#exp').onclick = () => download(`ap2-sicherung-${new Date().toISOString().slice(0, 10)}.json`, S.exportJSON(), 'application/json');
    $('#paste').onclick = async () => { const v = await ask({ title: 'Sicherung einfügen', text: 'Füge den kopierten Sicherungstext ein.', area: true, rows: 8, buttons: [['Importieren', true, 'primary'], ['Abbrechen', false, 'ghost']] }); if (!v) return; try { S.importJSON(v); st = S.get(); AP2Toast('Sicherung importiert.'); route(); } catch (err) { AP2Toast('Import fehlgeschlagen: ' + err.message); } };
    $('#imp').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { S.importJSON(await f.text()); st = S.get(); AP2Toast('Sicherung importiert.'); route(); } catch (err) { AP2Toast('Import fehlgeschlagen: ' + err.message); } };
    $$('[data-r]', m).forEach(x => x.onclick = async () => { if (await ask({ title: 'Sicherung wiederherstellen?', text: 'Der aktuelle Stand wird vorher gesichert.', buttons: [['Wiederherstellen', true, 'primary'], ['Abbrechen', false, 'ghost']] })) { S.restore(+x.dataset.r); st = S.get(); route(); AP2Toast('Wiederhergestellt.'); } });
  }

  function renderAccount() {
    const box = $('#acct'); if (!box) return; const Y = window.AP2Sync;
    if (!Y) { box.innerHTML = '<h2>Konto</h2><p class="muted">Cloud-Sync ist in dieser Version nicht verfügbar.</p>'; return; }
    if (!Y.session) {
      box.innerHTML = `<h2>Konto &amp; Cloud-Sync</h2><p class="muted">Melde dich an, damit dein Lernstand auf allen Geräten gleich ist. Nur freigegebene E-Mail-Adressen können ein Konto anlegen. Ohne Anmeldung lernst du lokal weiter; beim ersten Anmelden wird dein bisheriger Stand übernommen.</p>
        <label for="em">E-Mail</label><input class="inp" id="em" type="email" autocomplete="email">
        <label for="pw">Passwort</label><input class="inp" id="pw" type="password" autocomplete="current-password">
        <div class="actions wrap"><button class="btn primary" id="li">Anmelden</button><button class="btn ghost" id="su">Konto anlegen</button><button class="link" id="fp">Passwort vergessen?</button></div><p id="am" class="muted small"></p>`;
      const msg = t => $('#am').textContent = t; const val = () => [$('#em').value, $('#pw').value];
      $('#li').onclick = async () => { try { msg('Anmelden …'); await Y.signIn(...val()); st = S.get(); AP2Toast('Angemeldet.'); route(); } catch (e) { msg(e.message); } };
      $('#su').onclick = async () => { try { msg('Konto wird angelegt …'); const r = await Y.signUp(...val()); if (r === 'bestaetigen') msg('Konto angelegt. Du kannst dich jetzt mit E-Mail und Passwort anmelden (eine Bestätigungs-E-Mail ist nicht nötig).'); else { AP2Toast('Konto angelegt.'); route(); } } catch (e) { msg(e.message); } };
      $('#fp').onclick = async () => { try { await Y.resetPassword($('#em').value); msg('E-Mail zum Zurücksetzen wurde gesendet.'); } catch (e) { msg(e.message); } };
      return;
    }
    const p = Y.profile || {}; const last = Y.lastSync();
    box.innerHTML = `<h2>Konto &amp; Cloud-Sync</h2><p>Angemeldet als <b>${esc(p.email || (Y.session.user || {}).email || '')}</b>${p.role === 'admin' ? ' · <span class="pill">Administrator</span>' : ''}</p>
      <p class="muted small">Status: ${esc(Y.status)}${last ? ' · zuletzt abgeglichen ' + new Date(last).toLocaleString('de-DE') : ''}. Bei gleichzeitigen Änderungen auf zwei Geräten gewinnt der neueste Stand; der ältere wird vorher gesichert (auf dem Gerät und in der Cloud).</p>
      <div class="actions wrap"><button class="btn primary" id="sn">Jetzt abgleichen</button><button class="btn ghost" id="cb">Cloud-Sicherungen</button><button class="btn ghost" id="lo">Abmelden</button></div><div id="cbl"></div>
      <h3>Passwort ändern</h3><label for="np1">Neues Passwort (mind. 8 Zeichen)</label><input class="inp" id="np1" type="password" autocomplete="new-password">
      <label for="np2">Neues Passwort wiederholen</label><input class="inp" id="np2" type="password" autocomplete="new-password">
      <div class="actions"><button class="btn ghost" id="cp">Passwort speichern</button></div><p id="cpm" class="muted small" role="status"></p>`;
    $('#cp').onclick = async () => { const p1 = $('#np1').value, p2 = $('#np2').value; const m2 = t => $('#cpm').textContent = t;
      if (p1.length < 8) return m2('Bitte mindestens 8 Zeichen verwenden.'); if (p1 !== p2) return m2('Die beiden Eingaben stimmen nicht überein.');
      try { await Y.changePassword(p1); $('#np1').value = $('#np2').value = ''; m2('Passwort geändert. Ab jetzt mit dem neuen Passwort anmelden.'); } catch (e) { m2(e.message); } };
    $('#sn').onclick = async () => { await Y.syncNow(true); route(); };
    $('#lo').onclick = async () => { await Y.signOut(); route(); };
    $('#cb').onclick = async () => { try { const l = await Y.serverBackups(); $('#cbl').innerHTML = l.length ? l.map(x => `<div class="row"><span>${new Date(x.created_at).toLocaleString('de-DE')}</span><span class="muted">${esc(x.device || '')}</span><button class="btn sm ghost" data-cb="${x.id}">Wiederherstellen</button></div>`).join('') : '<p class="muted">Noch keine Cloud-Sicherungen.</p>'; $$('[data-cb]').forEach(b => b.onclick = async () => { if (await ask({ title: 'Cloud-Sicherung wiederherstellen?', text: 'Der aktuelle Stand wird vorher gesichert.', buttons: [['Wiederherstellen', true, 'primary'], ['Abbrechen', false, 'ghost']] })) { await Y.restoreServerBackup(+b.dataset.cb); st = S.get(); route(); AP2Toast('Wiederhergestellt.'); } }); } catch (e) { AP2Toast(e.message); } };
    if (p.role === 'admin') renderAdmin();
  }
  async function renderAdmin() {
    const box = $('#adminBox'); const A = AP2Sync.admin; box.hidden = false;
    try {
      const [al, pr, rp] = await Promise.all([A.allowed(), A.profiles(), A.reports()]);
      box.innerHTML = `<h2>Administration</h2>
        <h3>Freigegebene E-Mails (${al.length})</h3>${al.map(a => { const reg = pr.find(x => x.email === a.email); return `<div class="resume"><div class="row"><b>${esc(a.email)}</b><span>${esc(a.display_name || '')}</span><span class="muted">${a.role === 'admin' ? 'Admin' : 'Lernende/r'} · ${reg ? 'Konto angelegt' : 'noch nicht registriert'}</span></div>${!reg && a.role !== 'admin' ? `<button class="ib del" data-revoke="${esc(a.email)}" title="Freigabe entfernen" aria-label="Freigabe entfernen"><svg class="ic"><use href="#i-x"/></svg></button>` : ''}</div>`; }).join('')}
        <h3>Konten</h3><div id="accList"><p class="muted">Wird geladen …</p></div>
        <div class="form"><label for="ne">Kollegen freigeben</label><input class="inp" id="ne" type="email" placeholder="E-Mail"><input class="inp" id="nn" placeholder="Name (optional)"><div class="actions"><button class="btn primary" id="na">Freigeben</button></div></div>
        <h3>Fehlermeldungen (${rp.length})</h3>${rp.length ? rp.map(r => `<div class="row"><b>${esc(r.task_id)}</b><span>${esc(r.text)}</span><span class="muted">${new Date(r.created_at).toLocaleDateString('de-DE')}</span><select data-rs="${r.id}">${['offen', 'angenommen', 'abgelehnt', 'erledigt'].map(s => `<option ${s === r.status ? 'selected' : ''}>${s}</option>`).join('')}</select></div>`).join('') : '<p class="muted">Keine Meldungen.</p>'}`;
      renderAccounts();
      $$('[data-revoke]', box).forEach(b => b.onclick = async () => { if (!(await ask({ title: 'Freigabe entfernen?', text: `${esc(b.dataset.revoke)} kann sich dann nicht mehr registrieren.`, buttons: [['Entfernen', true, 'danger'], ['Abbrechen', false, 'ghost']] }))) return; try { await AP2Sync.admin.revoke(b.dataset.revoke); AP2Toast('Freigabe entfernt.'); renderAdmin(); } catch (e) { AP2Toast(e.message); } });
      $('#na').onclick = async () => { try { await A.allow($('#ne').value, $('#nn').value); AP2Toast('Freigegeben. Die Person kann jetzt ein Konto anlegen.'); renderAdmin(); } catch (e) { AP2Toast(e.message); } };
      $$('[data-rs]', box).forEach(sel => sel.onchange = async () => { try { await A.setReport(+sel.dataset.rs, sel.value); AP2Toast('Status gespeichert.'); } catch (e) { AP2Toast(e.message); } });
    } catch (e) { box.innerHTML = `<h2>Administration</h2><p class="muted">${esc(e.message)}</p>`; }
  }

  async function renderAccounts() {
    const box = $('#accList'); if (!box) return;
    try {
      const { users } = await AP2Sync.admin.users();
      const ago = ts => ts ? new Date(ts).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' }) : 'nie';
      box.innerHTML = users.map(u => `<div class="resume"><div class="row"><b>${esc(u.name || u.email.split('@')[0])}${u.me ? ' (du)' : ''}</b><span class="muted">${esc(u.email)}</span><span class="muted small">${u.role === 'admin' ? 'Admin · ' : ''}${u.banned ? 'gesperrt · ' : ''}zuletzt ${ago(u.last)}</span></div>${u.me ? '' : `<button class="ib del" data-udel="${u.id}" data-mail="${esc(u.email)}" title="Konto löschen" aria-label="Konto löschen"><svg class="ic"><use href="#i-trash"/></svg></button>`}</div>`).join('') || '<p class="muted">Keine Konten.</p>';
      $$('[data-udel]', box).forEach(b => b.onclick = async () => {
        let revoke = true; setTimeout(() => { const c = document.getElementById('revk'); if (c) c.onchange = () => { revoke = c.checked; }; });
        const v = await ask({ title: 'Konto löschen?', text: `<b>${esc(b.dataset.mail)}</b> wird mit Lernstand, Duellen und Ranglisten-Einträgen endgültig gelöscht. Das lässt sich nicht rückgängig machen.<br><br><label class="tg"><input type="checkbox" id="revk" checked> Freigabe auch entfernen (die Person kann sich dann nicht neu registrieren)</label>`, buttons: [['Endgültig löschen', true, 'danger'], ['Abbrechen', false, 'ghost']] });
        if (v !== true) return;
        b.disabled = true;
        try { await AP2Sync.admin.deleteUser(b.dataset.udel, revoke); AP2Toast('Konto gelöscht.'); renderAdmin(); } catch (e) { AP2Toast(e.message); b.disabled = false; }
      });
    } catch (e) { box.innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
  }
  const REASON = { 'vor-zuruecksetzen': 'vor Zurücksetzen auf 0', 'vor-cloud-uebernahme': 'vor Übernahme aus der Cloud', 'vor-import': 'vor Import', 'vor-migration': 'vor Update', 'vor-wiederherstellung': 'vor Wiederherstellung', auto: 'automatisch', automatisch: 'automatisch' };
  function download(name, text, type) {
    if (window.top === window) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); return; }
    ask({ title: name, text: 'Kopiere den Text und speichere ihn z. B. in der Notizen- oder Dateien-App.', area: true, rows: 10, readonly: true, value: text, buttons: [['Kopieren', 'copy', 'primary'], ['Schließen', false, 'ghost']] });
  }
  function fmt(ms) { const s = Math.max(0, Math.round(ms / 1000)); const h = Math.floor(s / 3600), mi = Math.floor(s % 3600 / 60), se = s % 60; return (h ? h + ':' + String(mi).padStart(2, '0') : mi) + ':' + String(se).padStart(2, '0'); }
  function keys(e) {
    if (e.target.matches('input,textarea')) return;
    if (/^[1-5]$/.test(e.key)) { const b = $$('.opt')[+e.key - 1]; if (b && !b.disabled) b.click(); }
    else if (e.key === 'Enter') { const n = $('#next') || $('#nxt'); if (n) n.click(); }
  }

  boot().catch(err => { if (REMOTE && err.status === 401) return loginScreen(); $('#main').innerHTML = `<div class="card"><h1>Fehler beim Laden</h1><p>${esc(err.message)}</p><p>${REMOTE ? 'Bitte Internetverbindung prüfen und neu laden.' : 'Bitte die App über START.cmd bzw. „node server.js“ starten.'}</p></div>`; });
})();
