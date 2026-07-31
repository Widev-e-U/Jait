package dev.jait.mobile;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
    private static final String UPDATE_DIRECTORY = "updates";
    private static final String APK_FILE_NAME = "jait-update.apk";

    private long activeDownloadId = -1;
    private boolean waitingForInstallPermission = false;
    private BroadcastReceiver downloadReceiver;

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        Uri downloadUri = url == null ? null : Uri.parse(url);
        if (
            downloadUri == null ||
            !"https".equalsIgnoreCase(downloadUri.getScheme()) ||
            !"github.com".equalsIgnoreCase(downloadUri.getHost())
        ) {
            call.reject("Only HTTPS GitHub release URLs are allowed");
            return;
        }
        if (waitingForInstallPermission || activeDownloadId != -1) {
            call.reject("An update is already in progress");
            return;
        }

        Context context = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.getPackageManager().canRequestPackageInstalls()) {
            waitingForInstallPermission = true;
            Intent intent = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + context.getPackageName())
            );
            startActivityForResult(call, intent, "onInstallPermissionResult");
            return;
        }

        startDownload(call, downloadUri);
    }

    @ActivityCallback
    private void onInstallPermissionResult(PluginCall call, ActivityResult result) {
        waitingForInstallPermission = false;
        if (call == null) {
            return;
        }

        Context context = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.getPackageManager().canRequestPackageInstalls()) {
            call.reject("Install permission was not granted");
            return;
        }

        String url = call.getString("url");
        Uri downloadUri = url == null ? null : Uri.parse(url);
        if (downloadUri == null) {
            call.reject("Missing update URL");
            return;
        }
        startDownload(call, downloadUri);
    }

    private void startDownload(PluginCall call, Uri downloadUri) {
        Context context = getContext();
        File apkFile = getApkFile(context);
        if (apkFile == null) {
            call.reject("External app storage is unavailable");
            return;
        }
        if (apkFile.exists() && !apkFile.delete()) {
            call.reject("Could not replace the previous update download");
            return;
        }

        DownloadManager downloadManager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
        if (downloadManager == null) {
            call.reject("DownloadManager unavailable");
            return;
        }

        DownloadManager.Request request = new DownloadManager.Request(downloadUri);
        request.setTitle("Jait update");
        request.setMimeType("application/vnd.android.package-archive");
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        request.setDestinationInExternalFilesDir(context, UPDATE_DIRECTORY, APK_FILE_NAME);
        request.setAllowedOverMetered(true);
        request.setAllowedOverRoaming(true);

        registerDownloadReceiver(call, downloadManager);
        try {
            activeDownloadId = downloadManager.enqueue(request);
        } catch (RuntimeException error) {
            unregisterDownloadReceiver();
            call.reject("Could not start update download", error);
        }
    }

    private void registerDownloadReceiver(PluginCall call, DownloadManager downloadManager) {
        Context context = getContext();
        unregisterDownloadReceiver();

        downloadReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context receiverContext, Intent intent) {
                long finishedId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                if (finishedId != activeDownloadId) {
                    return;
                }

                DownloadManager.Query query = new DownloadManager.Query();
                query.setFilterById(finishedId);
                int downloadStatus = DownloadManager.STATUS_FAILED;
                int failureReason = DownloadManager.ERROR_UNKNOWN;
                try (Cursor cursor = downloadManager.query(query)) {
                    if (cursor != null && cursor.moveToFirst()) {
                        int statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
                        int reasonIndex = cursor.getColumnIndex(DownloadManager.COLUMN_REASON);
                        if (statusIndex >= 0) {
                            downloadStatus = cursor.getInt(statusIndex);
                        }
                        if (reasonIndex >= 0) {
                            failureReason = cursor.getInt(reasonIndex);
                        }
                    }
                }

                activeDownloadId = -1;
                unregisterDownloadReceiver();

                if (downloadStatus != DownloadManager.STATUS_SUCCESSFUL) {
                    call.reject("Download failed with reason " + failureReason);
                    return;
                }

                try {
                    launchInstaller(call);
                } catch (RuntimeException error) {
                    call.reject("Failed to launch installer", error);
                }
            }
        };

        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        ContextCompat.registerReceiver(context, downloadReceiver, filter, ContextCompat.RECEIVER_EXPORTED);
    }

    private void unregisterDownloadReceiver() {
        if (downloadReceiver == null) {
            return;
        }
        try {
            getContext().unregisterReceiver(downloadReceiver);
        } catch (IllegalArgumentException ignored) {
        }
        downloadReceiver = null;
    }

    private void launchInstaller(PluginCall call) {
        Context context = getContext();
        File apkFile = getApkFile(context);
        if (apkFile == null || !apkFile.isFile()) {
            call.reject("Downloaded APK was not found");
            return;
        }

        Uri apkUri = FileProvider.getUriForFile(
            context,
            context.getPackageName() + ".fileprovider",
            apkFile
        );
        Intent installIntent = new Intent(Intent.ACTION_VIEW);
        installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
        installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        context.startActivity(installIntent);

        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("launchedInstaller", true);
        call.resolve(result);
    }

    private File getApkFile(Context context) {
        File updateDirectory = context.getExternalFilesDir(UPDATE_DIRECTORY);
        return updateDirectory == null ? null : new File(updateDirectory, APK_FILE_NAME);
    }

    @Override
    protected void handleOnDestroy() {
        activeDownloadId = -1;
        waitingForInstallPermission = false;
        unregisterDownloadReceiver();
        super.handleOnDestroy();
    }
}
