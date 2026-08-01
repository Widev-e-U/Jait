package dev.jait.mobile;

import android.app.NotificationManager;
import android.content.Intent;
import com.google.android.gms.wearable.MessageEvent;
import com.google.android.gms.wearable.WearableListenerService;
import java.nio.charset.StandardCharsets;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Receives an answer submitted from a paired Wear OS watch and forwards it exactly like a
 * phone-side answer: submit to the gateway, then clear the phone's own notification/overlay/
 * activity for the same request so it doesn't ask twice.
 */
public class PhoneWearListenerService extends WearableListenerService {
    private static final String ANSWER_PATH = "/jait/answer";

    @Override
    public void onMessageReceived(MessageEvent event) {
        if (!ANSWER_PATH.equals(event.getPath())) return;
        try {
            JSONObject payload = new JSONObject(new String(event.getData(), StandardCharsets.UTF_8));
            String requestId = payload.optString("requestId", "");
            if (requestId.isEmpty()) return;
            boolean cancelled = payload.optBoolean("cancelled", false);
            JSONObject result = cancelled ? null : payload.optJSONObject("result");
            AgentQuestionApi.submit(this, requestId, result, cancelled);

            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE))
                .cancel(AgentPromptActivity.notificationId(requestId));
            Intent dismissIntent = new Intent(AgentPromptActivity.ACTION_DISMISS);
            dismissIntent.setPackage(getPackageName());
            dismissIntent.putExtra(AgentPromptActivity.EXTRA_REQUEST_ID, requestId);
            sendBroadcast(dismissIntent);
        } catch (JSONException ignored) {
        }
    }
}
