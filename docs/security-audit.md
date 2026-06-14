# DragonFly — Security & Code Quality Audit

**Datum:** 2026-02-19  
**Letzte Aktualisierung:** 2026-06-13  
**Scope:** Rust/Tauri-Backend + React/TypeScript-Frontend  
**Klassifizierung:** Medium / Low (keine High-Severity-Findings)

---

## Behobene Findings

Alle Findings mit Aufwand **Klein** wurden behoben:

| # | Beschreibung | Behoben in |
|---|---|---|
| #1 | CSP `null` + `assetProtocol scope: ["**"]` | 2026-06-13 |
| #2 | `fs:allow-read` / `fs:allow-write` global ohne Scope | 2026-06-13 |
| #5 | `JSON.parse` ohne try-catch in Row-Mappern | 2026-03-xx |
| #10 | Backup-Erstellung nicht atomar | 2026-06-13 |
| #11 | OpenAI API Key in `localStorage` | 2026-03-xx |
| #13 | Path Traversal in `delete_backup` | 2026-06-13 |
| #14 | Note Auto-Save: geteilter Timer für Title + Content | 2026-06-13 |
| #15 | Kein React Error Boundary | 2026-06-13 |
| #16 | `getProjectId()` Non-Null Assertion | 2026-03-xx |
| #17 | Passphrase-Mindestlänge 4 Zeichen | 2026-06-13 |
| #18 | Legacy JSON-Commands noch registriert | 2026-03-xx |
| #19 | Migration als erledigt markiert auch bei Fehler | bereits korrekt |
| #23 | Blocking `std::fs` in async Tauri-Commands | 2026-06-13 |
| #24 | Double-Click auf Save-Buttons | 2026-06-13 |
| #7 | Space Key als Auth-Passwort und Encryption-Key (schwacher Key möglich) | 2026-06-13 |
| #8 | SQLite-Backup ohne konsistenten Snapshot | 2026-06-13 |
| #21 | Kein Retry bei Sync-Push-Fehlern | 2026-06-13 |

---

## Offene Findings

### MEDIUM Severity

#### #3 — Optimistic Updates ohne Rollback bei DB-Fehler
**`src/stores/taskStore.ts`, `noteStore.ts`, `projectStore.ts`** | Aufwand: Mittel

Store-Mutationen aktualisieren den State zuerst (optimistisch), dann SQLite. Bei DB-Fehler bleibt der State divergiert — der User sieht die Änderung in der UI, aber beim nächsten App-Start ist sie weg.

```typescript
set({ tasks: [...get().tasks, task] });  // optimistisch
try {
  await db.execute('INSERT INTO tasks ...', [...]);
} catch (error) {
  set({ error: String(error) });  // State wird NICHT zurückgerollt
}
```

**Fix:** Vorherigen State speichern, im `catch` zurücksetzen + Toast-Notification.

---

#### #6 — Sync: Last-Write-Wins ohne Konflikterkennung
**`src/services/syncService.ts`** | Aufwand: Groß

Reine Timestamp-basierte Last-Write-Wins-Strategie. Wenn zwei User gleichzeitig den gleichen Record bearbeiten, wird eine Änderung lautlos überschrieben — keine Notification, kein Merge, kein Diff.

**Fix:** Mindestens den User benachrichtigen wenn seine lokale Änderung von einer Remote-Änderung überschrieben wird. Langfristig: Field-Level-Merge oder Conflict-Dialog.

---

#### #9 — Feature-Drag im Kanban: Nicht-atomische Kinder-Verschiebung
**`src/components/KanbanBoard.tsx`** | Aufwand: Mittel

Beim Drag einer Feature werden Kinder einzeln in einer Schleife verschoben — jeder `moveTask()`-Aufruf ist ein separater State-Update + separates DB-UPDATE. Bei Fehler/Crash sind manche Kinder verschoben, andere nicht.

**Fix:** `moveTasks(ids[], status)` Batch-Methode mit einer einzigen DB-Transaktion.

---

#### #22 — PBKDF2 Salt vorhersagbar (Server-URL)
**`src/services/crypto.ts:92-98`** | Aufwand: Mittel

Der Salt für die Sync-Key-Ableitung ist die normalisierte Server-URL — bekannt für jeden der die Server-Adresse kennt. Ermöglicht vorberechnete Dictionary-Attacks gegen den Space Key.

**Fix:** Random Salt bei Server-Setup generieren und in PocketBase speichern. Beide Seiten lesen den Salt beim Connect.

---

### LOW Severity

#### #20 — Sync-Fehler nur in Settings sichtbar
**`src/services/syncService.ts`** | Aufwand: Mittel

Wenn Auto-Connect fehlschlägt oder Push-Fehler auftreten, gibt es keinen visuellen Indikator ausserhalb der Settings-Seite.

**Fix:** Sync-Status-Indikator in Sidebar (Warning-Icon bei Fehler).

---

## Positiv-Befunde

- **Kein XSS:** Keine Instanz von `dangerouslySetInnerHTML`, `innerHTML`, `eval()` oder `new Function()`
- **Solide Crypto:** AES-256-GCM, PBKDF2 mit 100k Iterationen, Random IV pro Encryption, Web Crypto API
- **Saubere SQL-Parameterisierung:** Alle User-Daten werden über `?`-Parameter gebunden
- **CSP aktiv:** `connect-src` beschränkt auf bekannte Domains, Asset-Scope eingeschränkt
- **Strukturierte Architektur:** Klare Trennung von Stores, Services, Components
- **Error Boundary:** Render-Fehler führen nicht mehr zu Blank-Screen

---

## Prioritäten-Matrix (verbleibende Findings)

| Prio | Aufwand | Finding | Beschreibung |
|------|---------|---------|--------------|
| Mittel | Mittel | #22 | Random Salt statt Server-URL für PBKDF2 |
| Mittel | Mittel | #9 | Batch-Move für Feature-Kinder |
| Niedrig | Mittel | #20 | Sync-Status-Indikator in Sidebar |
| Niedrig | Groß | #6 | Sync-Konflikt-Handling (Last-Write-Wins) |
