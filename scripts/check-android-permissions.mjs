#!/usr/bin/env node
// Validiert die Android-Permissions im AndroidManifest.xml vor `npx cap sync`.
// Prueft Vorhandensein UND korrekte Flags (z.B. foregroundServiceType="location").
import { existsSync, readFileSync } from "node:fs";
import { resolve, relative } from "node:path";

const MANIFEST = resolve(process.cwd(), "android/app/src/main/AndroidManifest.xml");
const REL = relative(process.cwd(), MANIFEST);

// --- Konfig ---------------------------------------------------------------
// Pflicht-Permissions fuer den Fahrer-GPS-Flow.
// Hintergrund-Tracking ist jetzt fester Bestandteil (Plugin: @capacitor-community/background-geolocation),
// damit der Standort auch dann aktualisiert wird, wenn der Fahrer Google Maps oeffnet.
const REQUIRED = [
  "android.permission.INTERNET",
  "android.permission.ACCESS_COARSE_LOCATION",
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.ACCESS_BACKGROUND_LOCATION",
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_LOCATION", // ab Android 14 / targetSdk 34 Pflicht
];
const BG_PERM = "android.permission.ACCESS_BACKGROUND_LOCATION";

// --- Helpers --------------------------------------------------------------
const errors = [];
const warnings = [];
const recommendations = [];

function permRegex(perm) {
  return new RegExp(
    `<uses-permission\\b[^>]*android:name\\s*=\\s*"${perm.replace(/\./g, "\\.")}"[^>]*/?>`,
    "i"
  );
}
function matchPerm(xml, perm) {
  const m = xml.match(permRegex(perm));
  return m ? m[0] : null;
}

// --- Run ------------------------------------------------------------------
if (!existsSync(MANIFEST)) {
  console.log("\u2139\uFE0F  android/ nicht vorhanden \u2014 Permission-Check uebersprungen.");
  process.exit(0);
}
const xml = readFileSync(MANIFEST, "utf8");

// 1) Pflicht-Permissions vorhanden?
for (const perm of REQUIRED) {
  const tag = matchPerm(xml, perm);
  if (!tag) {
    errors.push(`Fehlende Permission: ${perm}`);
    recommendations.push(`    <uses-permission android:name="${perm}" />`);
    continue;
  }
  // 2) Flag-Validierung: maxSdkVersion darf FINE/COARSE nicht stillschweigend abschalten
  const maxSdk = tag.match(/android:maxSdkVersion\s*=\s*"(\d+)"/i);
  if (maxSdk && Number(maxSdk[1]) < 34) {
    errors.push(
      `${perm} hat android:maxSdkVersion="${maxSdk[1]}" \u2014 dadurch wird die Permission auf neueren Geraeten ignoriert.`
    );
    recommendations.push(
      `    Entferne das Attribut android:maxSdkVersion bei ${perm} oder setze es auf >= 34.`
    );
  }
}

// 3) Foreground-Service-Tag: das Plugin @capacitor-community/background-geolocation
//    registriert seinen Service ueber den Android-Manifest-Merger. Wir pruefen nur,
//    dass kein eigener <service> einen anderen foregroundServiceType blockiert.
//    (Kein harter Fehler – nur Hinweis.)
if (matchPerm(xml, BG_PERM)) {
  const hasLocationFgs = /<service\b[^>]*android:foregroundServiceType\s*=\s*"[^"]*\blocation\b[^"]*"/i.test(xml);
  if (!hasLocationFgs) {
    warnings.push(
      "Kein <service> mit android:foregroundServiceType=\"location\" im Manifest gefunden – das ist meist OK, weil das Plugin den Service per Manifest-Merger einfuegt. Falls nach `npx cap sync` kein Hintergrund-GPS funktioniert, Plugin neu installieren und Build cache leeren."
    );
  }
}

// 4) Plausibilitaet: FINE ohne COARSE wird von vielen Geraeten verweigert
if (matchPerm(xml, "android.permission.ACCESS_FINE_LOCATION") && !matchPerm(xml, "android.permission.ACCESS_COARSE_LOCATION")) {
  errors.push("ACCESS_FINE_LOCATION ohne ACCESS_COARSE_LOCATION \u2014 Android 12+ verlangt beide.");
  recommendations.push('    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />');
}

// --- Ausgabe --------------------------------------------------------------
if (warnings.length) {
  console.warn("\n\u26A0\uFE0F  Hinweise:");
  warnings.forEach((w) => console.warn("  \u2022 " + w));
}

if (errors.length === 0) {
  console.log(`\u2705  ${REL}: Permissions & Flags ok.`);
  process.exit(0);
}

console.error(`\n\u274C  Android-Permission-Check fehlgeschlagen (${REL}):\n`);
errors.forEach((e) => console.error("  \u2022 " + e));
console.error("\n\uD83D\uDCA1  Empfohlener Fix \u2014 oeffne " + REL + " und passe folgendes an (innerhalb von <manifest>, FGS-Service innerhalb von <application>):\n");
console.error(recommendations.join("\n"));
console.error(
  "\nDanach `npm run cap:dev` bzw. `npm run cap:prod` erneut ausfuehren.\n" +
  "Dokumentation: https://developer.android.com/training/location/permissions\n"
);
process.exit(1);