package dev.jait.mobile;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/** Decode only bounded image data supplied by the authenticated WebView, never fetch arbitrary URLs. */
final class NotificationAvatar {
    private static final int MAX_BYTES = 1024 * 1024;
    private static final ThreadPoolExecutor WORKER = new ThreadPoolExecutor(1, 1, 30, TimeUnit.SECONDS,
        new ArrayBlockingQueue<>(16), new ThreadPoolExecutor.DiscardPolicy());
    private NotificationAvatar() {}

    static void attach(Context context, String cardId, String eventId, String dataUrl) {
        if (dataUrl == null || dataUrl.isEmpty() || dataUrl.length() > (MAX_BYTES * 4 / 3 + 128)) return;
        Context app = context.getApplicationContext();
        WORKER.execute(() -> {
            Bitmap image = decode(dataUrl);
            if (image != null) ChatNotifications.attachAvatar(app, cardId, eventId, image);
        });
    }

    static Bitmap decode(String dataUrl) {
        if (dataUrl == null || dataUrl.length() > (MAX_BYTES * 4 / 3 + 128)) return null;
        int comma = dataUrl.indexOf(',');
        if (comma < 0) return null;
        String prefix = dataUrl.substring(0, comma);
        if (!prefix.equals("data:image/png;base64") && !prefix.equals("data:image/jpeg;base64")
            && !prefix.equals("data:image/webp;base64")) return null;
        try {
            byte[] bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);
            if (bytes.length == 0 || bytes.length > MAX_BYTES) return null;
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
            if (options.outWidth <= 0 || options.outHeight <= 0 || options.outWidth > 4096 || options.outHeight > 4096) return null;
            options.inJustDecodeBounds = false;
            options.inSampleSize = 1;
            while (options.outWidth / options.inSampleSize > 256 || options.outHeight / options.inSampleSize > 256) {
                options.inSampleSize *= 2;
            }
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
        } catch (IllegalArgumentException ignored) {
            return null;
        }
    }
}
