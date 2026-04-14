import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.lunastar.app",
  appName: "LUNA",
  webDir: "native-shell",
  server: {
    url: process.env.CAPACITOR_SERVER_URL ?? "https://runa.co.kr",
    cleartext: false,
    androidScheme: "https",
  },
  android: {
    adjustMarginsForEdgeToEdge: "force",
    allowMixedContent: false,
    webContentsDebuggingEnabled: true,
  },
};

export default config;