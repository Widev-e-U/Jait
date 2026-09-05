package dev.jait.mobile;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.RemoteInput;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
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
        String type = message.getData().get("type");
        if ("chat.completed".equals(type)) {
            String id = message.getData().get("id");
            if (id != null) ChatNotifications.show(this, id,
                message.getData().get("title"), message.getData().get("body"));
            return;
        }
        if ("alarm.schedule".equals(type)) {
            scheduleAlarm(message);
            return;
        }
        if ("attention.cleared".equals(type)) {
            clearAttention(message.getData().get("requestId"));
            return;
        }
        if (!"attention.raised".equals(type)) return;
        String rawItem = message.getData().get("item");
        if (rawItem == null) return;
        try {
            showAttention(new JSONObject(rawItem));
        } catch (JSONException ignored) {
        }
    }

    /**
     * Answered on another device — drop this phone's card and the watch mirror. The device that
     * actually answered is excluded server-side, so this only ever arrives as news.
     */
    private void clearAttention(String requestId) {
        if (requestId == null || requestId.isEmpty()) return;
        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE))
            .cancel(AgentPromptActivity.notificationId(requestId));
        WearBridge.relayDismiss(this, requestId);
        Intent dismissIntent = new Intent(AgentPromptActivity.ACTION_DISMISS);
        dismissIntent.setPackage(getPackageName());
        dismissIntent.putExtra(AgentPromptActivity.EXTRA_REQUEST_ID, requestId);
        sendBroadcast(dismissIntent);
    }

    /**
     * One entry point for every kind of "a chat needs you". Questions carry their full request in
     * `detail` and keep the rich prompt UI; consent prompts are answered from the notification's
     * own Approve/Reject buttons.
     */
    private void showAttention(JSONObject item) {
        String requestId = item.optString("requestId", "");
        if (requestId.isEmpty()) return;

        WearBridge.relayAttention(this, item);

        JSONObject detail = item.optJSONObject("detail");
        if (AttentionApi.KIND_QUESTION.equals(item.optString("kind"))
            && detail != null
            && detail.optJSONArray("questions") != null) {
            showQuestion(detail, item);
            return;
        }
        showAttentionNotification(item, requestId, null, false, false);
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

    private void showQuestion(JSONObject request, JSONObject item) {
        String requestId = request.optString("id");
        if (requestId.isEmpty()) return;

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

        Intent intent = new Intent(this, AgentPromptActivity.class);
        intent.putExtra(AgentPromptActivity.EXTRA_REQUEST, request.toString());
        intent.putExtra(AgentPromptActivity.EXTRA_DIRECT_SUBMIT, true);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        showAttentionNotification(
            item,
            requestId,
            intent,
            allowFullScreenIntent,
            mode == AgentQuestionPresentation.Mode.NOTIFICATION_ONLY
        );

        if (launchActivityFallback) {
            try {
                startActivity(intent);
            } catch (RuntimeException ignored) {
            }
        }
    }

    /**
     * Posts the phone's card for an attention item.
     *
     * <p>The card is {@code localOnly}: the watch runs its own Jait app and posts a native card
     * with the same actions, so letting this one bridge across would show the user the same
     * request twice on the same wrist.
     *
     * @param promptIntent activity to open on tap, or null to just open the app
     */
    private void showAttentionNotification(
        JSONObject item,
        String requestId,
        Intent promptIntent,
        boolean allowFullScreenIntent,
        boolean quiet
    ) {
        createChannel();
        int notificationId = AgentPromptActivity.notificationId(requestId);
        Intent contentIntent = promptIntent != null ? promptIntent : launchIntent();
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, notificationId, contentIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        String body = item.optString("body", "Jait needs your input to continue.");
        NotificationCompat.Builder notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_jait_notification)
            .setColor(Color.rgb(59, 130, 246))
            .setContentTitle(AgentQuestionPresentation.titleFor(item.optString("title")))
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setCategory(quiet ? NotificationCompat.CATEGORY_MESSAGE : NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setLocalOnly(true)
            .setTimeoutAfter(300_000L);
        if (allowFullScreenIntent) {
            notification.setFullScreenIntent(pendingIntent, true);
        }
        addAttentionActions(notification, item, requestId);

        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE))
            .notify(notificationId, notification.build());
    }

    /**
     * Turns the item's actions into notification buttons. Android shows at most three, which is
     * exactly the cap the gateway already applies when it builds the list.
     */
    private void addAttentionActions(
        NotificationCompat.Builder notification,
        JSONObject item,
        String requestId
    ) {
        JSONArray actions = item.optJSONArray("actions");
        if (actions == null) return;
        String kind = item.optString("kind");
        for (int index = 0; index < actions.length(); index++) {
            JSONObject action = actions.optJSONObject(index);
            if (action == null) continue;
            String actionId = action.optString("id", "");
            String actionKind = action.optString("kind", "");
            String label = action.optString("label", actionId);
            if (actionId.isEmpty() || label.isEmpty()) continue;

            Intent intent = new Intent(this, AttentionActionReceiver.class);
            intent.setAction(AttentionActionReceiver.ACTION_RESOLVE);
            intent.setPackage(getPackageName());
            intent.putExtra(AttentionActionReceiver.EXTRA_KIND, kind);
            intent.putExtra(AttentionActionReceiver.EXTRA_REQUEST_ID, requestId);
            intent.putExtra(AttentionActionReceiver.EXTRA_ACTION_KIND, actionKind);
            intent.putExtra(AttentionActionReceiver.EXTRA_ACTION_ID, actionId);
            // Inline reply needs a mutable PendingIntent so the system can attach the typed text.
            boolean isReply = AttentionApi.ACTION_REPLY.equals(actionKind);
            PendingIntent pendingIntent = PendingIntent.getBroadcast(
                this,
                (requestId + ":" + actionId).hashCode(),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT
                    | (isReply ? PendingIntent.FLAG_MUTABLE : PendingIntent.FLAG_IMMUTABLE)
            );

            NotificationCompat.Action.Builder builder = new NotificationCompat.Action.Builder(
                R.drawable.ic_jait_notification, label, pendingIntent
            );
            if (isReply) {
                builder.addRemoteInput(
                    new RemoteInput.Builder(AttentionActionReceiver.KEY_REPLY)
                        .setLabel(label)
                        .build()
                );
            }
            notification.addAction(builder.build());
        }
    }

    private Intent launchIntent() {
        Intent intent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (intent == null) intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return intent;
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
