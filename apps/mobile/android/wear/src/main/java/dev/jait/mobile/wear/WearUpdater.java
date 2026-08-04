package dev.jait.mobile.wear;

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import java.io.File;
import java.util.Arrays;

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

        File apkFile = prepareApkFile(context);
        if (apkFile == null) return;

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
        SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long expectedId = preferences.getLong("downloadId", -1);
        if (expectedId == -1 || expectedId != completedId) return;
        preferences.edit().remove("downloadId").apply();
        launchInstallFlow(context);
    }

    static File prepareApkFile(Context context) {
        File updateDirectory = context.getExternalFilesDir(UPDATE_DIRECTORY);
        if (updateDirectory == null) return null;
        if (!updateDirectory.exists() && !updateDirectory.mkdirs()) return null;
        File apkFile = new File(updateDirectory, APK_FILE_NAME);
        if (apkFile.exists() && !apkFile.delete()) return null;
        return apkFile;
    }

    static File getApkFile(Context context) {
        File updateDirectory = context.getExternalFilesDir(UPDATE_DIRECTORY);
        return updateDirectory == null ? null : new File(updateDirectory, APK_FILE_NAME);
    }

    static void launchInstallFlow(Context context) {
        File apkFile = getApkFile(context);
        if (apkFile == null || !apkFile.isFile() || !isTrustedUpdate(context, apkFile)) {
            if (apkFile != null) apkFile.delete();
            return;
        }
        Intent intent = new Intent(context, WearUpdateActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        try {
            context.startActivity(intent);
        } catch (Exception ignored) {
        }
    }

    private static boolean isTrustedUpdate(Context context, File apkFile) {
        try {
            PackageManager packageManager = context.getPackageManager();
            PackageInfo installedInfo = packageManager.getPackageInfo(
                context.getPackageName(),
                PackageManager.GET_SIGNING_CERTIFICATES
            );
            PackageInfo archiveInfo = packageManager.getPackageArchiveInfo(
                apkFile.getAbsolutePath(),
                PackageManager.GET_SIGNING_CERTIFICATES
            );
            if (archiveInfo == null || !context.getPackageName().equals(archiveInfo.packageName)) {
                return false;
            }
            if (archiveInfo.getLongVersionCode() < installedInfo.getLongVersionCode()) {
                return false;
            }
            Signature[] installedSignatures = installedInfo.signingInfo == null
                ? new Signature[0]
                : installedInfo.signingInfo.getSigningCertificateHistory();
            Signature[] archiveSignatures = archiveInfo.signingInfo == null
                ? new Signature[0]
                : archiveInfo.signingInfo.getSigningCertificateHistory();
            for (Signature installedSignature : installedSignatures) {
                for (Signature archiveSignature : archiveSignatures) {
                    if (Arrays.equals(installedSignature.toByteArray(), archiveSignature.toByteArray())) {
                        return true;
                    }
                }
            }
        } catch (Exception ignored) {
        }
        return false;
    }
}
