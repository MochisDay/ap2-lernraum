/* Lokale Datenhaltung: ein Lernstand pro Profil im Browser (localStorage), mit automatischen Sicherungen.
   Cloud-Sync (Supabase) ist vorbereitet, aber erst nach Einrichtung eines Projekts aktiv. */
(function () {
  'use strict';
  const KEY = 'ap2.claude.state';
  const BK = 'ap2.claude.backups';
  let state;

  function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } }

  function load() {
    let raw = null;
    try { raw = JSON.parse(safeGet(KEY) || 'null'); } catch { raw = null; }
    if (raw && raw.schema !== AP2Core.SCHEMA) backup('vor-migration');
    state = AP2Core.migrate(raw);
    state.updatedAt = state.updatedAt || 0; // leerer Stand gilt als ältester: überschreibt nie einen Cloud-Stand
    return state;
  }

  let timer = null;
  function save(now) {
    state.updatedAt = Date.now();
    clearTimeout(timer);
    const write = () => { if (!safeSet(KEY, JSON.stringify(state))) window.AP2Toast && AP2Toast('Speichern fehlgeschlagen – bitte Sicherung exportieren.'); };
    if (now) write(); else timer = setTimeout(write, 250);
    if (window.AP2Sync) AP2Sync.schedule();
  }

  function backups() { try { return JSON.parse(safeGet(BK) || '[]'); } catch { return []; } }
  function backup(reason) {
    const list = backups();
    const cur = safeGet(KEY); if (!cur) return;
    list.unshift({ at: Date.now(), reason, data: cur });
    while (list.length > 5) list.pop();
    safeSet(BK, JSON.stringify(list));
  }
  // tägliche automatische Sicherung
  function autoBackup() {
    const list = backups();
    if (!list.length || Date.now() - list[0].at > 864e5) backup('automatisch');
  }
  function restore(i) {
    const b = backups()[i]; if (!b) return false;
    backup('vor-wiederherstellung');
    safeSet(KEY, b.data); load(); return true;
  }
  function exportJSON() { return JSON.stringify({ app: 'ap2-lernraum-claude', exported: new Date().toISOString(), state }, null, 1); }
  function importJSON(text) {
    const obj = JSON.parse(text);
    const s = obj && obj.state ? obj.state : obj;
    if (!s || typeof s !== 'object' || !s.srs) throw new Error('Keine gültige AP2-Sicherung');
    backup('vor-import');
    state = AP2Core.migrate(s); save(true);
  }

  function replace(s) { state = AP2Core.migrate(s); safeSet(KEY, JSON.stringify(state)); }
  window.AP2Store = { replace, load, save, get: () => state, backups, backup, autoBackup, restore, exportJSON, importJSON };
})();
