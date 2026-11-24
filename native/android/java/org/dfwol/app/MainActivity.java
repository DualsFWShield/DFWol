package org.dfwol.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

/**
 * MainActivity DFWol — Enregistre les plugins natifs (Widget & TTS Neuronal) avant super.onCreate.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DailyTextWidgetPlugin.class);
        registerPlugin(NeuralTtsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
