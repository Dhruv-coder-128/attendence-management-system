package com.sms.teacherattendance;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onStart() {
        super.onStart();
        // The screens are designed for normal text size. A large phone font setting made every label wrap onto
        // two or three lines; allow at most a little enlargement so the layout stays clean.
        try {
            float scale = getResources().getConfiguration().fontScale;
            int zoom = Math.round(Math.min(Math.max(scale, 1f), 1.1f) * 100);
            getBridge().getWebView().getSettings().setTextZoom(zoom);
        } catch (Exception ignored) {
        }
    }
}
