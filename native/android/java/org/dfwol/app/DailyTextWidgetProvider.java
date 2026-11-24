package org.dfwol.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

/**
 * DFWol — Widget Natif Android "Texte du Jour"
 * Ouvre directement l'écran Texte du Jour dans l'application DFWol au clic.
 */
public class DailyTextWidgetProvider extends AppWidgetProvider {

    private static final String CAPACITOR_PREFS_NAME = "CapacitorStorage";
    private static final String PAYLOAD_KEY = "dfwol_daily_text_widget_payload";
    public static final String ACTION_REFRESH_WIDGET = "org.dfwol.app.ACTION_REFRESH_DAILY_TEXT_WIDGET";
    public static final String EXTRA_TARGET = "dfwol_target";
    public static final String TARGET_DAILY_TEXT = "daily_text";

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
        String bodySummary = "Touchez pour lire le Texte du jour complet dans DFWol.";
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

        // Toujours ouvrir directement le Texte du Jour dans DFWol (jamais le navigateur externe)
        Intent dailyIntent = new Intent(context, MainActivity.class);
        dailyIntent.setAction("org.dfwol.app.OPEN_DAILY_TEXT");
        dailyIntent.putExtra(EXTRA_TARGET, TARGET_DAILY_TEXT);
        dailyIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        PendingIntent pendingDaily = PendingIntent.getActivity(
                context,
                appWidgetId + 100,
                dailyIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_root_container, pendingDaily);
        views.setOnClickPendingIntent(R.id.widget_open_wol_btn, pendingDaily);

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }
}
