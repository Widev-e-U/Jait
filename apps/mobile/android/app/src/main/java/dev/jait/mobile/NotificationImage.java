package dev.jait.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** Fetch a bounded preview from the paired gateway, never from a URL supplied by a push. */
final class NotificationImage {
    private static final int MAX_BYTES = 256 * 1024;
    private static final java.util.concurrent.ThreadPoolExecutor WORKERS =
        new java.util.concurrent.ThreadPoolExecutor(2, 2, 30, java.util.concurrent.TimeUnit.SECONDS,
            new java.util.concurrent.ArrayBlockingQueue<>(16), new java.util.concurrent.ThreadPoolExecutor.DiscardPolicy());
    private NotificationImage() {}

    static void fetch(Context context, String cardId, String notificationId, String roomId, String eventId) {
        Context app = context.getApplicationContext();
        WORKERS.execute(() -> fetchNow(app, cardId, notificationId, roomId, eventId));
    }

    static void fetchAvatar(Context context, String cardId, String notificationId, String roomId, String eventId) {
        if (roomId.isEmpty() || eventId.isEmpty()) return;
        Context app = context.getApplicationContext();
        WORKERS.execute(() -> fetchAvatarNow(app, cardId, notificationId, roomId, eventId));
    }

    // Firebase invokes its message callback on a worker thread. Completing the fetch before
    // returning keeps the service alive while Android is delivering a background push.
    static void fetchNow(Context context, String cardId, String notificationId, String roomId, String eventId) {
        fetchNow(context, cardId, notificationId, roomId, eventId, false);
    }

    static void fetchAvatarNow(Context context, String cardId, String notificationId, String roomId, String eventId) {
        fetchNow(context, cardId, notificationId, roomId, eventId, true);
    }

    private static void fetchNow(Context context, String cardId, String notificationId, String roomId, String eventId, boolean avatar) {
        if (roomId == null || roomId.isEmpty() || eventId == null || eventId.isEmpty()) return;
        Context app = context.getApplicationContext();
        HttpURLConnection connection = null;
        try {
            SharedPreferences prefs = app.getSharedPreferences("jait-push", Context.MODE_PRIVATE);
            String gateway = prefs.getString("gatewayUrl", "");
            String token = prefs.getString("authToken", "");
            if (gateway.isEmpty() || token.isEmpty()) return;
            URL endpoint = new URL(gateway.replaceAll("/+$", "") + (avatar ? "/api/messenger/notification-avatar" : "/api/messenger/notification-image"));
            if (!"http".equals(endpoint.getProtocol()) && !"https".equals(endpoint.getProtocol())) return;
            connection = (HttpURLConnection) endpoint.openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(3000);
            connection.setReadTimeout(5000);
            connection.setRequestMethod("POST");
            connection.setRequestProperty("Authorization", "Bearer " + token);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setDoOutput(true);
            byte[] request = new JSONObject().put("roomId", roomId).put("eventId", eventId)
                .toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream out = connection.getOutputStream()) { out.write(request); }
            if (connection.getResponseCode() != 200 || connection.getContentLengthLong() > MAX_BYTES) return;
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            try (InputStream in = connection.getInputStream()) {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = in.read(buffer)) != -1) {
                    if (bytes.size() + read > MAX_BYTES) return;
                    bytes.write(buffer, 0, read);
                }
            }
            byte[] data = bytes.toByteArray();
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(data, 0, data.length, options);
            if (options.outWidth <= 0 || options.outHeight <= 0 || options.outWidth > 16384 || options.outHeight > 16384) return;
            options.inSampleSize = 1;
            while (options.outWidth / options.inSampleSize > 1024 || options.outHeight / options.inSampleSize > 1024) options.inSampleSize *= 2;
            options.inJustDecodeBounds = false;
            Bitmap image = BitmapFactory.decodeByteArray(data, 0, data.length, options);
            if (image != null) {
                if (avatar) ChatNotifications.attachAvatar(app, cardId, notificationId, image);
                else ChatNotifications.attachImage(app, cardId, notificationId, image);
            }
        } catch (Exception ignored) {
            // The notification remains useful if the gateway or image is unavailable.
        } finally {
            if (connection != null) connection.disconnect();
        }
    }
}
