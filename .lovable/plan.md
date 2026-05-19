# Sendungsverfolgung – korrekte Einbindung auf `bochum-bringts.html`

## Was war falsch
1. Das `<form id="trackingForm">` steckt aktuell in einem nackten `<div class="modal-body">` direkt zwischen Navigation und Hero – **ohne Modal-Wrapper, ohne Overlay, ohne Close-Button**. Deshalb erscheint es dauerhaft sichtbar und der „Sendung verfolgen"-Button öffnet nichts.
2. Das Skript `js/tracking.js` (das die Edge Function aufruft) ist **nicht eingebunden**.
3. Der Login-Link oben (`a.login-btn`) hat keinen sichtbaren Text/Icon-Style mehr nötig, aber: die URL stimmt schon (`ecargo-connect.ecargo-logistik.de`).

## Was zu tun ist

### 1. Den losen Block (Zeilen 545–569) entfernen
Komplett raus:
```html
<div class="modal-body">
  <form id="trackingForm" …> … </form>
</div>
```

### 2. Stattdessen ein vollständiges Modal **direkt vor `</body>`** einsetzen
```html
<!-- ======= Tracking Modal ======= -->
<div id="trackingModal" class="tracking-modal" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="trackingModalTitle">
  <div class="tracking-modal-overlay js-tracking-close"></div>
  <div class="tracking-modal-content">
    <button type="button" class="tracking-modal-close js-tracking-close" aria-label="Schließen">&times;</button>
    <h2 id="trackingModalTitle" style="margin-top:0;">Sendung verfolgen</h2>
    <form id="trackingForm" aria-label="Sendungsverfolgung Formular">
      <div class="form-group">
        <label for="trackingNumber">Auftragsnummer</label>
        <input type="text" id="trackingNumber" name="trackingNumber"
               placeholder="EC-XXX-0000000" required autocomplete="off" inputmode="text">
      </div>
      <div class="form-group">
        <label for="trackingPlz">PLZ Empfänger</label>
        <input type="text" id="trackingPlz" name="trackingPlz"
               placeholder="44789" required pattern="\d{5}" maxlength="5"
               inputmode="numeric" autocomplete="off">
      </div>
      <p style="font-size:.85rem;color:#666;margin:.5rem 0 1rem;">
        Die Auftragsnummer finden Sie in Ihrer Versandbestätigung (Format <code>EC-XXX-0000000</code>).
      </p>
      <button type="submit" class="btn-primary">Sendung verfolgen</button>
      <p id="trackingError" role="alert" style="display:none;margin-top:1rem;color:#c0392b;font-size:.9rem;"></p>
    </form>
  </div>
</div>
```

### 3. Skript einbinden – **direkt unter `<script src="js/main.js"></script>`** (Zeile 830)
```html
<script src="js/tracking.js"></script>
```

### 4. `js/tracking.js` – Inhalt (falls noch nicht vorhanden / zu prüfen)
```javascript
(function () {
  'use strict';

  var ENDPOINT = 'https://quvxpnftdwwvhcdvuegw.supabase.co/functions/v1/public-tracking-lookup';
  var ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1dnhwbmZ0ZHd3dmhjZHZ1ZWd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMDU5ODgsImV4cCI6MjA4ODg4MTk4OH0.5CuGQvw7OCQSAYGAehPQco7a9Y2VXyc5u4MNG8LNb6w';

  var modal = document.getElementById('trackingModal');
  var form  = document.getElementById('trackingForm');
  var errEl = document.getElementById('trackingError');

  function openModal()  { if (modal) { modal.classList.add('is-open');  modal.setAttribute('aria-hidden','false'); } }
  function closeModal() { if (modal) { modal.classList.remove('is-open'); modal.setAttribute('aria-hidden','true');  if (errEl){errEl.style.display='none';} } }

  document.querySelectorAll('.js-tracking-btn').forEach(function (b) { b.addEventListener('click', openModal); });
  document.querySelectorAll('.js-tracking-close').forEach(function (b) { b.addEventListener('click', closeModal); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

  if (form) {
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      errEl.style.display = 'none';
      var nr  = document.getElementById('trackingNumber').value.trim().toUpperCase();
      var plz = document.getElementById('trackingPlz').value.trim();
      if (!/^EC-[A-Z0-9]+-P?\d{7}$/.test(nr)) { errEl.textContent = 'Bitte Auftragsnummer im Format EC-XXX-0000000 eingeben.'; errEl.style.display='block'; return; }
      if (!/^\d{5}$/.test(plz))                { errEl.textContent = 'Bitte gültige 5-stellige PLZ eingeben.'; errEl.style.display='block'; return; }

      try {
        var res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type':'application/json', 'apikey': ANON_KEY, 'Authorization':'Bearer '+ANON_KEY },
          body: JSON.stringify({ auftrags_nr: nr, plz: plz })
        });
        if (res.status === 404) { errEl.textContent = 'Keine Sendung mit dieser Auftragsnummer und PLZ gefunden.'; errEl.style.display='block'; return; }
        if (res.status === 429) { errEl.textContent = 'Zu viele Versuche. Bitte später erneut probieren.';        errEl.style.display='block'; return; }
        if (!res.ok)            { errEl.textContent = 'Sendungsverfolgung aktuell nicht erreichbar.';             errEl.style.display='block'; return; }
        var data = await res.json();
        if (data && data.url) { window.location.href = data.url; }
      } catch (_) {
        errEl.textContent = 'Netzwerkfehler. Bitte erneut versuchen.';
        errEl.style.display='block';
      }
    });
  }
})();
```

### 5. CSS für das Modal (in `css/styles.css` ergänzen, falls noch nicht vorhanden)
```css
.tracking-modal{position:fixed;inset:0;z-index:9999;display:none;}
.tracking-modal.is-open{display:block;}
.tracking-modal-overlay{position:absolute;inset:0;background:rgba(0,0,0,.55);}
.tracking-modal-content{position:relative;max-width:480px;margin:8vh auto;background:#fff;border-radius:14px;padding:32px;box-shadow:0 20px 60px rgba(0,0,0,.3);}
.tracking-modal-close{position:absolute;top:10px;right:14px;background:none;border:0;font-size:28px;cursor:pointer;color:#666;}
.tracking-modal .form-group{margin-bottom:14px;}
.tracking-modal label{display:block;font-weight:600;margin-bottom:6px;}
.tracking-modal input{width:100%;padding:10px 12px;border:1px solid #ccc;border-radius:8px;font-size:1rem;}
.tracking-modal .btn-primary{width:100%;padding:12px;background:#2ea44f;color:#fff;border:0;border-radius:8px;font-weight:600;cursor:pointer;}
.tracking-modal .btn-primary:hover{background:#258a42;}
```

## Ergebnis
- Klick auf „Sendung verfolgen" oben rechts ⇒ Modal öffnet sich.
- Nutzer gibt Auftragsnr + PLZ ein ⇒ Edge Function `public-tracking-lookup` wird aufgerufen ⇒ Weiterleitung zu `ecargo-connect.ecargo-logistik.de/track/<token>`.
- Fehlerfälle (404 / 429 / Netz) werden im Modal angezeigt.

Da `bochum-bringts.html` außerhalb des Lovable-Projekts liegt, liefere ich die Snippets nur als Anleitung – nichts in diesem Repo wird geändert.
