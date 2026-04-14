type LunaNativePlatform = "ios" | "android";

type LunaNativePurchaseInput = {
  skuId: string;
  platform: LunaNativePlatform;
  productId: string;
  basePlanId?: string;
  isSubscription: boolean;
  orderId?: string;
};

type LunaNativeRestoreInput = {
  platform: LunaNativePlatform;
};

type LunaNativeAndroidPurchaseResult = {
  productId?: string;
  purchaseToken?: string;
  packageName?: string;
};

type LunaNativeApplePurchaseResult = {
  signedTransactionInfo?: string;
};

type LunaNativeAndroidRestoreResult = {
  purchases?: Array<{
    productId?: string;
    purchaseToken?: string;
    isSubscription?: boolean;
  }>;
};

type LunaNativeAppleRestoreResult = {
  transactions?: string[];
};

interface LunaNativeIapPlugin {
  purchase?: (
    input: LunaNativePurchaseInput,
  ) => Promise<
    LunaNativeAndroidPurchaseResult |
    LunaNativeApplePurchaseResult |
    string
  >;
  restore?: (
    input: LunaNativeRestoreInput,
  ) => Promise<
    LunaNativeAndroidRestoreResult |
    LunaNativeAppleRestoreResult |
    string
  >;
}

interface Window {
  LunaNativeIap?: LunaNativeIapPlugin;
  Capacitor?: {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
    Plugins?: Record<string, unknown> & {
      LunaIap?: LunaNativeIapPlugin;
    };
  };
}