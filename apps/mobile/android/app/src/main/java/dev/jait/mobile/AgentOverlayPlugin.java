package dev.jait.mobile;

import android.Manifest;
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
import java.util.Objects;
import org.json.JSONException;

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
    private static final String CHANNEL_ID = "jait-agent-questions";
    private static final long NOTIFICATION_TIMEOUT_MS = 300_000L;

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

        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            getPermissionState("notifications") != PermissionState.GRANTED
        ) {
            requestPermissionForAlias("notifications", call, "notificationPermissionResult");
            return;
        }

        showPrompt(call);
    }

    @PermissionCallback
    private void notificationPermissionResult(PluginCall call) {
        if (call == null || activeCall != call) return;
        if (getPermissionState("notifications") == PermissionState.GRANTED) {
            showPrompt(call);
            return;
        }
        launchPromptActivity(call);
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

    private void showPrompt(PluginCall call) {
        JSObject request = call.getObject("request");
        if (request == null) {
            rejectActive("Question request is missing");
            return;
        }

        String requestId = request.getString("id");
        String title = request.getString("title", "Jait needs your input");
        String body = "Open Jait to answer this time-sensitive question.";
        try {
            if (request.has("questions") && request.getJSONArray("questions").length() > 0) {
                body = request.getJSONArray("questions")
                    .getJSONObject(0)
                    .optString("question", body);
            }
        } catch (JSONException error) {
        }

        Context context = getContext();
        Intent activityIntent = createActivityIntent(request);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            context,
            AgentPromptActivity.notificationId(requestId),
            activityIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setOngoing(true)
            .setTimeoutAfter(NOTIFICATION_TIMEOUT_MS);

        if ("urgent".equals(request.getString("attention", "normal"))) {
            builder.setFullScreenIntent(pendingIntent, true);
        }

        NotificationManager notificationManager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        notificationManager.notify(
            AgentPromptActivity.notificationId(requestId),
            builder.build()
        );
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
            rejectActive("Notification permission is required for background questions", error);
        }
    }

    private Intent createActivityIntent(JSObject request) {
        Intent intent = new Intent(getContext(), AgentPromptActivity.class);
        intent.putExtra(AgentPromptActivity.EXTRA_REQUEST, request.toString());
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
        Uri alarmSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        AudioAttributes audioAttributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        channel.setSound(alarmSound, audioAttributes);
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
