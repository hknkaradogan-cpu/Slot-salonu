package com.slotsalonu.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.window.OnBackInvokedDispatcher;

import androidx.webkit.WebViewAssetLoader;

/**
 * SLOT SALONU ana ekranı: APK içindeki web istemcisini (assets/www) güvenli
 * https://appassets.androidplatform.net kökeninden yükler. Oyun sonuçları,
 * jeton bakiyesi ve tüm hesap verileri sunucudadır.
 */
public class MainActivity extends Activity {
    private static final String START_URL = "https://appassets.androidplatform.net/assets/www/index.html";
    private WebView webView;
    private BillingBridge billing;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        // Tam ekran: çentik/kamera deliği tarafına da çiz, kenarlarda siyah boşluk kalmasın
        if (android.os.Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView = new WebView(this);
        webView.setBackgroundColor(0xFF1A0640);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setTextZoom(100);

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if ("appassets.androidplatform.net".equals(u.getHost())) return false;
                // Dış bağlantılar (e-posta doğrulama, gizlilik sayfası vb.) tarayıcıda açılır
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }
        });

        billing = new BillingBridge(this, webView);
        webView.addJavascriptInterface(billing, "AndroidBilling");
        webView.addJavascriptInterface(new UpdateBridge(this, webView), "AndroidUpdate");
        webView.addJavascriptInterface(new AppBridge(this), "AndroidApp");
        setContentView(webView);

        // Android 13+ (ve targetSdk 36 ile zorunlu) geri hareketi
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }

        if (savedInstanceState != null) webView.restoreState(savedInstanceState);
        else webView.loadUrl(START_URL);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
        if (billing != null) billing.restore(); // bekleyen/tamamlanmamış satın alımları tekrar doğrula
        new AppBridge(this).setOrientation("landscape"); // geri dönüşte de sistem çubukları gizli, tam ekran
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) new AppBridge(this).setOrientation("landscape");
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) webView.saveState(outState);
    }

    /** Geri tuşu önce web istemcisine sorulur (modal kapat, oyundan çık); işlenmezse uygulama kapanır. */
    private void handleBack() {
        webView.evaluateJavascript("(window.__back && window.__back()) ? 'handled' : 'exit'", value -> {
            if (value == null || !value.contains("handled")) finish();
        });
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() { handleBack(); } // Android 12 ve öncesi

    @Override
    protected void onDestroy() {
        if (billing != null) billing.destroy();
        if (webView != null) { webView.removeJavascriptInterface("AndroidBilling"); webView.removeJavascriptInterface("AndroidUpdate"); webView.removeJavascriptInterface("AndroidApp"); webView.destroy(); }
        super.onDestroy();
    }
}
