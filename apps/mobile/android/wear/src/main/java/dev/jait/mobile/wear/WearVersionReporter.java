package dev.jait.mobile.wear;

import android.content.Context;
import android.content.pm.PackageInfo;

import com.google.android.gms.tasks.Tasks;
import com.google.android.gms.wearable.DataItem;
import com.google.android.gms.wearable.DataItemBuffer;
import com.google.android.gms.wearable.DataMap;
import com.google.android.gms.wearable.DataMapItem;
import com.google.android.gms.wearable.PutDataMapRequest;
import com.google.android.gms.wearable.PutDataRequest;
import com.google.android.gms.wearable.Wearable;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * Publishes this watch's app version to the Wearable Data Layer so the phone can display it in
 * Settings. The version is a {@code wear://*<phone node>/jait/watch/version} data item keyed by
 * the watch's own node id; the phone reads (and re-reads on refresh) it with
 * {@code DataClient.getDataItems()}. Data items survive offline periods and are re-delivered to
 * the phone whenever it reconnects — no polling from the watch is needed.
 */
final class WearVersionReporter {
    /** Data item path the watch publishes its version under (phone reads it via DataClient). */
    static final String VERSION_PATH = "/jait/watch/version";
    /** Message the phone sends when it wants a fresh publish (e.g. Settings refresh). */
    static final String VERSION_REQUEST_PATH = "/jait/watch/version/request";

    private WearVersionReporter() {
    }

    /** Publishes the installed Jait wear app version as a data item. Best effort, never throws. */
    static void publish(Context context) {
        Context appContext = context.getApplicationContext();
        new Thread(() -> {
            try {
                PackageInfo info = appContext.getPackageManager()
                    .getPackageInfo(appContext.getPackageName(), 0);
                // minSdk 28 → longVersionCode is always available here.
                long versionCode = info.getLongVersionCode();
                String versionName = info.versionName == null ? "" : info.versionName;

                PutDataMapRequest request = PutDataMapRequest.create(VERSION_PATH);
                DataMap map = request.getDataMap();
                map.putString("version", versionName);
                map.putLong("versionCode", versionCode);
                map.putLong("publishedAt", System.currentTimeMillis());
                PutDataRequest put = request.asPutDataRequest();
                put.setUrgent();
                Tasks.await(Wearable.getDataClient(appContext).putDataItem(put), 10, TimeUnit.SECONDS);
            } catch (Exception ignored) {
                // Offline transport or Play services hiccup: the phone falls back to "unknown".
            }
        }, "jait-wear-version-pub").start();
    }

    static final class WatchVersion {
        final String version;
        final long versionCode;

        WatchVersion(String version, long versionCode) {
            this.version = version;
            this.versionCode = versionCode;
        }
    }

    /**
     * Reads known watch versions from the local data layer cache. Keys are watch node ids (the
     * data item URI host). Returns an empty map when nothing has been published yet.
     */
    static Map<String, WatchVersion> readAll(Context context) {
        Map<String, WatchVersion> versions = new HashMap<>();
        try {
            DataItemBuffer buffer = Tasks.await(
                Wearable.getDataClient(context.getApplicationContext())
                    .getDataItems(new android.net.Uri.Builder()
                        .scheme("wear")
                        .path(VERSION_PATH)
                        .build()),
                10,
                TimeUnit.SECONDS
            );
            if (buffer == null) return versions;
            try {
                for (DataItem item : buffer) {
                    String host = item.getUri() == null ? null : item.getUri().getHost();
                    if (host == null || host.isEmpty()) continue;
                    DataMap map = DataMapItem.fromDataItem(item).getDataMap();
                    String version = map.getString("version");
                    long versionCode = map.getLong("versionCode", -1L);
                    if (version == null && versionCode < 0) continue;
                    versions.put(host, new WatchVersion(version, versionCode));
                }
            } finally {
                buffer.release();
            }
        } catch (Exception ignored) {
        }
        return versions;
    }
}