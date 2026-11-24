package com.sms.teacherattendance;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback wifiCallback;
    private Network boundWifi;

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
        keepTrafficOnWifi();
    }

    /**
     * The School PC is on the school Wi-Fi. When that Wi-Fi has no internet (a PC hotspot, a LAN-only router), Android
     * can send this app's traffic over mobile data instead, and then the School PC "cannot be reached" although the
     * phone shows Wi-Fi connected. Binding the app to the Wi-Fi network keeps every request to the School PC on Wi-Fi.
     */
    private void keepTrafficOnWifi() {
        if (wifiCallback != null) return;
        try {
            connectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (connectivityManager == null) return;
            NetworkRequest request = new NetworkRequest.Builder()
                    .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
                    .build();
            wifiCallback = new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(Network network) {
                    try {
                        boundWifi = network;
                        connectivityManager.bindProcessToNetwork(network);
                    } catch (Exception ignored) {
                    }
                }

                @Override
                public void onLost(Network network) {
                    try {
                        // Only let go of the Wi-Fi we were bound to (moving between two access points must not unbind the new one)
                        if (boundWifi != null && boundWifi.equals(network)) {
                            boundWifi = null;
                            connectivityManager.bindProcessToNetwork(null);
                        }
                    } catch (Exception ignored) {
                    }
                }
            };
            connectivityManager.registerNetworkCallback(request, wifiCallback);
        } catch (Exception ignored) {
            wifiCallback = null;
        }
    }

    @Override
    public void onDestroy() {
        try {
            if (connectivityManager != null && wifiCallback != null) {
                connectivityManager.unregisterNetworkCallback(wifiCallback);
                connectivityManager.bindProcessToNetwork(null);
            }
        } catch (Exception ignored) {
        }
        wifiCallback = null;
        super.onDestroy();
    }
}
