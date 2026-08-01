package dev.jait.mobile;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.firebase.messaging.FirebaseMessaging;
import java.util.Objects;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(
    name = "AgentOverlay",
    permissions = {
        @Permission(
            alias = "notifications",
            strings = { Manifest.permission.POST_NOTIFICATIONS }
        )
    }
)
public class AgentOverlayPlugin extends Plugin {
    // Bumped from "jait-agent-questions": channel sound is locked in permanently the first
    // time Android creates a channel with a given ID, so replacing the alarm-style ringtone
    // with silence required a new channel ID to actually take effect on existing installs.
    private static final String CHANNEL_ID = "jait-agent-questions-v2";

    private PluginCall activeCall;
    private String activeRequestId;
    private BroadcastReceiver resultReceiver;

    @Override
    public void load() {
        registerResultReceiver();
        createNotificationChannel();
    }

    @PluginMethod
    public void present(PluginCall call) {
        JSObject request = call.getObject("request");
        String requestId = request == null ? null : request.getString("id");
        if (request == null || requestId == null || requestId.isEmpty()) {
            call.reject("A valid question request is required");
            return;
        }
        if (activeCall != null) {
            call.reject("Another agent question is already open");
            return;
        }

        activeCall = call;
        activeRequestId = requestId;
        WearBridge.relayQuestion(getContext(), request);
        if (
            AgentQuestionPresentation.shouldUseSystemOverlay(
                AgentOverlayWindow.canShow(getContext())
            ) && AgentOverlayWindow.show(
                getContext(),
                request,
                (result, cancelled) -> resolveOverlayResult(requestId, result)
            )
        ) {
            return;
        }
        launchPromptActivity(call);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            getPermissionState("notifications") != PermissionState.GRANTED
        ) {
            requestPermissionForAlias("notifications", call, "onRequestPermissionsResult");
            return;
        }
        finishRequestPermissions(call);
    }

    @PermissionCallback
    private void onRequestPermissionsResult(PluginCall call) {
        finishRequestPermissions(call);
    }

    /**
     * "Display over other apps" is what lets a backgrounded push draw the question card
     * immediately instead of just posting a notification. There is no runtime dialog for it,
     * so if it isn't granted yet this sends the user straight to the one settings screen that
     * can grant it.
     */
    private void finishRequestPermissions(PluginCall call) {
        boolean overlayGranted = canDrawOverlays();
        if (!overlayGranted) openOverlaySettings();
        JSObject result = new JSObject();
        result.put("notificationsGranted", getPermissionState("notifications") == PermissionState.GRANTED);
        result.put("overlayGranted", overlayGranted);
        call.resolve(result);
    }

    private boolean canDrawOverlays() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        return Settings.canDrawOverlays(getContext());
    }

    private void openOverlaySettings() {
        try {
            Intent intent = new Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + getContext().getPackageName())
            );
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        } catch (Exception ignored) {
        }
    }

    @PluginMethod
    public void configurePush(PluginCall call) {
        String gatewayUrl = call.getString("gatewayUrl");
        String authToken = call.getString("authToken");
        String deviceId = call.getString("deviceId");
        if (gatewayUrl == null || authToken == null || deviceId == null) {
            call.reject("gatewayUrl, authToken, and deviceId are required");
            return;
        }
        getContext().getSharedPreferences("jait-push", Context.MODE_PRIVATE).edit()
            .putString("gatewayUrl", gatewayUrl)
            .putString("authToken", authToken)
            .putString("deviceId", deviceId)
            .apply();
        call.resolve();
    }

    @PluginMethod
    public void getPushToken(PluginCall call) {
        FirebaseMessaging.getInstance().getToken()
            .addOnSuccessListener(token -> {
                JSObject result = new JSObject();
                result.put("token", token);
                call.resolve(result);
            })
            .addOnFailureListener(error -> call.reject("Unable to obtain Firebase push token", error));
    }

    @PluginMethod
    public void scheduleAlarm(PluginCall call) {
        String alarmId = call.getString("id");
        Long at = call.getLong("at");
        if (alarmId == null || alarmId.isEmpty() || at == null || at <= System.currentTimeMillis()) {
            call.reject("id and a future at timestamp are required");
            return;
        }
        AlarmManager manager = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !manager.canScheduleExactAlarms()) {
            call.reject("Exact alarm permission is required");
            return;
        }
        Intent intent = new Intent(getContext(), AlarmReceiver.class);
        intent.putExtra("id", alarmId);
        intent.putExtra("title", call.getString("title", "Jait alarm"));
        intent.putExtra("body", call.getString("body", "It is time."));
        PendingIntent pendingIntent = PendingIntent.getBroadcast(getContext(), alarmId.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        manager.setAlarmClock(new AlarmManager.AlarmClockInfo(at, pendingIntent), pendingIntent);
        JSObject result = new JSObject();
        result.put("scheduled", true);
        result.put("at", at);
        call.resolve(result);
    }

    @PluginMethod
    public void cancelAlarm(PluginCall call) {
        String alarmId = call.getString("id");
        if (alarmId == null || alarmId.isEmpty()) { call.reject("id is required"); return; }
        Intent intent = new Intent(getContext(), AlarmReceiver.class);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(getContext(), alarmId.hashCode(), intent, PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
        if (pendingIntent != null) {
            ((AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE)).cancel(pendingIntent);
            pendingIntent.cancel();
        }
        call.resolve();
    }

    @PluginMethod
    public void openExactAlarmSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void dismiss(PluginCall call) {
        String requestId = call.getString("requestId");
        if (requestId == null || requestId.isEmpty()) {
            call.reject("requestId is required");
            return;
        }

        cancelNotification(requestId);
        Intent dismissIntent = new Intent(AgentPromptActivity.ACTION_DISMISS);
        dismissIntent.setPackage(getContext().getPackageName());
        dismissIntent.putExtra(AgentPromptActivity.EXTRA_REQUEST_ID, requestId);
        getContext().sendBroadcast(dismissIntent);
        WearBridge.relayDismiss(getContext(), requestId);

        if (Objects.equals(requestId, activeRequestId) && activeCall != null) {
            JSObject result = new JSObject();
            result.put("dismissed", true);
            activeCall.resolve(result);
            clearActiveRequest();
        }

        JSObject result = new JSObject();
        result.put("ok", true);
        call.resolve(result);
    }

    private void resolveOverlayResult(String requestId, JSONObject result) {
        if (
            activeCall == null ||
            !requestId.equals(activeRequestId)
        ) {
            return;
        }
        try {
            activeCall.resolve(new JSObject(result.toString()));
            clearActiveRequest();
        } catch (JSONException error) {
            rejectActive("Question response was invalid", error);
        }
    }

    private void launchPromptActivity(PluginCall call) {
        JSObject request = call.getObject("request");
        if (request == null) {
            rejectActive("Question request is missing");
            return;
        }

        try {
            getContext().startActivity(createActivityIntent(request));
        } catch (RuntimeException error) {
            rejectActive("Unable to open the question prompt", error);
        }
    }

    private Intent createActivityIntent(JSObject request) {
        Intent intent = new Intent(getContext(), AgentPromptActivity.class);
        intent.putExtra(AgentPromptActivity.EXTRA_REQUEST, request.toString());
        intent.putExtra(AgentPromptActivity.EXTRA_DIRECT_SUBMIT, false);
        intent.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK |
            Intent.FLAG_ACTIVITY_CLEAR_TOP |
            Intent.FLAG_ACTIVITY_SINGLE_TOP
        );
        return intent;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager =
            (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Agent questions",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Time-sensitive questions from your Jait agents");
        channel.enableVibration(true);
        channel.setSound(null, null);
        manager.createNotificationChannel(channel);
    }

    private void registerResultReceiver() {
        resultReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String requestId = intent.getStringExtra(AgentPromptActivity.EXTRA_REQUEST_ID);
                if (
                    activeCall == null ||
                    requestId == null ||
                    !requestId.equals(activeRequestId)
                ) {
                    return;
                }

                cancelNotification(requestId);
                String rawResult = intent.getStringExtra(AgentPromptActivity.EXTRA_RESULT);
                if (rawResult == null) {
                    rejectActive("Question response was empty");
                    return;
                }

                try {
                    activeCall.resolve(new JSObject(rawResult));
                    clearActiveRequest();
                } catch (JSONException error) {
                    rejectActive("Question response was invalid", error);
                }
            }
        };

        ContextCompat.registerReceiver(
            getContext(),
            resultReceiver,
            new IntentFilter(AgentPromptActivity.ACTION_RESULT),
            ContextCompat.RECEIVER_NOT_EXPORTED
        );
    }

    private void cancelNotification(String requestId) {
        NotificationManager notificationManager =
            (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        notificationManager.cancel(AgentPromptActivity.notificationId(requestId));
    }

    private void rejectActive(String message) {
        rejectActive(message, null);
    }

    private void rejectActive(String message, Exception error) {
        if (activeCall != null) {
            if (error == null) activeCall.reject(message);
            else activeCall.reject(message, error);
        }
        clearActiveRequest();
    }

    private void clearActiveRequest() {
        activeCall = null;
        activeRequestId = null;
    }

    public static class AlarmReceiver extends BroadcastReceiver {
        private static final String ALARM_CHANNEL_ID = "jait-wake-alarms";

        @Override
        public void onReceive(Context context, Intent intent) {
            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel channel = new NotificationChannel(ALARM_CHANNEL_ID, "Wake-up alarms", NotificationManager.IMPORTANCE_HIGH);
                channel.enableVibration(true);
                channel.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM), new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build());
                manager.createNotificationChannel(channel);
            }
            Intent openIntent = new Intent(context, MainActivity.class);
            openIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent openPendingIntent = PendingIntent.getActivity(context, 7127, openIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            String alarmId = intent.getStringExtra("id");
            NotificationCompat.Builder notification = new NotificationCompat.Builder(context, ALARM_CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(intent.getStringExtra("title"))
                .setContentText(intent.getStringExtra("body"))
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setContentIntent(openPendingIntent)
                .setFullScreenIntent(openPendingIntent, true)
                .setAutoCancel(true);
            manager.notify(AgentPromptActivity.notificationId(alarmId == null ? "wake" : alarmId), notification.build());
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (resultReceiver != null) {
            try {
                getContext().unregisterReceiver(resultReceiver);
            } catch (IllegalArgumentException error) {
            }
            resultReceiver = null;
        }
        clearActiveRequest();
        super.handleOnDestroy();
    }
}
