package com.slotsalonu.app;

import android.app.Activity;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ConsumeParams;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Google Play Billing (Billing Library 8) ile web istemcisi arasındaki köprü.
 * Jetonlar ASLA burada eklenmez: satın alma belirteci web istemcisine iletilir,
 * istemci bunu sunucuya gönderir ve sunucu Google Play Developer API ile
 * doğrulayıp jetonu yükler. Tüketme (consume) sunucu onayından sonra yapılır.
 *
 * JS tarafı: window.AndroidBilling.queryProducts(json) / launch(id, acct) / consume(token) / restore()
 * Olaylar:   window.__billing(type, json)  type = products | purchase | canceled | error
 */
public class BillingBridge implements PurchasesUpdatedListener {
    private final Activity activity;
    private final WebView webView;
    private final BillingClient client;
    private final Map<String, ProductDetails> details = new HashMap<>();
    private List<String> wantedIds = new ArrayList<>();
    private boolean connecting = false;

    public BillingBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        this.client = BillingClient.newBuilder(activity)
                .setListener(this)
                .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                .build();
        connect(null);
    }

    private void connect(final Runnable then) {
        if (client.isReady()) { if (then != null) then.run(); return; }
        if (connecting) return;
        connecting = true;
        client.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult r) {
                connecting = false;
                if (r.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    if (then != null) then.run();
                } else {
                    emitError("Google Play ödeme hizmetine bağlanılamadı (" + r.getResponseCode() + ").");
                }
            }

            @Override
            public void onBillingServiceDisconnected() { connecting = false; }
        });
    }

    @JavascriptInterface
    public boolean isAvailable() { return true; }

    @JavascriptInterface
    public void queryProducts(String jsonIds) {
        try {
            JSONArray a = new JSONArray(jsonIds);
            List<String> ids = new ArrayList<>();
            for (int i = 0; i < a.length(); i++) ids.add(a.getString(i));
            wantedIds = ids;
        } catch (Exception e) { return; }
        connect(this::doQueryProducts);
    }

    private void doQueryProducts() {
        List<QueryProductDetailsParams.Product> list = new ArrayList<>();
        for (String id : wantedIds) {
            list.add(QueryProductDetailsParams.Product.newBuilder().setProductId(id).setProductType(BillingClient.ProductType.INAPP).build());
        }
        if (list.isEmpty()) return;
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder().setProductList(list).build();
        client.queryProductDetailsAsync(params, (result, queryResult) -> {
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) return;
            JSONArray out = new JSONArray();
            for (ProductDetails d : queryResult.getProductDetailsList()) {
                details.put(d.getProductId(), d);
                try {
                    JSONObject o = new JSONObject();
                    o.put("productId", d.getProductId());
                    ProductDetails.OneTimePurchaseOfferDetails offer = d.getOneTimePurchaseOfferDetails();
                    o.put("price", offer != null ? offer.getFormattedPrice() : "");
                    out.put(o);
                } catch (Exception ignored) { }
            }
            try { emit("products", new JSONObject().put("list", out)); } catch (Exception ignored) { }
        });
    }

    @JavascriptInterface
    public void launch(final String productId, final String obfuscatedAccountId) {
        connect(() -> {
            ProductDetails d = details.get(productId);
            if (d == null) {
                // Ürün ayrıntıları henüz yoksa sorgula ve tekrar dene
                List<QueryProductDetailsParams.Product> one = Collections.singletonList(
                        QueryProductDetailsParams.Product.newBuilder().setProductId(productId).setProductType(BillingClient.ProductType.INAPP).build());
                client.queryProductDetailsAsync(QueryProductDetailsParams.newBuilder().setProductList(one).build(), (r, q) -> {
                    if (r.getResponseCode() == BillingClient.BillingResponseCode.OK && !q.getProductDetailsList().isEmpty()) {
                        details.put(productId, q.getProductDetailsList().get(0));
                        activity.runOnUiThread(() -> startFlow(q.getProductDetailsList().get(0), obfuscatedAccountId));
                    } else {
                        emitError("Ürün Google Play'de bulunamadı: " + productId);
                    }
                });
                return;
            }
            activity.runOnUiThread(() -> startFlow(d, obfuscatedAccountId));
        });
    }

    private void startFlow(ProductDetails d, String acct) {
        BillingFlowParams.ProductDetailsParams pdp = BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(d).build();
        BillingFlowParams.Builder b = BillingFlowParams.newBuilder().setProductDetailsParamsList(Collections.singletonList(pdp));
        if (acct != null && !acct.isEmpty()) b.setObfuscatedAccountId(acct); // sunucu bu kimlikle hesabı eşleştirir
        BillingResult r = client.launchBillingFlow(activity, b.build());
        if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) emitError("Ödeme başlatılamadı (" + r.getResponseCode() + ").");
    }

    @Override
    public void onPurchasesUpdated(BillingResult result, List<Purchase> purchases) {
        int code = result.getResponseCode();
        if (code == BillingClient.BillingResponseCode.OK && purchases != null) {
            for (Purchase p : purchases) sendPurchase(p);
        } else if (code == BillingClient.BillingResponseCode.USER_CANCELED) {
            emit("canceled", new JSONObject());
        } else if (code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) {
            restore(); // tüketilmemiş eski satın alma: sunucuya tekrar gönder
        } else {
            emitError("Ödeme tamamlanamadı (" + code + ").");
        }
    }

    private void sendPurchase(Purchase p) {
        try {
            JSONObject o = new JSONObject();
            o.put("productId", p.getProducts().isEmpty() ? "" : p.getProducts().get(0));
            o.put("purchaseToken", p.getPurchaseToken());
            o.put("orderId", p.getOrderId() == null ? "" : p.getOrderId());
            o.put("state", p.getPurchaseState() == Purchase.PurchaseState.PURCHASED ? "purchased"
                    : p.getPurchaseState() == Purchase.PurchaseState.PENDING ? "pending" : "unknown");
            emit("purchase", o);
        } catch (Exception ignored) { }
    }

    /** Uygulama açılışında/öne gelişinde tüketilmemiş satın alımları sunucuya yeniden gönderir. */
    @JavascriptInterface
    public void restore() {
        connect(() -> client.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(),
                (r, list) -> {
                    if (r.getResponseCode() != BillingClient.BillingResponseCode.OK || list == null) return;
                    for (Purchase p : list) sendPurchase(p);
                }));
    }

    /** Sunucu jetonu yükledikten sonra çağrılır; ürün tekrar satın alınabilir hale gelir. */
    @JavascriptInterface
    public void consume(final String purchaseToken) {
        connect(() -> client.consumeAsync(ConsumeParams.newBuilder().setPurchaseToken(purchaseToken).build(), (r, token) -> { }));
    }

    private void emitError(String msg) {
        try { emit("error", new JSONObject().put("message", msg)); } catch (Exception ignored) { }
    }

    private void emit(final String type, final JSONObject data) {
        final String js = "window.__billing && window.__billing(" + JSONObject.quote(type) + "," + JSONObject.quote(data.toString()) + ")";
        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    public void destroy() { try { client.endConnection(); } catch (Exception ignored) { } }
}
