import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.eb7a8883e02647dc82bb300906e3fa89",
  appName: "e-cargo-driver",
  webDir: "dist",
  server: {
    url: "https://eb7a8883-e026-47dc-82bb-300906e3fa89.lovableproject.com?forceHideBadge=true",
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;