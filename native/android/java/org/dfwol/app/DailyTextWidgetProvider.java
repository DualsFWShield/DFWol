package org.dfwol.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.util.TypedValue;
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
        String theme = "theme-jw-light";
        int fontScale = 100;

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
                theme = obj.optString("theme", "theme-jw-light");
                fontScale = Math.max(85, Math.min(125, obj.optInt("fontScale", 100)));

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

        int bgRes = R.drawable.widget_bg_light;
        int headerBg = Color.parseColor("#4A6DA7");
        int dateColor = Color.parseColor("#4A6DA7");
        int scriptureColor = Color.parseColor("#292929");
        int refColor = Color.parseColor("#4A6DA7");
        int commentaryColor = Color.parseColor("#626262");

        if ("theme-jw-dark".equals(theme)) {
            bgRes = R.drawable.widget_bg_dark;
            headerBg = Color.parseColor("#1D2638");
            dateColor = Color.parseColor("#9FB9E3");
            scriptureColor = Color.parseColor("#F1F5F9");
            refColor = Color.parseColor("#9FB9E3");
            commentaryColor = Color.parseColor("#CBD5E1");
        } else if ("theme-jw-blue".equals(theme)) {
            bgRes = R.drawable.widget_bg_blue;
            headerBg = Color.parseColor("#2C4775");
            dateColor = Color.parseColor("#E8EFFB");
            scriptureColor = Color.parseColor("#FFFFFF");
            refColor = Color.parseColor("#F4C45D");
            commentaryColor = Color.parseColor("#E2E8F0");
        } else if ("theme-parchment".equals(theme)) {
            bgRes = R.drawable.widget_bg_parchment;
            headerBg = Color.parseColor("#5C4B3B");
            dateColor = Color.parseColor("#4A6DA7");
            scriptureColor = Color.parseColor("#1C1917");
            refColor = Color.parseColor("#4A6DA7");
            commentaryColor = Color.parseColor("#44403C");
        }

        float scale = fontScale / 100.0f;
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_daily_text);
        views.setInt(R.id.widget_root_container, "setBackgroundResource", bgRes);
        views.setInt(R.id.widget_header_bar, "setBackgroundColor", headerBg);
        views.setTextViewText(R.id.widget_one_word_badge, oneWord.toUpperCase());
        views.setTextViewText(R.id.widget_date_text, formattedDate);
        views.setTextColor(R.id.widget_date_text, dateColor);
        views.setTextViewText(R.id.widget_scripture_text, scriptureText);
        views.setTextColor(R.id.widget_scripture_text, scriptureColor);
        views.setTextViewTextSize(R.id.widget_scripture_text, TypedValue.COMPLEX_UNIT_SP, 14f * scale);
        views.setTextViewText(R.id.widget_scripture_ref, "— " + scriptureRef);
        views.setTextColor(R.id.widget_scripture_ref, refColor);
        views.setTextViewText(R.id.widget_commentary_text, bodySummary);
        views.setTextColor(R.id.widget_commentary_text, commentaryColor);
        views.setTextViewTextSize(R.id.widget_commentary_text, TypedValue.COMPLEX_UNIT_SP, 12f * scale);
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
