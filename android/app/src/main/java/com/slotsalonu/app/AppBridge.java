package com.slotsalonu.app;

import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.os.Build;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.JavascriptInterface;

/** Web istemcisinin ekran yönünü değiştirmesi (101 Okey masası yatay, salon dikey). */
public class AppBridge {
    private final Activity activity;
    AppBridge(Activity activity) { this.activity = activity; }

    @JavascriptInterface
    public void setOrientation(String mode) {
        final boolean land = true; // 4.0: tüm platform yatay (tam ekran)
        activity.runOnUiThread(() -> {
            activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE); // platform her zaman yatay
            View decor = activity.getWindow().getDecorView();
            if (Build.VERSION.SDK_INT >= 30) {
                WindowInsetsController c = decor.getWindowInsetsController();
                if (c != null) {
                    if (land) { c.hide(WindowInsets.Type.systemBars()); c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE); }
                    else c.show(WindowInsets.Type.systemBars());
                }
            } else {
                decor.setSystemUiVisibility(land ? (View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY) : 0);
            }
        });
    }
}
