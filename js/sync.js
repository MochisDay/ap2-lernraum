/* Konten + Cloud-Sync über Supabase (REST, ohne Zusatzbibliothek).
   Regel 19B: Bei konkurrierenden Ständen gewinnt der neueste (updatedAt); der unterlegene Stand wird vorher lokal gesichert,
   der Server sichert zusätzlich automatisch (Tabelle state_backups). */
(function () {
  'use strict';
  const URL_ = 'https://ehhmrxgfkqaaxsxefnvj.supabase.co';
  const KEY = 'sb_publishable_NjrAcVGN5JUTtZulARVkHg_wPzde4_l';
  const SK = 'ap2.claude.session';
  let session = null, status = 'aus', listeners = [], timer = null, busy = false, profile = null;

  const get = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
  const set = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  function setStatus(s) { status = s; listeners.forEach(f => { try { f(s); } catch {} }); }
  const device = () => (/iPad|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document ? 'iPad' : /iPhone|Android/.test(navigator.userAgent) ? 'Smartphone' : 'PC');

  async function api(path, opts) {
    const o = opts || {};
    const h = Object.assign({ apikey: KEY, 'Content-Type': 'application/json' }, o.headers || {});
    if (o.auth !== false && session) h.Authorization = 'Bearer ' + session.access_token;
    const r = await fetch(URL_ + path, { method: o.method || 'GET', headers: h, body: o.body ? JSON.stringify(o.body) : undefined });
    const txt = await r.text(); let data = null; try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
    if (!r.ok) { const msg = (data && (data.msg || data.message || data.error_description || data.error)) || ('HTTP ' + r.status); const e = new Error(translate(msg)); e.status = r.status; throw e; }
    return data;
  }
  function translate(m) {
    if (/Invalid login credentials/i.test(m)) return 'E-Mail oder Passwort falsch.';
    if (/Email not confirmed/i.test(m)) return 'Konto noch nicht freigeschaltet – bitte den Administrator fragen.';
    if (/nicht freigegeben|Database error saving new user/i.test(m)) return 'Diese E-Mail ist nicht freigegeben. Bitte den Administrator fragen.';
    if (/User already registered/i.test(m)) return 'Für diese E-Mail gibt es schon ein Konto – bitte anmelden.';
    if (/Password should be/i.test(m)) return 'Das Passwort ist zu kurz oder zu einfach.';
    if (/should be different/i.test(m)) return 'Das neue Passwort muss sich vom alten unterscheiden.';
    if (/rate limit/i.test(m)) return 'Zu viele Versuche – bitte später erneut probieren.';
    return m;
  }
  function setCookie() { try { if (session && session.access_token) document.cookie = `ap2_at=${session.access_token}; Path=/data; Max-Age=${Math.max(60, Math.round((session.expires_at - Date.now()) / 1000))}; Secure; SameSite=Strict`; else document.cookie = 'ap2_at=; Path=/data; Max-Age=0; Secure; SameSite=Strict'; } catch {} }
  function keep(d) { session = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (d.expires_in || 3600) * 1000, user: d.user || (session && session.user) }; set(SK, session); setCookie(); }
  async function ensureFresh() {
    if (!session) return false;
    if (Date.now() < session.expires_at - 60000) return true;
    try { keep(await api('/auth/v1/token?grant_type=refresh_token', { method: 'POST', auth: false, body: { refresh_token: session.refresh_token } })); return true; }
    catch (e) { if (e.status === 400 || e.status === 401) { session = null; set(SK, null); setStatus('abgemeldet'); } return false; }
  }

  async function signIn(email, password) { keep(await api('/auth/v1/token?grant_type=password', { method: 'POST', auth: false, body: { email: email.trim().toLowerCase(), password } })); await loadProfile(); await syncNow(true); }
  async function signUp(email, password) {
    const d = await api('/auth/v1/signup', { method: 'POST', auth: false, body: { email: email.trim().toLowerCase(), password, options: { emailRedirectTo: location.origin + location.pathname } } });
    if (d && d.access_token) { keep(d); await loadProfile(); await syncNow(true); return 'angemeldet'; }
    return 'bestaetigen';
  }
  async function changePassword(pw) { if (!(await ensureFresh())) throw new Error('Bitte neu anmelden.'); await api('/auth/v1/user', { method: 'PUT', body: { password: pw } }); }
  async function resetPassword(email) { await api('/auth/v1/recover', { method: 'POST', auth: false, body: { email: email.trim().toLowerCase() } }); }
  async function signOut() { try { await api('/auth/v1/logout', { method: 'POST' }); } catch {} session = null; profile = null; set(SK, null); setCookie(); try { caches.delete('ap2-data'); } catch {} setStatus('abgemeldet'); }
  async function loadProfile() { if (!(await ensureFresh())) return null; const r = await api('/rest/v1/profiles?select=id,email,display_name,role&id=eq.' + session.user.id); profile = r && r[0] || null; return profile; }

  /* Abgleich: Server neuer -> übernehmen (lokal vorher sichern); lokal neuer -> hochladen. */
  async function syncNow(force) {
    if (busy || !session) return;
    if (!navigator.onLine) return setStatus('offline');
    busy = true; setStatus('synchronisiere');
    try {
      if (!(await ensureFresh())) return;
      const local = AP2Store.get();
      const res = await api('/rest/v1/rpc/push_state', { method: 'POST', body: { p_state: local, p_client_updated_at: local.updatedAt || 0, p_device: device() } });
      const row = Array.isArray(res) ? res[0] : res;
      if (row && row.accepted === false && row.state) {
        AP2Store.backup('vor-cloud-uebernahme');
        AP2Store.replace(row.state);
        window.dispatchEvent(new CustomEvent('ap2-state-replaced'));
      }
      set('ap2.claude.lastSync', Date.now()); setStatus('synchron');
    } catch (e) { setStatus(e.status ? 'fehler' : 'offline'); console.warn('Sync', e.message); }
    finally { busy = false; }
  }
  function schedule() { if (!session) return; clearTimeout(timer); timer = setTimeout(() => syncNow(), 4000); }

  async function sendReport(r) { if (!session || !(await ensureFresh())) return false; await api('/rest/v1/task_reports', { method: 'POST', body: { user_id: session.user.id, task_id: r.task, task_version: r.version || 1, text: r.text }, headers: { Prefer: 'return=minimal' } }); return true; }
  async function serverBackups() { if (!(await ensureFresh())) return []; return api('/rest/v1/state_backups?select=id,created_at,device,client_updated_at&order=created_at.desc&limit=30'); }
  async function restoreServerBackup(id) { const r = await api('/rest/v1/state_backups?select=state&id=eq.' + id); if (!r[0]) throw new Error('Sicherung nicht gefunden'); AP2Store.backup('vor-wiederherstellung'); const s = r[0].state; s.updatedAt = Date.now(); AP2Store.replace(s); await syncNow(true); }
  // Duelle (privat 1:1). Bewertet wird auf dem Server gegen die offiziellen Schablonen (Tabelle mc_keys).
  const rpc = async (fn, body) => { if (!session || !(await ensureFresh())) throw new Error('Für Duelle bitte anmelden.'); return api('/rest/v1/rpc/' + fn, { method: 'POST', body: body || {} }); };
  const duels = {
    players: () => rpc('duel_players'),
    list: () => rpc('my_duels'),
    create: async (opponent, taskIds, label) => { const id = await rpc('create_duel', { p_opponent: opponent, p_task_ids: taskIds, p_label: label || null }); notifyDuel(id, 'new'); return id; },
    submit: async (id, answers, timeMs) => { const r = await rpc('submit_duel', { p_duel: id, p_answers: answers, p_time_ms: Math.round(timeMs) }); notifyDuel(id, 'done'); return r; },
    decline: id => rpc('decline_duel', { p_duel: id })
  };
  /* Push-Benachrichtigungen (Duelle). Der öffentliche VAPID-Schlüssel darf im Code stehen; der private liegt nur auf dem Server.
     iPhone/iPad: nur, wenn die App über „Zum Home-Bildschirm“ installiert ist (ab iOS 16.4). */
  const VAPID = 'BMbEHx1g2xV35Bh9g2xqTwjAL5Oiy-5o3G2Z2NfLJPEsz5Z3ZhcI5hYVlLvx0ZnKwZyXNbEiRuEf_WD1PiD1mz4';
  const b64u = s => { const p = '='.repeat((4 - s.length % 4) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, c => c.charCodeAt(0)); };
  const push = {
    supported: () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
    standaloneNeeded: () => /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document && !(navigator.standalone || matchMedia('(display-mode: standalone)').matches),
    async status() { if (!push.supported()) return 'unsupported'; if (Notification.permission === 'denied') return 'denied'; const reg = await navigator.serviceWorker.getRegistration(); const sub = reg && await reg.pushManager.getSubscription(); return sub ? 'on' : 'off'; },
    async enable() {
      if (!session || !(await ensureFresh())) throw new Error('Bitte zuerst anmelden.');
      if (!push.supported()) throw new Error(push.standaloneNeeded() ? 'Auf iPhone/iPad gehen Mitteilungen nur, wenn die App über Teilen → „Zum Home-Bildschirm“ installiert ist. Öffne sie dann von dort.' : 'Dieser Browser unterstützt keine Mitteilungen.');
      const perm = await Notification.requestPermission(); if (perm !== 'granted') throw new Error('Mitteilungen wurden nicht erlaubt (in den Systemeinstellungen änderbar).');
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(VAPID) });
      const j = sub.toJSON();
      await api('/rest/v1/push_subs?on_conflict=endpoint', { method: 'POST', body: { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_id: session.user.id }, headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
    },
    async disable() {
      const reg = await navigator.serviceWorker.getRegistration(); const sub = reg && await reg.pushManager.getSubscription(); if (!sub) return;
      try { if (session && await ensureFresh()) await api('/rest/v1/push_subs?endpoint=eq.' + encodeURIComponent(sub.endpoint), { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); } catch (_) {}
      await sub.unsubscribe();
    }
  };
  function notifyDuel(id, event) {
    if (!session || typeof id !== 'string') return;
    fetch(URL_ + '/functions/v1/duel-notify', { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ duel: id, event }) }).catch(() => {});
  }
  // KI-Vorschlag für offene Antworten (Edge Function ai-grade; Schlüssel liegt nur auf dem Server)
  const aiGrade = payload => aiCall('ai-grade', payload);
  // Tutor mit Streaming: onText(bisheriger Text) wird laufend aufgerufen, sobald die KI schreibt
  async function aiTutor(payload, onText) {
    if (!onText) return aiCall('ai-tutor', payload);
    if (!session || !(await ensureFresh())) throw new Error('Für die KI bitte anmelden.');
    const r = await fetch(URL_ + '/functions/v1/ai-tutor', { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({}, payload, { stream: true })) });
    if (!r.ok || !/event-stream/.test(r.headers.get('content-type') || '') || !r.body) { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || ('KI-Fehler ' + r.status)); return d; }
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '', text = '', fin = null;
    for (;;) {
      const { value, done } = await rd.read(); if (done) break;
      buf += dec.decode(value, { stream: true }); let k;
      while ((k = buf.indexOf('\n\n')) >= 0) {
        const ev = buf.slice(0, k); buf = buf.slice(k + 2);
        const line = ev.split('\n').find(l => l.startsWith('data:')); if (!line) continue;
        let o; try { o = JSON.parse(line.slice(5)); } catch (_) { continue; }
        if (o.error) throw new Error(o.error);
        if (o.t) { text += o.t; onText(text); }
        if (o.done) fin = o;
      }
    }
    if (!text) throw new Error('KI hat keine Antwort geliefert. Bitte nochmal versuchen.');
    return Object.assign({ text }, fin || {});
  }
  async function aiCall(fn, payload) {
    if (!session || !(await ensureFresh())) throw new Error('Für die KI bitte anmelden.');
    const r = await fetch(URL_ + '/functions/v1/' + fn, { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || ('KI-Fehler ' + r.status));
    return d;
  }
  /* Geschützte Daten (IHK-Aufgaben/Lösungen) liegen im privaten Supabase-Speicher; Lesen nur angemeldet + freigegeben.
     Bilder werden im Browser-Cache „ap2-data“ gehalten, damit sie nur einmal übertragen werden. */
  const objUrl = p => URL_ + '/storage/v1/object/authenticated/ap2/' + p;
  async function fetchData(p, asBlob) {
    const img = /^data\/img\//.test(p);
    let c = null; try { c = 'caches' in window ? await caches.open('ap2-data') : null; } catch (_) {}
    const out = r => asBlob ? r.blob() : r.json();
    if (img && c) { const hit = await c.match(objUrl(p), { ignoreVary: true }); if (hit) return out(hit); }   // Bilder: Cache zuerst
    try {
      if (!session || !(await ensureFresh())) { const e = new Error('Anmeldung abgelaufen – bitte neu anmelden.'); e.status = 401; throw e; }
      const r = await fetch(objUrl(p), { headers: { apikey: KEY, Authorization: 'Bearer ' + session.access_token }, cache: 'no-store' });
      if (r.status === 400 || r.status === 401 || r.status === 403) { const e = new Error('Kein Zugriff – bitte neu anmelden.'); e.status = 401; throw e; }
      if (!r.ok) throw new Error('Laden fehlgeschlagen (' + r.status + ')');
      if (c) { try { await c.put(objUrl(p), r.clone()); } catch (_) {} }
      return out(r);
    } catch (e) {   // offline: Register/Dokumente aus dem Cache (Netz zuerst)
      if (!img && c && e.status !== 401) { const hit = await c.match(objUrl(p), { ignoreVary: true }); if (hit) return out(hit); }
      throw e;
    }
  }
  // Admin
  const admin = {
    allowed: () => api('/rest/v1/allowed_emails?select=*&order=created_at'),
    allow: (email, name) => api('/rest/v1/allowed_emails', { method: 'POST', body: { email: email.trim().toLowerCase(), role: 'learner', display_name: name || null }, headers: { Prefer: 'return=minimal' } }),
    profiles: () => api('/rest/v1/profiles?select=email,display_name,role,created_at&order=created_at'),
    reports: () => api('/rest/v1/task_reports?select=id,task_id,task_version,text,status,admin_note,created_at,user_id&order=created_at.desc'),
    users: () => aiCall('admin-users', { action: 'list' }),
    deleteUser: (id, revoke) => aiCall('admin-users', { action: 'delete', id, revoke }),
    revoke: email => aiCall('admin-users', { action: 'revoke', email }),
    setReport: (id, status, note) => api('/rest/v1/task_reports?id=eq.' + id, { method: 'PATCH', body: { status, admin_note: note || null }, headers: { Prefer: 'return=minimal' } })
  };

  /* Für den Daten-Zugriff: gültiges Token + Cookie sicherstellen. Offline: vorhandenes Cookie/Cache nutzen. */
  async function ready() { if (!session) return false; if (navigator.onLine) await ensureFresh(); setCookie(); return !!session; }
  function init() {
    session = get(SK); setCookie();
    // Rückkehr aus Bestätigungs-/Passwort-Link: Token stehen im URL-Fragment
    const h = new URLSearchParams(location.hash.replace(/^#/, ''));
    if (h.get('access_token')) {
      keep({ access_token: h.get('access_token'), refresh_token: h.get('refresh_token'), expires_in: +h.get('expires_in') || 3600, user: null });
      try { history.replaceState(null, '', location.pathname); } catch {}
      fetch(URL_ + '/auth/v1/user', { headers: { apikey: KEY, Authorization: 'Bearer ' + session.access_token } }).then(r => r.json()).then(u => { session.user = u; set(SK, session); loadProfile(); syncNow(true); }).catch(() => {});
    }
    setStatus(session ? 'bereit' : 'abgemeldet');
    window.addEventListener('online', () => syncNow());
    window.addEventListener('offline', () => setStatus('offline'));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
    if (session && session.user) { loadProfile().catch(() => {}); syncNow(); }
    setInterval(() => syncNow(), 120000);
  }

  const leaderboard = () => rpc('leaderboard');
  window.AP2Sync = { push, leaderboard, changePassword, ready, init, signIn, signUp, signOut, resetPassword, syncNow, schedule, sendReport, serverBackups, restoreServerBackup, admin, duels, aiGrade, aiTutor, fetchData,
    onStatus: f => listeners.push(f), get status() { return status; }, get session() { return session; }, get profile() { return profile; },
    lastSync: () => get('ap2.claude.lastSync') };
})();
