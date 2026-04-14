package com.luna.app.iap;

import android.util.Log;

import androidx.annotation.NonNull;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

@CapacitorPlugin(name = "LunaIap")
public class LunaIapPlugin extends Plugin implements PurchasesUpdatedListener {
    private static final String LOG_TAG = "LunaIapPlugin";

    private BillingClient billingClient;
    private PluginCall pendingPurchaseCall;

    @Override
    public void load() {
        super.load();
        ensureBillingConnection(null);
    }

    @Override
    protected void handleOnDestroy() {
        if (billingClient != null) {
            billingClient.endConnection();
            billingClient = null;
        }
        super.handleOnDestroy();
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        String productId = call.getString("productId");
        if (productId == null || productId.isEmpty()) {
            call.reject("productId is required");
            return;
        }

        boolean isSubscription = call.getBoolean("isSubscription", false);
        String basePlanId = call.getString("basePlanId");

        ensureBillingConnection(new BillingReadyCallback() {
            @Override
            public void onReady() {
                QueryProductDetailsParams.Product product = QueryProductDetailsParams.Product.newBuilder()
                    .setProductId(productId)
                    .setProductType(isSubscription ? BillingClient.ProductType.SUBS : BillingClient.ProductType.INAPP)
                    .build();

                QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                    .setProductList(Collections.singletonList(product))
                    .build();

                billingClient.queryProductDetailsAsync(params, (billingResult, productDetailsList) -> {
                    if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        call.reject(getBillingErrorMessage(billingResult, "상품 정보를 불러오지 못했어요."));
                        return;
                    }

                    ProductDetails productDetails = findProductDetails(productDetailsList, productId);
                    if (productDetails == null) {
                        call.reject("Google Play 상품을 찾지 못했어요.");
                        return;
                    }

                    BillingFlowParams.ProductDetailsParams.Builder detailsParams = BillingFlowParams.ProductDetailsParams.newBuilder()
                        .setProductDetails(productDetails);

                    if (isSubscription) {
                        String offerToken = findOfferToken(productDetails, basePlanId);
                        if (offerToken == null) {
                            call.reject("구독 base plan 을 찾지 못했어요.");
                            return;
                        }
                        detailsParams.setOfferToken(offerToken);
                    }

                    BillingFlowParams flowParams = BillingFlowParams.newBuilder()
                        .setProductDetailsParamsList(Collections.singletonList(detailsParams.build()))
                        .build();

                    pendingPurchaseCall = call;
                    BillingResult launchResult = billingClient.launchBillingFlow(getActivity(), flowParams);
                    if (launchResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        pendingPurchaseCall = null;
                        call.reject(getBillingErrorMessage(launchResult, "결제 화면을 열지 못했어요."));
                    }
                });
            }

            @Override
            public void onError(String message) {
                call.reject(message);
            }
        });
    }

    @PluginMethod
    public void restore(PluginCall call) {
        ensureBillingConnection(new BillingReadyCallback() {
            @Override
            public void onReady() {
                ArrayList<JSObject> restored = new ArrayList<>();
                queryOwnedPurchases(BillingClient.ProductType.SUBS, true, restored, new RestoreStep() {
                    @Override
                    public void next() {
                        queryOwnedPurchases(BillingClient.ProductType.INAPP, false, restored, new RestoreStep() {
                            @Override
                            public void next() {
                                JSArray purchases = new JSArray();
                                for (JSObject entry : restored) {
                                    purchases.put(entry);
                                }

                                JSObject result = new JSObject();
                                result.put("purchases", purchases);
                                call.resolve(result);
                            }

                            @Override
                            public void fail(String message) {
                                call.reject(message);
                            }
                        });
                    }

                    @Override
                    public void fail(String message) {
                        call.reject(message);
                    }
                });
            }

            @Override
            public void onError(String message) {
                call.reject(message);
            }
        });
    }

    @Override
    public void onPurchasesUpdated(@NonNull BillingResult billingResult, List<Purchase> purchases) {
        if (pendingPurchaseCall == null) {
            return;
        }

        PluginCall call = pendingPurchaseCall;
        pendingPurchaseCall = null;

        int responseCode = billingResult.getResponseCode();
        if (responseCode == BillingClient.BillingResponseCode.USER_CANCELED) {
            call.reject("사용자가 결제를 취소했어요.");
            return;
        }

        if (responseCode != BillingClient.BillingResponseCode.OK || purchases == null || purchases.isEmpty()) {
            call.reject(getBillingErrorMessage(billingResult, "결제 결과를 확인하지 못했어요."));
            return;
        }

        Purchase purchase = findCompletedPurchase(purchases);
        if (purchase == null) {
            call.reject("결제가 아직 대기 중이거나 완료되지 않았어요.");
            return;
        }

        List<String> products = purchase.getProducts();
        if (products.isEmpty()) {
            call.reject("Google Play 상품 ID를 찾지 못했어요.");
            return;
        }

        JSObject result = new JSObject();
        result.put("productId", products.get(0));
        result.put("purchaseToken", purchase.getPurchaseToken());
        result.put("packageName", getContext().getPackageName());
        call.resolve(result);
    }

    private void queryOwnedPurchases(String productType, boolean isSubscription, ArrayList<JSObject> restored, RestoreStep step) {
        QueryPurchasesParams params = QueryPurchasesParams.newBuilder()
            .setProductType(productType)
            .build();

        billingClient.queryPurchasesAsync(params, (billingResult, purchaseList) -> {
            if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                step.fail(getBillingErrorMessage(billingResult, "구매 내역을 불러오지 못했어요."));
                return;
            }

            for (Purchase purchase : purchaseList) {
                if (purchase.getPurchaseState() != Purchase.PurchaseState.PURCHASED) {
                    continue;
                }

                List<String> products = purchase.getProducts();
                if (products.isEmpty()) {
                    continue;
                }

                JSObject entry = new JSObject();
                entry.put("productId", products.get(0));
                entry.put("purchaseToken", purchase.getPurchaseToken());
                entry.put("isSubscription", isSubscription);
                restored.add(entry);
            }

            step.next();
        });
    }

    private void ensureBillingConnection(BillingReadyCallback callback) {
        if (billingClient != null && billingClient.isReady()) {
            if (callback != null) {
                callback.onReady();
            }
            return;
        }

        if (billingClient == null) {
            billingClient = BillingClient.newBuilder(getContext())
                .setListener(this)
                .enablePendingPurchases(
                    PendingPurchasesParams.newBuilder()
                        .enableOneTimeProducts()
                        .build()
                )
                .build();
        }

        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(@NonNull BillingResult billingResult) {
                if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    if (callback != null) {
                        callback.onReady();
                    }
                    return;
                }

                if (callback != null) {
                    callback.onError(getBillingErrorMessage(billingResult, "Google Play 결제를 초기화하지 못했어요."));
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
                Log.w(LOG_TAG, "Billing service disconnected");
            }
        });
    }

    private ProductDetails findProductDetails(List<ProductDetails> productDetailsList, String productId) {
        if (productDetailsList == null) {
            return null;
        }

        for (ProductDetails details : productDetailsList) {
            if (productId.equals(details.getProductId())) {
                return details;
            }
        }

        return null;
    }

    private String findOfferToken(ProductDetails productDetails, String basePlanId) {
        List<ProductDetails.SubscriptionOfferDetails> offers = productDetails.getSubscriptionOfferDetails();
        if (offers == null || offers.isEmpty()) {
            return null;
        }

        if (basePlanId == null || basePlanId.isEmpty()) {
            return offers.get(0).getOfferToken();
        }

        for (ProductDetails.SubscriptionOfferDetails offer : offers) {
            if (basePlanId.equals(offer.getBasePlanId())) {
                return offer.getOfferToken();
            }
        }

        return null;
    }

    private Purchase findCompletedPurchase(List<Purchase> purchases) {
        for (Purchase purchase : purchases) {
            if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                return purchase;
            }
        }

        return null;
    }

    private String getBillingErrorMessage(BillingResult billingResult, String fallback) {
        if (billingResult == null) {
            return fallback;
        }

        String debugMessage = billingResult.getDebugMessage();
        if (debugMessage != null && !debugMessage.isEmpty()) {
            return debugMessage;
        }

        return fallback;
    }

    private interface BillingReadyCallback {
        void onReady();

        void onError(String message);
    }

    private interface RestoreStep {
        void next();

        void fail(String message);
    }
}