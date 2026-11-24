package org.dfwol.app;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

/**
 * MainActivity DFWol — Enregistre les plugins natifs (Widget & TTS Neuronal) avant super.onCreate
 * et transmet les clics du widget directement vers le Texte du Jour.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DailyTextWidgetPlugin.class);
        registerPlugin(NeuralTtsPlugin.class);
        handleWidgetLaunchIntent(getIntent(), false);
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleWidgetLaunchIntent(intent, true);
    }

    private void handleWidgetLaunchIntent(Intent intent, boolean evalIfReady) {
        if (intent == null) return;
        String target = intent.getStringExtra(DailyTextWidgetProvider.EXTRA_TARGET);
        if (DailyTextWidgetProvider.TARGET_DAILY_TEXT.equals(target)) {
            DailyTextWidgetPlugin.setPendingTarget(DailyTextWidgetProvider.TARGET_DAILY_TEXT);
            if (evalIfReady && getBridge() != null && getBridge().getWebView() != null) {
                runOnUiThread(() -> {
                    try {
                        getBridge().eval("window.DFWolOpenDailyText && window.DFWolOpenDailyText()", null);
                    } catch (Throwable ignored) {}
                });
            }
        }
    }
}
