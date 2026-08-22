package dev.jait.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Resolves an attention item straight from a notification action, without the app ever coming to
 * the foreground. Each attention kind has its own gateway endpoint; this is the one place that
 * knows the mapping, so the notification, the overlay and the watch all answer the same way.
 *
 * Answering here is enough — the gateway raises `attention.cleared` off the back of the decision,
 * which revokes the matching notification on every other device.
 */
final class AttentionApi {
    static final String KIND_CONSENT = "consent";
    static final String KIND_QUESTION = "question";

    /** Action kinds carried by an attention item, mirroring the gateway's AttentionActionKind. */
    static final String ACTION_APPROVE = "approve";
    static final String ACTION_REJECT = "reject";
    static final String ACTION_SELECT = "select";
    static final String ACTION_REPLY = "reply";

    private AttentionApi() {
    }

    /**
     * @param actionId  the action's id as sent by the gateway. For "select" this is
     *                  "{questionId}:{label}"; for "reply" it is the bare question id.
     * @param freeText  text typed into the notification's inline reply, or null.
     */
    static void resolve(
        Context context,
        String kind,
        String requestId,
        String actionKind,
        String actionId,
        String freeText
    ) {
        if (requestId == null || requestId.isEmpty()) return;
        Context appContext = context.getApplicationContext();
        new Thread(() -> {
            if (KIND_CONSENT.equals(kind)) {
                String decision = ACTION_APPROVE.equals(actionKind) ? "approve" : "reject";
                post(appContext, "/api/mobile/consent/" + requestId + "/" + decision, null);
                return;
            }
            JSONObject answers = questionAnswers(actionKind, actionId, freeText);
            if (answers == null) {
                post(appContext, "/api/user-questions/requests/" + requestId + "/cancel", null);
                return;
            }
            post(appContext, "/api/user-questions/requests/" + requestId + "/submit", answers);
        }, "jait-attention-resolve").start();
    }

    /**
     * Builds the `{"answers": {...}}` body the user-question endpoint expects. Returns null when
     * the action carries no answer, which the caller treats as a cancellation.
     */
    static JSONObject questionAnswers(String actionKind, String actionId, String freeText) {
        if (actionId == null || actionId.isEmpty()) return null;
        try {
            String questionId = actionId;
            JSONArray selected = new JSONArray();
            if (ACTION_SELECT.equals(actionKind)) {
                int separator = actionId.indexOf(':');
                if (separator <= 0) return null;
                questionId = actionId.substring(0, separator);
                selected.put(actionId.substring(separator + 1));
            } else if (!ACTION_REPLY.equals(actionKind)) {
                return null;
            }

            String text = freeText == null ? "" : freeText.trim();
            if (selected.length() == 0 && text.isEmpty()) return null;

            JSONObject answer = new JSONObject();
            answer.put("selected", selected);
            answer.put("freeText", text.isEmpty() ? JSONObject.NULL : text);
            answer.put("skipped", false);
            JSONObject answers = new JSONObject();
            answers.put(questionId, answer);
            JSONObject result = new JSONObject();
            result.put("answers", answers);
            return result;
        } catch (JSONException error) {
            return null;
        }
    }

    private static void post(Context context, String path, JSONObject body) {
        try {
            SharedPreferences preferences = context.getSharedPreferences("jait-push", Context.MODE_PRIVATE);
            String gatewayUrl = preferences.getString("gatewayUrl", "");
            String authToken = preferences.getString("authToken", "");
            if (gatewayUrl.isEmpty() || authToken.isEmpty()) return;
            if (gatewayUrl.endsWith("/")) gatewayUrl = gatewayUrl.substring(0, gatewayUrl.length() - 1);

            HttpURLConnection connection = (HttpURLConnection) new URL(gatewayUrl + path).openConnection();
            connection.setRequestMethod("POST");
            connection.setRequestProperty("Authorization", "Bearer " + authToken);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setConnectTimeout(5_000);
            connection.setReadTimeout(7_000);
            connection.setDoOutput(true);
            byte[] payload = (body == null ? "{}" : body.toString()).getBytes(StandardCharsets.UTF_8);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(payload);
            }
            connection.getResponseCode();
            connection.disconnect();
        } catch (Exception ignored) {
        }
    }
}
