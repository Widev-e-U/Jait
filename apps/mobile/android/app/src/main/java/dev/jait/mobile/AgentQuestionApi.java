package dev.jait.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONObject;

/** Submits native question answers, reporting gateway acceptance to the caller. */
final class AgentQuestionApi {
    interface Callback { void onComplete(boolean accepted, String error); }
    private AgentQuestionApi() {}

    static void submit(Context context, String requestId, JSONObject result, boolean cancelled) {
        submit(context, requestId, result, cancelled, (accepted, error) -> {});
    }

    static void submit(Context context, String requestId, JSONObject result, boolean cancelled, Callback callback) {
        Context appContext = context.getApplicationContext();
        new Thread(() -> {
            try {
                SharedPreferences prefs = appContext.getSharedPreferences("jait-push", Context.MODE_PRIVATE);
                QuestionSubmission.send(prefs.getString("gatewayUrl", ""), prefs.getString("authToken", ""), requestId,
                    cancelled || result == null ? "{}" : result.toString(), cancelled);
            } catch (Exception error) {
                callback.onComplete(false, error.getMessage() == null ? "Phone could not reach Jait" : error.getMessage());
                return;
            }
            callback.onComplete(true, "");
        }, "jait-question-submit").start();
    }
}
