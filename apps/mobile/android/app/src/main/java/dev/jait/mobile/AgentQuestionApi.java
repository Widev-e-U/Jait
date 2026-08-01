package dev.jait.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * Submits a question answer or cancellation straight to the gateway. Used by prompt surfaces
 * that aren't backed by a live web session (background push notification, overlay window), so
 * they can't rely on the JS side's own submit request.
 */
final class AgentQuestionApi {
    private AgentQuestionApi() {
    }

    static void submit(Context context, String requestId, JSONObject result, boolean cancelled) {
        new Thread(() -> {
            try {
                SharedPreferences prefs = context.getSharedPreferences("jait-push", Context.MODE_PRIVATE);
                String gatewayUrl = prefs.getString("gatewayUrl", "");
                String authToken = prefs.getString("authToken", "");
                if (gatewayUrl.isEmpty() || authToken.isEmpty()) return;
                String action = cancelled ? "cancel" : "submit";
                URL url = new URL(gatewayUrl + "/api/user-questions/requests/" + requestId + "/" + action);
                HttpURLConnection connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("POST");
                connection.setRequestProperty("Authorization", "Bearer " + authToken);
                connection.setRequestProperty("Content-Type", "application/json");
                connection.setDoOutput(true);
                byte[] body = (cancelled || result == null ? "{}" : result.toString()).getBytes(StandardCharsets.UTF_8);
                try (OutputStream output = connection.getOutputStream()) {
                    output.write(body);
                }
                connection.getResponseCode();
                connection.disconnect();
            } catch (Exception ignored) {
            }
        }, "jait-question-submit").start();
    }
}
