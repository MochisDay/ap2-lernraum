/* Lokale Datenhaltung: ein Lernstand pro Profil im Browser, mit automatischen Sicherungen.
   Hauptspeicher ist IndexedDB (kein 5-MB-Limit – Rechenpapier wird schnell größer). localStorage nur, solange der Stand hineinpasst;
   passt er nicht mehr, wird die dortige Kopie entfernt, damit nie ein veralteter Stand geladen wird. */
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
    const raw = idb && (!loc || (idb.updatedAt || 0) >= (loc.updatedAt || 0)) ? idb : loc;
    state = prep(raw);
    if (raw && raw === loc) persist();   // erstmalig nach IndexedDB übernehmen
    return state;
  }

  let timer = null, writing = Promise.resolve(), idbOk = true;
  function persist() {
    const snap = state;
    writing = writing.then(() => idbSet(KEY, snap)).then(() => { idbOk = true; }).catch(() => { idbOk = false; });
    const json = JSON.stringify(snap);
    if (!safeSet(KEY, json)) {
      safeDel(KEY);   // passt nicht mehr: alte Kopie weg, sonst würde sie beim nächsten Start geladen
      writing.then(() => { if (!idbOk && window.AP2Toast) AP2Toast('Speichern fehlgeschlagen – bitte Sicherung exportieren.'); });
    }
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
  function backup(reason) {
    const list = backups();
    const cur = state ? JSON.stringify(state) : safeGet(KEY); if (!cur) return;
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
    state = prep(JSON.parse(b.data)); forcePush(true); save(true); return true;
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
