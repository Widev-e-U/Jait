package dev.jait.mobile.wear;

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import java.io.File;

/**
 * Downloads and installs a new watch build straight from a GitHub release URL, mirroring the
 * phone's AppUpdaterPlugin. Triggered by the phone over the Wearable Data Layer whenever the
 * phone applies its own update, since both builds are cut from the same release. Uses the
 * watch's own network - independent of the phone once started.
 */
final class WearUpdater {
    private static final String PREFS = "jait-wear-update";
    private static final String UPDATE_DIRECTORY = "updates";
    private static final String APK_FILE_NAME = "jait-wear-update.apk";

    private WearUpdater() {
    }

    static void download(Context context, String url) {
        Uri downloadUri = url == null ? null : Uri.parse(url);
        if (
            downloadUri == null ||
            !"https".equalsIgnoreCase(downloadUri.getScheme()) ||
            !"github.com".equalsIgnoreCase(downloadUri.getHost())
        ) {
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.getPackageManager().canRequestPackageInstalls()) {
            // No JS/activity round-trip available here like the phone's plugin has - best
            // effort is to send the user straight to the one-time settings toggle and retry
            // on the next update trigger.
            try {
                Intent intent = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + context.getPackageName())
                );
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
            } catch (Exception ignored) {
            }
            return;
        }

        File apkFile = getApkFile(context);
        if (apkFile == null) return;
        if (apkFile.exists()) apkFile.delete();

        DownloadManager downloadManager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
        if (downloadManager == null) return;

        DownloadManager.Request request = new DownloadManager.Request(downloadUri);
        request.setTitle("Jait watch update");
        request.setMimeType("application/vnd.android.package-archive");
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        request.setDestinationInExternalFilesDir(context, UPDATE_DIRECTORY, APK_FILE_NAME);
        request.setAllowedOverMetered(true);
        request.setAllowedOverRoaming(true);

        try {
            long downloadId = downloadManager.enqueue(request);
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putLong("downloadId", downloadId)
                .apply();
        } catch (RuntimeException ignored) {
        }
    }

    static void onDownloadComplete(Context context, long completedId) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long expectedId = prefs.getLong("downloadId", -1);
        if (expectedId == -1 || expectedId != completedId) return;
        prefs.edit().remove("downloadId").apply();

        File apkFile = getApkFile(context);
        if (apkFile == null || !apkFile.isFile()) return;

        Uri apkUri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", apkFile);
        Intent installIntent = new Intent(Intent.ACTION_VIEW);
        installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
        installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            context.startActivity(installIntent);
        } catch (Exception ignored) {
        }
    }

    private static File getApkFile(Context context) {
        File updateDirectory = context.getExternalFilesDir(UPDATE_DIRECTORY);
        return updateDirectory == null ? null : new File(updateDirectory, APK_FILE_NAME);
    }
}
