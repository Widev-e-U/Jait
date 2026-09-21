package dev.jait.mobile;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSObject;

/** Retain notification activation across WebView startup/login and process recreation. */
final class NotificationNavigation {
    private static final String PREFS = "jait-notification-navigation";
    private static final String EXTRA = "jaitNotification";
    static volatile boolean resumed;
    static volatile String visibleSession = "";
    private NotificationNavigation() {}

    static Intent intent(Context context, String id, String link, String scope) {
        Intent intent = new Intent(context, MainActivity.class);
        // Intent extras do not participate in PendingIntent identity.
        intent.setData(Uri.parse("jait-notification://open/" + Uri.encode(id)));
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        JSObject activation = new JSObject();
        activation.put("id", id);
        activation.put("link", link == null || link.isEmpty() ? "/chat" : link);
        activation.put("scope", scope == null ? "" : scope);
        intent.putExtra(EXTRA, activation.toString());
        return intent;
    }

    static JSObject capture(Context context, Intent intent) {
        if (intent == null) return null;
        String raw = intent.getStringExtra(EXTRA);
        if (raw == null) return null;
        intent.removeExtra(EXTRA);
        try {
            JSObject activation = new JSObject(raw);
            String link = activation.optString("link");
            if (!link.startsWith("/") || link.startsWith("//") || link.contains("\\")) return null;
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("pending", raw).apply();
            return activation;
        } catch (Exception ignored) { return null; }
    }

    static JSObject pending(Context context) {
        try {
            String raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("pending", null);
            return raw == null ? null : new JSObject(raw);
        } catch (Exception ignored) { return null; }
    }

    static void acknowledge(Context context, String id) {
        JSObject current = pending(context);
        if (current != null && current.optString("id").equals(id)) {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove("pending").apply();
        }
    }

    static String scope(Context context) {
        return context.getSharedPreferences("jait-push", Context.MODE_PRIVATE).getString("gatewayUrl", "");
    }
}
