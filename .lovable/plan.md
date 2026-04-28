# Problem

Wenn du in der Routenplanung auf **Drucken** klickst, öffnet sich `/admin/routen/:id/druck` in einem neuen Tab (`window.open(..., "_blank")`). Statt der Druckansicht landest du im Händler-Dashboard (`/`).

# Ursache

In `src/App.tsx` schützt `AdminRoute` die Druckseite. Es prüft die Admin-Rolle über den Hook `useAdminCheck`:

```ts
// useAdminCheck
if (!user) { setIsAdmin(false); return; }
```

Im neuen Tab ist die App-Instanz frisch. Der `AuthContext` braucht einen Tick, um die Session aus dem Storage wiederherzustellen — `user` ist also kurz `null`. Genau in diesem Moment setzt `useAdminCheck` `isAdmin = false`, und `AdminRoute` redirected sofort:

```ts
if (!isAdmin) return <Navigate to="/" replace />;
```

Ergebnis: du landest am Händler-Dashboard, obwohl du Admin bist.

Zusätzlich nutzt `AdminRoute` aktuell nicht das `loading`-Flag aus `useAuth` korrekt zusammen mit `useAdminCheck` — es wartet nur, solange `loading` ODER `isAdmin === null`. Da der Hook im "kein user"-Fall `isAdmin = false` setzt (statt `null` zu lassen, bis Auth fertig ist), greift die Wartelogik nicht.

# Fix

Zwei kleine Änderungen, die das Problem sauber beheben:

### 1. `src/hooks/useAdminCheck.ts`
Den Hook am `loading`-Zustand des `AuthContext` orientieren, damit er nicht voreilig `false` zurückgibt:

- Solange `loading === true` (Auth noch nicht fertig) → `isAdmin` bleibt `null`.
- Erst wenn Auth fertig geladen ist und es wirklich keinen User gibt → `isAdmin = false`.
- Wenn ein User vorhanden ist → wie bisher die `user_roles`-Abfrage.

### 2. (optional, defensiv) `src/App.tsx` — `AdminRoute`
Reihenfolge so anpassen, dass nicht weitergeleitet wird, solange Auth noch lädt — bereits weitgehend korrekt, aber die Bedingung `isAdmin === null` deckt nach dem Fix oben den Race-Fall sauber ab. Keine weitere Änderung nötig, sobald der Hook korrigiert ist.

# Ergebnis

Wenn der Druck-Button die PDF-Ansicht in einem neuen Tab öffnet, wartet `AdminRoute` jetzt auf den Auth-Restore und erkennt dich korrekt als Admin. Du landest direkt auf der Druckseite statt am Händler-Dashboard.
