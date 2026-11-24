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
 * Plugin Capacitor permettant à l'interface JS de déclencher immédiatement
 * le rafraîchissement du widget d'écran d'accueil Android.
 */
@CapacitorPlugin(name = "DailyTextWidget")
public class DailyTextWidgetPlugin extends Plugin {

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
