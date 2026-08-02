package dev.jait.mobile;

import android.app.NotificationManager;
import android.content.Intent;
import android.content.SharedPreferences;
import com.google.android.gms.wearable.MessageEvent;
import com.google.android.gms.wearable.WearableListenerService;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Handles watch answers and serves authenticated, read-only chat snapshots to paired watches.
 * Gateway credentials stay on the phone and are never sent over the Wearable Data Layer.
 */
public class PhoneWearListenerService extends WearableListenerService {
    private static final String ANSWER_PATH = "/jait/answer";
    private static final String SNAPSHOT_REQUEST_PATH = "/jait/snapshot/request";
    private static final int SNAPSHOT_THREAD_LIMIT = 50;
    private static final int DISPLAY_THREAD_LIMIT = 6;
    private static final int MESSAGE_LIMIT = 8;

    @Override
    public void onMessageReceived(MessageEvent event) {
        if (SNAPSHOT_REQUEST_PATH.equals(event.getPath())) {
            String sourceNodeId = event.getSourceNodeId();
            new Thread(
                () -> WearBridge.relaySnapshot(this, sourceNodeId, fetchSnapshot()),
                "jait-watch-snapshot-fetch"
            ).start();
            return;
        }
        if (!ANSWER_PATH.equals(event.getPath())) return;
        handleAnswer(event);
    }

    private void handleAnswer(MessageEvent event) {
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

    private JSONObject fetchSnapshot() {
        JSONObject snapshot = new JSONObject();
        try {
            SharedPreferences preferences = getSharedPreferences("jait-push", MODE_PRIVATE);
            String gatewayUrl = preferences.getString("gatewayUrl", "");
            String authToken = preferences.getString("authToken", "");
            if (gatewayUrl == null || gatewayUrl.isEmpty() || authToken == null || authToken.isEmpty()) {
                return errorSnapshot("Open Jait on your phone to connect");
            }

            String baseUrl = gatewayUrl.endsWith("/")
                ? gatewayUrl.substring(0, gatewayUrl.length() - 1)
                : gatewayUrl;
            JSONObject response = getJson(
                baseUrl + "/api/threads?limit=" + SNAPSHOT_THREAD_LIMIT,
                authToken
            );
            JSONArray threads = response.optJSONArray("threads");
            if (threads == null) threads = new JSONArray();

            int activeThreads = 0;
            int updatedToday = 0;
            String today = utcDay(System.currentTimeMillis());
            JSONArray displayThreads = new JSONArray();
            for (int index = 0; index < threads.length(); index++) {
                JSONObject thread = threads.optJSONObject(index);
                if (thread == null) continue;
                String status = thread.optString("status", "idle");
                if ("running".equals(status)) activeThreads++;
                if (thread.optString("updatedAt", "").startsWith(today)) updatedToday++;
                if (displayThreads.length() >= DISPLAY_THREAD_LIMIT) continue;

                JSONObject displayThread = new JSONObject();
                String threadId = thread.optString("id", "");
                displayThread.put("id", threadId);
                displayThread.put("title", thread.optString("title", "Untitled chat"));
                displayThread.put("status", status);
                displayThread.put("providerId", thread.optString("providerId", "jait"));
                displayThread.put("updatedAt", thread.optString("updatedAt", ""));
                displayThread.put("messages", fetchMessages(baseUrl, authToken, threadId));
                displayThreads.put(displayThread);
            }

            snapshot.put("connected", true);
            snapshot.put("syncedAt", System.currentTimeMillis());
            snapshot.put("totalThreads", threads.length());
            snapshot.put("activeThreads", activeThreads);
            snapshot.put("updatedToday", updatedToday);
            snapshot.put("threads", displayThreads);
            return snapshot;
        } catch (Exception error) {
            return errorSnapshot("Phone could not reach Jait");
        }
    }

    private JSONArray fetchMessages(String baseUrl, String authToken, String threadId) {
        JSONArray messages = new JSONArray();
        if (threadId.isEmpty()) return messages;
        try {
            JSONObject response = getJson(
                baseUrl + "/api/threads/" + threadId + "/activities?limit=" + MESSAGE_LIMIT,
                authToken
            );
            JSONArray activities = response.optJSONArray("activities");
            if (activities == null) return messages;
            for (int index = activities.length() - 1; index >= 0; index--) {
                JSONObject activity = activities.optJSONObject(index);
                if (activity == null || !"message".equals(activity.optString("kind", ""))) continue;
                JSONObject payload = activity.optJSONObject("payload");
                String role = payload == null ? "" : payload.optString("role", "");
                String content = payload == null
                    ? activity.optString("summary", "")
                    : payload.optString("content", activity.optString("summary", ""));
                if (content.trim().isEmpty()) continue;
                JSONObject message = new JSONObject();
                message.put("role", role);
                message.put("content", content);
                message.put("createdAt", activity.optString("createdAt", ""));
                messages.put(message);
            }
        } catch (Exception ignored) {
        }
        return messages;
    }

    private JSONObject getJson(String url, String authToken) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setRequestMethod("GET");
        connection.setRequestProperty("Authorization", "Bearer " + authToken);
        connection.setRequestProperty("Accept", "application/json");
        connection.setConnectTimeout(5_000);
        connection.setReadTimeout(7_000);
        int statusCode = connection.getResponseCode();
        InputStream stream = statusCode >= 200 && statusCode < 300
            ? connection.getInputStream()
            : connection.getErrorStream();
        StringBuilder body = new StringBuilder();
        if (stream != null) {
            try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(stream, StandardCharsets.UTF_8)
            )) {
                String line;
                while ((line = reader.readLine()) != null) body.append(line);
            }
        }
        connection.disconnect();
        if (statusCode < 200 || statusCode >= 300) {
            throw new IllegalStateException("Gateway returned " + statusCode);
        }
        return new JSONObject(body.toString());
    }

    private JSONObject errorSnapshot(String message) {
        JSONObject snapshot = new JSONObject();
        try {
            snapshot.put("connected", false);
            snapshot.put("syncedAt", System.currentTimeMillis());
            snapshot.put("error", message);
            snapshot.put("totalThreads", 0);
            snapshot.put("activeThreads", 0);
            snapshot.put("updatedToday", 0);
            snapshot.put("threads", new JSONArray());
        } catch (JSONException ignored) {
        }
        return snapshot;
    }

    private String utcDay(long timestamp) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date(timestamp));
    }
}
