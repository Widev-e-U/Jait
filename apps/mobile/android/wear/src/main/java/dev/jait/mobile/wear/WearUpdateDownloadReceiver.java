package dev.jait.mobile.wear;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Manifest-registered (not tied to a transient service instance) so the completed download
 * still triggers an install even if the process that started it has since been killed.
 */
public class WearUpdateDownloadReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
        if (id == -1) return;
        WearUpdater.onDownloadComplete(context, id);
    }
}
