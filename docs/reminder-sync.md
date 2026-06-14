# Reminder Sync — TODO

## Konzept
- Jeder Nutzer bekommt eine zufällige `reminder_sync_id` (UUID) in `app_config`
- Reminders werden in PocketBase `df_personal_todos` Collection gespeichert
- Jeder PB-Eintrag hat ein `reminder_sync_id`-Feld → filtert nach "dir"
- Anderes Gerät: ID in Settings eingeben → gleiche Reminders
- Daten werden wie alle anderen Collections **encrypted** (mit dem Space Key)

## Was zu tun ist

### 1. `src/services/database.ts`
- `reminder_sync_id` zu `app_config` active keys (Doku) hinzufügen

### 2. `src/services/syncService.ts`
- `PB_PERSONAL_TODOS = 'df_personal_todos'` Konstante hinzufügen
- `getPersonalTodosFields()` → `[local_id, reminder_sync_id, data, created_at, updated_at]`
- `setupServer()` → `df_personal_todos` Collection anlegen
- `checkSchema()` → `df_personal_todos` prüfen/fixen
- `fullSync()` → `syncPersonalTodos(syncId)` aufrufen (wenn connected)
- `syncPersonalTodos(syncId)`:
  - Pull: alle PB-Einträge mit `reminder_sync_id = syncId` holen, decrypt, lokal upsert
  - Push: alle lokalen `personal_todos` mit `deleted=0` pushen/updaten
  - Delete: lokal deleted=1 → PB-Eintrag löschen (kein Tombstone nötig, da user-bound)
- `subscribe()` → `df_personal_todos` subscriben, bei Event `loadReminders()` triggern
- `pushReminder(id, syncId)` → public method für Store (fire-and-forget nach CUD)

### 3. `src/stores/reminderStore.ts`
- Nach `addReminder`, `updateReminder`, `deleteReminder`, `completeReminder` etc.:
  → `syncService.pushReminder(id, syncId)` aufrufen (wenn connected)
- `loadReminders()` → nach Load einmal `syncService.syncPersonalTodos()` triggern (optional)

### 4. `src/App.tsx`
- Nach DB-Init: `reminder_sync_id` aus app_config laden, falls nicht vorhanden: UUID generieren + speichern
- `dragonfly-sync` Event Handler → auch `loadReminders()` aufrufen

### 5. `src/components/SettingsPage.tsx` — Tab "Benachrichtigungen"
Neuer Abschnitt "Reminder Sync" unterhalb SMTP:
```
┌─────────────────────────────────────────┐
│ Reminder Sync ID                        │
│ [f3a8b2c1-4d2e-...]  [Kopieren]  [Neu] │
│                                         │
│ Andere Geräte: Gib diese ID ein um      │
│ deine Erinnerungen zu synchronisieren.  │
│ [______________________________] [OK]   │
└─────────────────────────────────────────┘
```
- State: `reminderSyncId`, `reminderSyncIdInput`, `reminderSyncIdCopied`
- `getConfig('reminder_sync_id')` beim Load
- "Neu"-Button: neue UUID generieren, speichern (mit Warnung: alte Reminders auf anderen Geräten werden getrennt)
- "OK"-Button: eingegebene ID übernehmen + speichern

### 6. i18n (de.json + en.json + rest)
Neue Keys in `settings`:
- `reminderSyncTitle`, `reminderSyncHint`, `reminderSyncId`, `reminderSyncCopy`, `reminderSyncCopied`
- `reminderSyncNew`, `reminderSyncNewWarn`, `reminderSyncEnter`, `reminderSyncApply`

## Reihenfolge
1. syncService (Kern-Logik)
2. App.tsx (ID generieren)
3. reminderStore (push nach CUD)
4. SettingsPage UI
5. i18n
6. cargo check + tsc
