#!/usr/bin/env node
// Verifies that required Android permissions are present in AndroidManifest.xml
// before running `npx cap sync`. Fails fast with a readable message if not.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const MANIFEST = resolve(process.cwd(), "android/app/src/main/AndroidManifest.xml");
const REQUIRED = [
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.ACCESS_COARSE_LOCATION",
  "android.permission.INTERNET",
];

function fail(msg) {
  console.error("\n\u274C  Android-Permission-Check fehlgeschlagen:\n");
  console.error(msg);
  console.error(
    "\nBitte oeffne android/app/src/main/AndroidManifest.xml und fuege die fehlenden\n" +
    "<uses-permission>-Eintraege innerhalb von <manifest> (oberhalb von <application>) ein:\n\n" +
    REQUIRED.map((p) => `    <uses-permission android:name=\"${p}\" />`).join("\n") +
    "\n\nDanach erneut `npm run cap:dev` bzw. `npm run cap:prod` ausfuehren.\n"
  );
  process.exit(1);
}

if (!existsSync(MANIFEST)) {
  // Android platform not yet added locally — skip silently (e.g. CI / web-only build).
  console.log("\u2139\uFE0F  android/ nicht vorhanden — Permission-Check uebersprungen.");
  process.exit(0);
}

const xml = readFileSync(MANIFEST, "utf8");
const missing = REQUIRED.filter(
  (perm) => !new RegExp(`<uses-permission[^>]*android:name=\"${perm.replace(/\./g, "\\.")}\"`).test(xml)
);

if (missing.length > 0) {
  fail("Folgende Permissions fehlen im AndroidManifest.xml:\n  - " + missing.join("\n  - "));
}

console.log("\u2705  AndroidManifest.xml: alle benoetigten Permissions vorhanden.");