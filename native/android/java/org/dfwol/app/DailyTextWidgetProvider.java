package org.dfwol.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

/**
 * DFWol — Widget Natif Android "Texte du Jour" (Apparence JW.org)
 * Lit les données synchronisées par Capacitor Preferences ("CapacitorStorage" -> "dfwol_daily_text_widget_payload").
 */
public class DailyTextWidgetProvider extends AppWidgetProvider {

    private static final String CAPACITOR_PREFS_NAME = "CapacitorStorage";
    private static final String PAYLOAD_KEY = "dfwol_daily_text_widget_payload";
    public static final String ACTION_REFRESH_WIDGET = "org.dfwol.app.ACTION_REFRESH_DAILY_TEXT_WIDGET";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (ACTION_REFRESH_WIDGET.equals(intent.getAction())) {
            AppWidgetManager manager = AppWidgetManager.getInstance(context);
            ComponentName component = new ComponentName(context, DailyTextWidgetProvider.class);
            int[] ids = manager.getAppWidgetIds(component);
            onUpdate(context, manager, ids);
        }
    }

    public static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        SharedPreferences prefs = context.getSharedPreferences(CAPACITOR_PREFS_NAME, Context.MODE_PRIVATE);
        String rawJson = prefs.getString(PAYLOAD_KEY, null);

        String formattedDate = "Examinons les Écritures chaque jour";
        String oneWord = "Confiance";
        String scriptureText = "« Ta parole est une lampe pour mon pied, et une lumière pour ma route. »";
        String scriptureRef = "Psaume 119:105";
        String bodySummary = "Ouvrez DFWol pour synchroniser le texte du jour.";
        String wolUrl = "https://wol.jw.org/fr/wol/dt/r30/lp-f";
        boolean showCommentary = true;

        if (rawJson != null && !rawJson.isEmpty()) {
            try {
                JSONObject obj = new JSONObject(rawJson);
                formattedDate = obj.optString("formattedDate", formattedDate);
                oneWord = obj.optString("oneWord", oneWord);
                scriptureText = obj.optString("scriptureText", scriptureText);
                scriptureRef = obj.optString("scriptureRef", scriptureRef);
                String displayMode = obj.optString("displayMode", "shortParagraph");
                String oneSentence = obj.optString("oneSentence", "");
                String shortParagraph = obj.optString("shortParagraph", "");
                String fullCommentary = obj.optString("commentary", bodySummary);
                wolUrl = obj.optString("wolUrl", wolUrl);
                showCommentary = obj.optBoolean("showCommentary", true);

                if ("oneWord".equals(displayMode)) {
                    showCommentary = false;
                } else if ("oneSentence".equals(displayMode) && !oneSentence.isEmpty()) {
                    bodySummary = oneSentence;
                } else if ("shortParagraph".equals(displayMode) && !shortParagraph.isEmpty()) {
                    bodySummary = shortParagraph;
                } else {
                    bodySummary = fullCommentary;
                }
            } catch (Exception ignored) {
            }
        }

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_daily_text);
        views.setTextViewText(R.id.widget_one_word_badge, oneWord.toUpperCase());
        views.setTextViewText(R.id.widget_date_text, formattedDate);
        views.setTextViewText(R.id.widget_scripture_text, scriptureText);
        views.setTextViewText(R.id.widget_scripture_ref, "— " + scriptureRef);
        views.setTextViewText(R.id.widget_commentary_text, bodySummary);
        views.setViewVisibility(R.id.widget_commentary_text, showCommentary ? View.VISIBLE : View.GONE);

        Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launchIntent != null) {
            PendingIntent pendingLaunch = PendingIntent.getActivity(
                    context,
                    0,
                    launchIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            views.setOnClickPendingIntent(R.id.widget_root_container, pendingLaunch);
        }

        Intent browserIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(wolUrl));
        PendingIntent pendingBrowser = PendingIntent.getActivity(
                context,
                1,
                browserIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_open_wol_btn, pendingBrowser);

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }
}
