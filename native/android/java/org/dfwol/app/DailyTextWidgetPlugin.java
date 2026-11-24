package org.dfwol.app;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Plugin Capacitor permettant :
 * 1) De rafraîchir immédiatement le widget Android
 * 2) De récupérer la cible d'ouverture ("daily_text") lors d'un clic sur le widget
 */
@CapacitorPlugin(name = "DailyTextWidget")
public class DailyTextWidgetPlugin extends Plugin {

    private static volatile String pendingTarget = null;

    public static void setPendingTarget(String target) {
        pendingTarget = target;
    }

    @PluginMethod
    public void consumePendingTarget(PluginCall call) {
        String target = pendingTarget;
        pendingTarget = null;
        JSObject ret = new JSObject();
        ret.put("target", target);
        call.resolve(ret);
    }

    @PluginMethod
    public void refreshWidget(PluginCall call) {
        Context context = getContext();
        Intent intent = new Intent(context, DailyTextWidgetProvider.class);
        intent.setAction(DailyTextWidgetProvider.ACTION_REFRESH_WIDGET);

        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, DailyTextWidgetProvider.class));
        intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
        context.sendBroadcast(intent);

        JSObject ret = new JSObject();
        ret.put("updated", true);
        ret.put("widgetCount", ids != null ? ids.length : 0);
        call.resolve(ret);
    }
}
