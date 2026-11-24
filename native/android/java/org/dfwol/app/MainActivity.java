package org.dfwol.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

/**
 * MainActivity DFWol — Enregistre le plugin natif DailyTextWidgetPlugin avant super.onCreate.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DailyTextWidgetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
