package dev.jait.mobile;

import android.content.Context;
import android.graphics.Bitmap;
import android.net.Uri;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.Arrays;
import java.util.Comparator;
import java.util.UUID;

/** Exposes only the private preview directory through Android's per-notification URI grants. */
public final class NotificationPreviewProvider extends FileProvider {
    private static final String DIRECTORY = "notification-previews";
    private static final int MAX_PREVIEWS = 64;
    private static final long MAX_AGE_MS = 24 * 60 * 60 * 1000L;

    static Uri store(Context context, Bitmap image) {
        File directory = new File(context.getCacheDir(), DIRECTORY);
        if (!directory.isDirectory() && !directory.mkdirs()) return null;
        File[] files = directory.listFiles();
        if (files != null) {
            Arrays.sort(files, Comparator.comparingLong(File::lastModified));
            long cutoff = System.currentTimeMillis() - MAX_AGE_MS;
            for (int i = 0; i < files.length; i++) {
                if (files[i].lastModified() < cutoff || files.length - i >= MAX_PREVIEWS) files[i].delete();
            }
        }
        File file = new File(directory, UUID.randomUUID() + ".jpg");
        try (FileOutputStream output = new FileOutputStream(file)) {
            if (image.compress(Bitmap.CompressFormat.JPEG, 80, output)) {
                return getUriForFile(context, context.getPackageName() + ".notification-previews", file);
            }
        } catch (IOException | IllegalArgumentException ignored) {
            // The attachment's text is still available in the notification.
        }
        file.delete();
        return null;
    }
}
