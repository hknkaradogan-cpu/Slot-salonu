package com.slotsalonu.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Uygulama içi güncelleme (Play Store dışı dağıtım için).
 * Web istemcisi sunucudan son sürümü öğrenir, kullanıcı onaylarsa burada APK indirilir ve
 * Android kurulum ekranı açılır. Tüm sürümler aynı imza anahtarıyla imzalandığı için güncelleme
 * mevcut uygulamanın üzerine kurulur; oyuncu verileri silinmez.
 *
 * JS: AndroidUpdate.versionCode(), AndroidUpdate.versionName(), AndroidUpdate.download(url)
 * Olaylar: window.__update(type, json)  type = progress | ready | error | permission
 */
public class UpdateBridge {
    private final Activity activity;
    private final WebView webView;
    private volatile boolean busy = false;

    public UpdateBridge(Activity activity, WebView webView) { this.activity = activity; this.webView = webView; }

    @JavascriptInterface
    public int versionCode() { return BuildConfig.VERSION_CODE; }

    @JavascriptInterface
    public String versionName() { return BuildConfig.VERSION_NAME; }

    @JavascriptInterface
    public boolean enabled() { return BuildConfig.SELF_UPDATE; }

    @JavascriptInterface
    public void download(final String apkUrl) {
        if (!BuildConfig.SELF_UPDATE || busy) return;
        if (!apkUrl.startsWith("https://")) { emit("error", "Güvenli olmayan güncelleme adresi."); return; }
        if (Build.VERSION.SDK_INT >= 26 && !activity.getPackageManager().canRequestPackageInstalls()) {
            emit("permission", "Güncellemeyi kurmak için bu uygulamaya \"bilinmeyen uygulamaları yükleme\" izni verin, sonra tekrar deneyin.");
            try {
                activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + activity.getPackageName())));
            } catch (Exception ignored) { }
            return;
        }
        busy = true;
        new Thread(() -> {
            HttpURLConnection c = null;
            try {
                File dir = new File(activity.getCacheDir(), "updates");
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("klasör");
                File out = new File(dir, "SlotSalonu-update.apk");
                c = (HttpURLConnection) new URL(apkUrl).openConnection();
                c.setConnectTimeout(15000); c.setReadTimeout(30000);
                c.connect();
                if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
                long total = c.getContentLength(), done = 0; int last = -1;
                try (InputStream in = c.getInputStream(); FileOutputStream fo = new FileOutputStream(out)) {
                    byte[] buf = new byte[64 * 1024]; int n;
                    while ((n = in.read(buf)) > 0) {
                        fo.write(buf, 0, n); done += n;
                        int pct = total > 0 ? (int) (done * 100 / total) : -1;
                        if (pct != last && pct % 5 == 0) { last = pct; emit("progress", String.valueOf(pct)); }
                    }
                }
                emit("ready", "");
                activity.runOnUiThread(() -> install(out));
            } catch (Exception e) {
                emit("error", "Güncelleme indirilemedi: " + e.getMessage());
            } finally {
                if (c != null) c.disconnect();
                busy = false;
            }
        }).start();
    }

    private void install(File apk) {
        try {
            Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".updates", apk);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(i);
        } catch (Exception e) {
            emit("error", "Kurulum ekranı açılamadı: " + e.getMessage());
        }
    }

    private void emit(String type, String msg) {
        try {
            String js = "window.__update && window.__update(" + JSONObject.quote(type) + "," + JSONObject.quote(msg) + ")";
            webView.post(() -> webView.evaluateJavascript(js, null));
        } catch (Exception ignored) { }
    }
}
