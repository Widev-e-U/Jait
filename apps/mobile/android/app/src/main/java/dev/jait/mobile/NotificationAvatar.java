package dev.jait.mobile;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import java.util.Locale;
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

    /** Provide a recognizable sender icon while an avatar is unavailable or loading. */
    static Bitmap fallback(String name) {
        String label = name == null ? "" : name.trim();
        if (label.isEmpty()) label = "?";
        int codePoint = label.codePointAt(0);
        String initial = new String(Character.toChars(codePoint)).toUpperCase(Locale.ROOT);
        float hue = (label.hashCode() & 0x7fffffff) % 360;
        Bitmap bitmap = Bitmap.createBitmap(128, 128, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(Color.HSVToColor(new float[]{hue, 0.55f, 0.65f}));
        canvas.drawCircle(64, 64, 64, paint);
        paint.setColor(Color.WHITE);
        paint.setTextAlign(Paint.Align.CENTER);
        paint.setTypeface(android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD));
        paint.setTextSize(60);
        canvas.drawText(initial, 64, 64 - (paint.ascent() + paint.descent()) / 2, paint);
        return bitmap;
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
