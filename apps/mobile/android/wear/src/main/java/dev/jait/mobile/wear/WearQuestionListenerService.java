package dev.jait.mobile.wear;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import com.google.android.gms.wearable.MessageEvent;
import com.google.android.gms.wearable.WearableListenerService;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Receives agent questions relayed from the phone over the Wearable Data Layer and surfaces
 * them as a full-screen notification on the watch, mirroring the phone's locked-screen
 * notification path.
 */
public class WearQuestionListenerService extends WearableListenerService {
    private static final String CHANNEL_ID = "jait-wear-questions";
    private static final String QUESTION_PATH = "/jait/question";
    private static final String DISMISS_PATH = "/jait/dismiss";
    private static final String UPDATE_PATH = "/jait/update";

    @Override
    public void onMessageReceived(MessageEvent event) {
        String payload = new String(event.getData(), StandardCharsets.UTF_8);
        if (QUESTION_PATH.equals(event.getPath())) {
            showQuestion(payload);
        } else if (DISMISS_PATH.equals(event.getPath())) {
            dismiss(payload);
        } else if (UPDATE_PATH.equals(event.getPath())) {
            WearUpdater.download(getApplicationContext(), payload);
        }
    }

    private void showQuestion(String rawRequest) {
        try {
            JSONObject request = new JSONObject(rawRequest);
            String requestId = request.optString("id", "");
            if (requestId.isEmpty()) return;

            createChannel();
            Intent intent = new Intent(this, WearQuestionActivity.class);
            intent.putExtra(WearQuestionActivity.EXTRA_REQUEST, rawRequest);
            intent.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP
            );
            PendingIntent pendingIntent = PendingIntent.getActivity(
                this, notificationId(requestId), intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            String body = "Open to answer this question.";
            JSONArray questions = request.optJSONArray("questions");
            if (questions != null && questions.length() > 0) {
                JSONObject first = questions.optJSONObject(0);
                if (first != null) body = first.optString("question", body);
            }

            NotificationCompat.Builder notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(request.optString("title", "Jait needs your input"))
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setContentIntent(pendingIntent)
                .setFullScreenIntent(pendingIntent, true)
                .setAutoCancel(true)
                .setLocalOnly(true);
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE))
                .notify(notificationId(requestId), notification.build());
        } catch (JSONException ignored) {
        }
    }

    private void dismiss(String requestId) {
        if (requestId == null || requestId.isEmpty()) return;
        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).cancel(notificationId(requestId));
        Intent dismissIntent = new Intent(WearQuestionActivity.ACTION_DISMISS);
        dismissIntent.setPackage(getPackageName());
        dismissIntent.putExtra(WearQuestionActivity.EXTRA_REQUEST_ID, requestId);
        sendBroadcast(dismissIntent);
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID, "Agent questions", NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Time-sensitive questions from your Jait agents");
        channel.enableVibration(true);
        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(channel);
    }

    static int notificationId(String requestId) {
        return 0x4a17 ^ requestId.hashCode();
    }
}
