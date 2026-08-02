package dev.jait.mobile;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONException;
import org.json.JSONObject;

public class JaitMessagingService extends FirebaseMessagingService {
    // Notification channel sound/vibration settings are locked in the first time Android
    // creates a channel with a given ID and can never be changed afterward for an existing
    // install - only a new channel ID picks up new settings, so this was bumped when the
    // alarm-style ringtone was replaced with silence.
    private static final String CHANNEL_ID = "jait-agent-questions-v2";

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        registerToken(token);
    }

    private void registerToken(String token) {
        new Thread(() -> {
            try {
                android.content.SharedPreferences prefs = getSharedPreferences("jait-push", MODE_PRIVATE);
                String gatewayUrl = prefs.getString("gatewayUrl", "");
                String authToken = prefs.getString("authToken", "");
                String deviceId = prefs.getString("deviceId", "");
                if (gatewayUrl.isEmpty() || authToken.isEmpty() || deviceId.isEmpty()) return;
                JSONObject payload = new JSONObject();
                payload.put("id", deviceId);
                payload.put("name", "Jait Android");
                payload.put("platform", "mobile");
                payload.put("pushToken", token);
                payload.put("capabilities", new org.json.JSONArray().put("notifications").put("agent-question-overlay"));
                HttpURLConnection connection = (HttpURLConnection) new URL(gatewayUrl + "/api/mobile/devices/register").openConnection();
                connection.setRequestMethod("POST");
                connection.setRequestProperty("Authorization", "Bearer " + authToken);
                connection.setRequestProperty("Content-Type", "application/json");
                connection.setDoOutput(true);
                byte[] body = payload.toString().getBytes(StandardCharsets.UTF_8);
                try (OutputStream output = connection.getOutputStream()) { output.write(body); }
                connection.getResponseCode();
                connection.disconnect();
            } catch (Exception ignored) {
            }
        }, "jait-push-refresh").start();
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        if ("alarm.schedule".equals(message.getData().get("type"))) {
            scheduleAlarm(message);
            return;
        }
        if (!"user-question.requested".equals(message.getData().get("type"))) return;
        String rawRequest = message.getData().get("request");
        if (rawRequest == null) return;
        try {
            showQuestion(new JSONObject(rawRequest));
        } catch (JSONException ignored) {
        }
    }

    private void scheduleAlarm(RemoteMessage message) {
        try {
            String alarmId = message.getData().get("id");
            long at = Long.parseLong(message.getData().get("at"));
            android.app.AlarmManager manager = (android.app.AlarmManager) getSystemService(ALARM_SERVICE);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !manager.canScheduleExactAlarms()) return;
            Intent intent = new Intent(this, AgentOverlayPlugin.AlarmReceiver.class);
            intent.putExtra("id", alarmId);
            intent.putExtra("title", message.getData().get("title"));
            intent.putExtra("body", message.getData().get("body"));
            PendingIntent pendingIntent = PendingIntent.getBroadcast(this, alarmId.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            manager.setAlarmClock(new android.app.AlarmManager.AlarmClockInfo(at, pendingIntent), pendingIntent);
        } catch (Exception ignored) {
        }
    }

    private void showQuestion(JSONObject request) {
        String requestId = request.optString("id");
        if (requestId.isEmpty()) return;

        WearBridge.relayQuestion(this, request);

        AgentDeviceState.Snapshot deviceState = AgentDeviceState.read(this);
        boolean overlayAvailable = AgentOverlayWindow.canShow(this);
        AgentQuestionPresentation.Mode mode = AgentQuestionPresentation.modeFor(
            deviceState.interactive,
            deviceState.locked,
            overlayAvailable
        );
        boolean launchActivityFallback = mode == AgentQuestionPresentation.Mode.DIRECT_ACTIVITY;
        boolean allowFullScreenIntent = launchActivityFallback;
        if (mode == AgentQuestionPresentation.Mode.SYSTEM_OVERLAY) {
            if (AgentOverlayWindow.show(getApplicationContext(), request)) return;
            launchActivityFallback = AgentDeviceState.isActive(this);
            allowFullScreenIntent = launchActivityFallback;
        }

        createChannel();
        Intent intent = new Intent(this, AgentPromptActivity.class);
        intent.putExtra(AgentPromptActivity.EXTRA_REQUEST, request.toString());
        intent.putExtra(AgentPromptActivity.EXTRA_DIRECT_SUBMIT, true);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, AgentPromptActivity.notificationId(requestId), intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        String body = "Jait needs your input to continue.";
        if (request.optJSONArray("questions") != null && request.optJSONArray("questions").length() > 0) {
            JSONObject first = request.optJSONArray("questions").optJSONObject(0);
            if (first != null) body = first.optString("question", body);
        }
        NotificationCompat.Builder notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_jait_notification)
            .setColor(Color.rgb(59, 130, 246))
            .setContentTitle(AgentQuestionPresentation.titleFor(request.optString("title")))
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setCategory(
                mode == AgentQuestionPresentation.Mode.NOTIFICATION_ONLY
                    ? NotificationCompat.CATEGORY_MESSAGE
                    : NotificationCompat.CATEGORY_ALARM
            )
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setTimeoutAfter(300_000L);
        if (allowFullScreenIntent) {
            notification.setFullScreenIntent(pendingIntent, true);
        }
        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE))
            .notify(AgentPromptActivity.notificationId(requestId), notification.build());

        if (launchActivityFallback) {
            try {
                startActivity(intent);
            } catch (RuntimeException ignored) {
            }
        }
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID, "Agent questions", NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Questions from your Jait agents");
        channel.enableVibration(true);
        channel.setSound(null, null);
        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(channel);
    }
}
