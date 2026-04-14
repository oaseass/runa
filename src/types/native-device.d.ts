type LunaDeviceAppInfo = {
  versionCode: number;
  versionName: string;
  packageName: string;
};

type LunaDevicePlugin = {
  getAppInfo?: () => Promise<LunaDeviceAppInfo>;
  openExternalUrl?: (input: { url: string }) => Promise<void>;
  startApkUpdate?: (input: { url: string }) => Promise<{ downloadId: number; status: string }>;
};

interface Window {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
    Plugins?: Record<string, unknown> & {
      LunaDevice?: LunaDevicePlugin;
    };
  };
}