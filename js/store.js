/* Lokale Datenhaltung: ein Lernstand pro Profil im Browser, mit automatischen Sicherungen.
   Hauptspeicher ist IndexedDB: der Lernstand ohne Rechenpapier unter einem Schlüssel, das Rechenpapier je Aufgabe unter „ink:<id>“.
   So wird nach jedem Strich nur die eine geänderte Aufgabe geschrieben statt des ganzen (mehrere MB großen) Stands – sonst ruckelt das Schreiben.
   localStorage nur noch als Notlösung ohne IndexedDB. */
(function () {
  'use strict';
  const KEY = 'ap2.claude.state';
  const BK = 'ap2.claude.backups';
  const FORCE = 'ap2.claude.forcePush';
  let state;

  function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } }
  function safeDel(k) { try { localStorage.removeItem(k); } catch {} }

  /* ---- IndexedDB (ein Schlüssel-Wert-Speicher) ---- */
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      if (!('indexedDB' in window)) return rej(new Error('kein IndexedDB'));
      const r = indexedDB.open('ap2', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }).catch(e => { dbp = null; throw e; });
    return dbp;
  }
  async function idbGet(k) { const d = await db(); return new Promise((res, rej) => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
  async function idbAll(prefix) {
    const d = await db(); return new Promise((res, rej) => {
      const out = {}; const q = d.transaction('kv').objectStore('kv').openCursor(IDBKeyRange.bound(prefix, prefix + '\uffff'));
      q.onsuccess = () => { const c = q.result; if (!c) return res(out); out[c.key.slice(prefix.length)] = c.value; c.continue(); }; q.onerror = () => rej(q.error);
    });
  }
  async function idbWrite(puts, dels) {
    const d = await db(); return new Promise((res, rej) => {
      const tx = d.transaction('kv', 'readwrite'), st_ = tx.objectStore('kv');
      for (const [k, v] of puts) st_.put(v, k); for (const k of dels) st_.delete(k);
      tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
    });
  }
  async function idbSet(k, v) { const d = await db(); return new Promise((res, rej) => { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); }); }

  function fromLocal() { try { return JSON.parse(safeGet(KEY) || 'null'); } catch { return null; } }
  function prep(raw) {
    if (raw && raw.schema !== AP2Core.SCHEMA) backup('vor-migration');
    const s = AP2Core.migrate(raw);
    s.updatedAt = s.updatedAt || 0; // leerer Stand gilt als ältester: überschreibt nie einen Cloud-Stand
    return s;
  }
  // synchron (Fallback, Tests)
  function load() { state = prep(fromLocal()); return state; }
  // beim Start: den neueren der beiden Speicher nehmen
  async function init() {
    const loc = fromLocal();
    let idb = null; try { idb = await idbGet(KEY); } catch (_) {}
    if (idb && idb.inkSplit) {   // Rechenpapier je Aufgabe wieder einsetzen
      try {
        const all = await idbAll('ink:'); idb.ink = {}; idb.anno = {};
        for (const [id, v] of Object.entries(all)) { if (v && v.ink) idb.ink[id] = v.ink; if (v && v.anno) idb.anno[id] = v.anno; inkSaved[id] = v ? v.at : 0; }
      } catch (_) { idb = null; }
    }
    const raw = idb && (!loc || (idb.updatedAt || 0) >= (loc.updatedAt || 0)) ? idb : loc;
    state = prep(raw); delete state.inkSplit;
    if (raw && !(raw === idb && idb.inkSplit)) { inkSaved = {}; persist(); }   // erstmalig aufgeteilt speichern
    return state;
  }

  let timer = null, writing = Promise.resolve(), idbOk = true, inkSaved = {};
  // nur geänderte Aufgaben (inkAt weicht vom gespeicherten Stand ab) schreiben
  function persist() {
    const s = state, at = s.inkAt || {};
    const main = Object.assign({}, s, { ink: {}, anno: {}, inkSplit: true });
    const ids = new Set([...Object.keys(s.ink || {}), ...Object.keys(s.anno || {})]);
    const puts = [[KEY, main]], dels = [], saved = {};
    for (const id of ids) { const a = at[id] || 1; if (inkSaved[id] !== a) { puts.push(['ink:' + id, { ink: (s.ink || {})[id] || null, anno: (s.anno || {})[id] || null, at: a }]); saved[id] = a; } }
    for (const id of Object.keys(inkSaved)) if (!ids.has(id)) { dels.push('ink:' + id); saved[id] = undefined; }
    writing = writing.then(() => idbWrite(puts, dels)).then(() => {
      idbOk = true; for (const [id, a] of Object.entries(saved)) { if (a === undefined) delete inkSaved[id]; else inkSaved[id] = a; }
      if (safeGet(KEY)) safeDel(KEY);   // alte localStorage-Kopie weg, damit nie ein veralteter Stand geladen wird
    }).catch(() => {
      idbOk = false;   // Notlösung ohne IndexedDB
      if (!safeSet(KEY, JSON.stringify(s))) { safeDel(KEY); if (window.AP2Toast) AP2Toast('Speichern fehlgeschlagen – bitte Sicherung exportieren.'); }
    });
  }
  function save(now) {
    state.updatedAt = Date.now();
    clearTimeout(timer);
    if (now) persist(); else timer = setTimeout(persist, 250);
    if (window.AP2Sync) AP2Sync.schedule();
  }
  // vor dem Schließen/Wegwischen der App noch schreiben
  addEventListener('pagehide', () => { if (timer) { clearTimeout(timer); timer = null; persist(); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden && timer) { clearTimeout(timer); timer = null; persist(); } });

  function backups() { try { return JSON.parse(safeGet(BK) || '[]'); } catch { return []; } }
  // Sicherungen ohne Rechenpapier (das liegt je Aufgabe in IndexedDB und in der Cloud) – sonst zu groß und zu langsam
  function backup(reason) {
    const list = backups();
    const cur = state ? JSON.stringify(Object.assign({}, state, { ink: {}, anno: {}, inkArchive: {}, inkAt: {} })) : safeGet(KEY); if (!cur) return;
    list.unshift({ at: Date.now(), reason, data: cur });
    while (list.length > 5) list.pop();
    while (list.length && !safeSet(BK, JSON.stringify(list))) list.pop();   // zu groß: ältere Sicherungen verwerfen
  }
  // tägliche automatische Sicherung
  function autoBackup() {
    const list = backups();
    if (!list.length || Date.now() - list[0].at > 864e5) backup('automatisch');
  }
  // bewusstes Überschreiben (Wiederherstellen/Import): beim nächsten Cloud-Abgleich nicht zusammenführen
  const forcePush = v => v === undefined ? safeGet(FORCE) === '1' : (v ? safeSet(FORCE, '1') : safeDel(FORCE));
  function restore(i) {
    const b = backups()[i]; if (!b) return false;
    backup('vor-wiederherstellung');
    const old = state; state = prep(JSON.parse(b.data));
    if (old && !Object.keys(state.ink || {}).length) { state.ink = old.ink; state.anno = old.anno; state.inkArchive = old.inkArchive; state.inkAt = old.inkAt; }   // Rechenpapier behalten
    forcePush(true); save(true); return true;
  }
  function exportJSON() { return JSON.stringify({ app: 'ap2-lernraum-claude', exported: new Date().toISOString(), state }, null, 1); }
  function importJSON(text) {
    const obj = JSON.parse(text);
    const s = obj && obj.state ? obj.state : obj;
    if (!s || typeof s !== 'object' || !s.srs) throw new Error('Keine gültige AP2-Sicherung');
    backup('vor-import');
    state = AP2Core.migrate(s); forcePush(true); save(true);
  }

  function replace(s) { state = AP2Core.migrate(s); persist(); }
  window.AP2Store = { replace, load, init, save, get: () => state, backups, backup, autoBackup, restore, exportJSON, importJSON, forcePush };
})();
