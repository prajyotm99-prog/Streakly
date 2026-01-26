package com.prajyot.tasktracker;

import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.BridgeActivity;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 1️⃣ Initialize Firebase
        FirebaseApp.initializeApp(this);
        Log.d("FCM_TEST", "🔥 Firebase initialized");

        // 2️⃣ Force FCM token fetch
        FirebaseMessaging.getInstance().getToken()
            .addOnCompleteListener(task -> {
                if (!task.isSuccessful()) {
                    Log.e("FCM_TEST", "❌ Token fetch failed", task.getException());
                    return;
                }
                String token = task.getResult();
                Log.d("FCM_TEST", "✅ FCM TOKEN: " + token);
            });
    }
}
