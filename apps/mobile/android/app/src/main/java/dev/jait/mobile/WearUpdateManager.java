package dev.jait.mobile;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.os.Build;
import com.google.android.gms.tasks.Tasks;
import com.google.android.gms.wearable.CapabilityClient;
import com.google.android.gms.wearable.CapabilityInfo;
import com.google.android.gms.wearable.ChannelClient;
import com.google.android.gms.wearable.MessageClient;
import com.google.android.gms.wearable.Node;
import com.google.android.gms.wearable.Wearable;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

final class WearUpdateManager {
    static final String UPDATE_CHANNEL_PATH = "/jait/update/apk";
    static final String UPDATE_CAPABILITY = "jait_watch_apk_receiver";

    private static final String LEGACY_UPDATE_PATH = "/jait/update";
    // Must equal the wear module's applicationId. It shares the phone's package ID on
    // purpose: the Wearable data layer only routes messages and channels between devices
    // running the same package name.
    private static final String WATCH_PACKAGE = "dev.jait.mobile";
    private static final String UPDATE_DIRECTORY = "wear-updates";
    private static final String APK_FILE_NAME = "jait-wear-update.apk";
    private static final long MAX_APK_BYTES = 100L * 1024L * 1024L;

    interface StatusCallback {
        void onSuccess(Status status);
        void onError(Exception error);
    }

    interface UpdateCallback {
        void onSuccess(UpdateResult result);
        void onError(Exception error);
    }

    static final class WatchStatus {
        final String id;
        final String name;
        final boolean nearby;
        final boolean directTransferSupported;

        WatchStatus(String id, String name, boolean nearby, boolean directTransferSupported) {
            this.id = id;
            this.name = name;
            this.nearby = nearby;
            this.directTransferSupported = directTransferSupported;
        }
    }

    static final class Status {
        final List<WatchStatus> watches;
        final boolean directTransferSupported;

        Status(List<WatchStatus> watches, boolean directTransferSupported) {
            this.watches = watches;
            this.directTransferSupported = directTransferSupported;
        }
    }

    static final class UpdateResult {
        final int directTransfers;
        final int legacyTransfers;

        UpdateResult(int directTransfers, int legacyTransfers) {
            this.directTransfers = directTransfers;
            this.legacyTransfers = legacyTransfers;
        }
    }

    private WearUpdateManager() {
    }

    static void queryStatus(Context context, StatusCallback callback) {
        Context appContext = context.getApplicationContext();
        new Thread(() -> {
            try {
                callback.onSuccess(queryStatusSync(appContext));
            } catch (Exception error) {
                callback.onError(error);
            }
        }, "jait-wear-status").start();
    }

    static void update(Context context, String downloadUrl, UpdateCallback callback) {
        Context appContext = context.getApplicationContext();
        new Thread(() -> {
            File apkFile = null;
            try {
                URI uri = parseAllowedUri(downloadUrl);
                Status status = queryStatusSync(appContext);
                if (status.watches.isEmpty()) {
                    throw new IllegalStateException("No Wear OS watch is connected");
                }

                List<WatchStatus> directWatches = new ArrayList<>();
                List<WatchStatus> legacyWatches = new ArrayList<>();
                for (WatchStatus watch : status.watches) {
                    if (watch.directTransferSupported) {
                        directWatches.add(watch);
                    } else {
                        legacyWatches.add(watch);
                    }
                }

                int directTransfers = 0;
                int legacyTransfers = 0;
                if (!directWatches.isEmpty()) {
                    apkFile = downloadApk(appContext, uri.toURL());
                    validateApk(appContext, apkFile);
                    for (WatchStatus watch : directWatches) {
                        try {
                            transferApk(appContext, watch.id, apkFile);
                            directTransfers++;
                        } catch (Exception directError) {
                            legacyWatches.add(watch);
                        }
                    }
                }

                for (WatchStatus watch : legacyWatches) {
                    if (sendLegacyUpdate(appContext, watch.id, downloadUrl)) {
                        legacyTransfers++;
                    }
                }

                if (directTransfers + legacyTransfers == 0) {
                    throw new IllegalStateException("The connected watch did not accept the update");
                }
                callback.onSuccess(new UpdateResult(directTransfers, legacyTransfers));
            } catch (Exception error) {
                callback.onError(error);
            } finally {
                if (apkFile != null && apkFile.exists()) {
                    apkFile.delete();
                }
            }
        }, "jait-wear-update").start();
    }

    static boolean isAllowedDownloadUri(String value) {
        try {
            parseAllowedUri(value);
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    private static Status queryStatusSync(Context context) throws Exception {
        Map<String, Node> discovered = new LinkedHashMap<>();
        List<Node> connectedNodes = Tasks.await(
            Wearable.getNodeClient(context).getConnectedNodes(),
            10,
            TimeUnit.SECONDS
        );
        for (Node node : connectedNodes) {
            discovered.put(node.getId(), node);
        }

        // {getConnectedNodes()} misses the watch when BLE is asleep and the watch is only on
        // Wi-Fi/cellular, so union in every node advertising the update capability. FILTER_ALL
        // also matches cloud-reachable watches; a node the watch just lost contact with still
        // becomes reachable once it wakes up.
        try {
            CapabilityInfo allNodes = Tasks.await(
                Wearable.getCapabilityClient(context).getCapability(
                    UPDATE_CAPABILITY,
                    CapabilityClient.FILTER_ALL
                ),
                10,
                TimeUnit.SECONDS
            );
            if (allNodes != null) {
                for (Node node : allNodes.getNodes()) {
                    discovered.put(node.getId(), node);
                }
            }
        } catch (Exception ignored) {
        }

        Set<String> directNodeIds = new HashSet<>();
        try {
            // Direct APK transfer needs a reachable transport, so keep FILTER_REACHABLE here.
            CapabilityInfo reachable = Tasks.await(
                Wearable.getCapabilityClient(context).getCapability(
                    UPDATE_CAPABILITY,
                    CapabilityClient.FILTER_REACHABLE
                ),
                10,
                TimeUnit.SECONDS
            );
            if (reachable != null) {
                for (Node node : reachable.getNodes()) {
                    directNodeIds.add(node.getId());
                }
            }
        } catch (Exception ignored) {
        }

        List<WatchStatus> watches = new ArrayList<>();
        for (Node node : discovered.values()) {
            watches.add(new WatchStatus(
                node.getId(),
                node.getDisplayName(),
                node.isNearby(),
                directNodeIds.contains(node.getId())
            ));
        }
        return new Status(watches, !directNodeIds.isEmpty());
    }

    private static File downloadApk(Context context, URL initialUrl) throws Exception {
        File directory = new File(context.getCacheDir(), UPDATE_DIRECTORY);
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IllegalStateException("Could not create the watch update cache");
        }
        File destination = new File(directory, APK_FILE_NAME);
        if (destination.exists() && !destination.delete()) {
            throw new IllegalStateException("Could not replace the previous watch update");
        }

        URL currentUrl = initialUrl;
        for (int redirect = 0; redirect <= 5; redirect++) {
            requireAllowedUrl(currentUrl);
            HttpURLConnection connection = (HttpURLConnection) currentUrl.openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(15_000);
            connection.setReadTimeout(60_000);
            connection.setRequestProperty("Accept", "application/vnd.android.package-archive");
            connection.setRequestProperty("User-Agent", "Jait-Android");
            int status = connection.getResponseCode();
            if (status >= 300 && status < 400) {
                String location = connection.getHeaderField("Location");
                connection.disconnect();
                if (location == null || location.isEmpty()) {
                    throw new IllegalStateException("Watch update redirect had no destination");
                }
                currentUrl = new URL(currentUrl, location);
                continue;
            }
            if (status < 200 || status >= 300) {
                connection.disconnect();
                throw new IllegalStateException("Watch update download failed with HTTP " + status);
            }

            long expectedBytes = connection.getContentLengthLong();
            if (expectedBytes > MAX_APK_BYTES) {
                connection.disconnect();
                throw new IllegalStateException("Watch update APK is unexpectedly large");
            }

            long copiedBytes = 0;
            try (
                InputStream input = connection.getInputStream();
                OutputStream output = new FileOutputStream(destination)
            ) {
                byte[] buffer = new byte[64 * 1024];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    copiedBytes += read;
                    if (copiedBytes > MAX_APK_BYTES) {
                        throw new IllegalStateException("Watch update APK exceeded the size limit");
                    }
                    output.write(buffer, 0, read);
                }
            } finally {
                connection.disconnect();
            }
            if (copiedBytes == 0) {
                throw new IllegalStateException("Downloaded watch update APK was empty");
            }
            return destination;
        }
        throw new IllegalStateException("Watch update had too many redirects");
    }

    private static void validateApk(Context context, File apkFile) throws Exception {
        PackageManager packageManager = context.getPackageManager();
        // Request both signature mechanisms: some API levels only populate signingInfo,
        // others only signatures, and archive parsing is the least reliable path.
        int flags = PackageManager.GET_SIGNING_CERTIFICATES | PackageManager.GET_SIGNATURES;
        PackageInfo archiveInfo = packageManager.getPackageArchiveInfo(apkFile.getAbsolutePath(), flags);
        if (archiveInfo == null) {
            throw new SecurityException(
                "Downloaded watch update could not be read as an APK — the download may have been truncated"
            );
        }
        if (!WATCH_PACKAGE.equals(archiveInfo.packageName)) {
            throw new SecurityException(
                "Downloaded APK is not the Jait Wear OS app (expected "
                    + WATCH_PACKAGE + ", got " + archiveInfo.packageName + ")"
            );
        }
        PackageInfo phoneInfo = packageManager.getPackageInfo(context.getPackageName(), flags);
        if (!signaturesMatch(signatures(phoneInfo), signatures(archiveInfo))) {
            throw new SecurityException("Watch update signature does not match this Jait installation");
        }
    }

    private static Signature[] signatures(PackageInfo packageInfo) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && packageInfo.signingInfo != null) {
            return packageInfo.signingInfo.hasMultipleSigners()
                ? packageInfo.signingInfo.getApkContentsSigners()
                : packageInfo.signingInfo.getSigningCertificateHistory();
        }
        return packageInfo.signatures == null ? new Signature[0] : packageInfo.signatures;
    }

    private static boolean signaturesMatch(Signature[] first, Signature[] second) {
        if (first.length == 0 || second.length == 0) {
            return false;
        }
        for (Signature firstSignature : first) {
            for (Signature secondSignature : second) {
                if (Arrays.equals(firstSignature.toByteArray(), secondSignature.toByteArray())) {
                    return true;
                }
            }
        }
        return false;
    }

    private static void transferApk(Context context, String nodeId, File apkFile) throws Exception {
        ChannelClient channelClient = Wearable.getChannelClient(context);
        ChannelClient.Channel channel = Tasks.await(
            channelClient.openChannel(nodeId, UPDATE_CHANNEL_PATH),
            30,
            TimeUnit.SECONDS
        );
        if (channel == null) {
            throw new IllegalStateException("Could not open the watch update channel");
        }

        try {
            OutputStream channelOutput = Tasks.await(
                channelClient.getOutputStream(channel),
                30,
                TimeUnit.SECONDS
            );
            try (
                InputStream apkInput = new FileInputStream(apkFile);
                OutputStream output = channelOutput
            ) {
                byte[] buffer = new byte[64 * 1024];
                int read;
                while ((read = apkInput.read(buffer)) != -1) {
                    output.write(buffer, 0, read);
                }
                output.flush();
            }
        } finally {
            try {
                Tasks.await(channelClient.close(channel), 30, TimeUnit.SECONDS);
            } catch (Exception ignored) {
            }
        }
    }

    private static boolean sendLegacyUpdate(Context context, String nodeId, String downloadUrl) {
        try {
            MessageClient messageClient = Wearable.getMessageClient(context);
            Tasks.await(
                messageClient.sendMessage(
                    nodeId,
                    LEGACY_UPDATE_PATH,
                    downloadUrl.getBytes(java.nio.charset.StandardCharsets.UTF_8)
                ),
                10,
                TimeUnit.SECONDS
            );
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    private static URI parseAllowedUri(String value) throws Exception {
        if (value == null || value.isEmpty()) {
            throw new IllegalArgumentException("Missing Wear OS update URL");
        }
        URI uri = new URI(value);
        if (!"https".equalsIgnoreCase(uri.getScheme()) || !isAllowedHost(uri.getHost())) {
            throw new IllegalArgumentException("Only HTTPS GitHub release URLs are allowed");
        }
        return uri;
    }

    private static void requireAllowedUrl(URL url) {
        if (!"https".equalsIgnoreCase(url.getProtocol()) || !isAllowedHost(url.getHost())) {
            throw new SecurityException("Watch update redirected outside GitHub");
        }
    }

    private static boolean isAllowedHost(String host) {
        if (host == null) {
            return false;
        }
        String normalized = host.toLowerCase(java.util.Locale.US);
        return "github.com".equals(normalized)
            || normalized.endsWith(".github.com")
            || "githubusercontent.com".equals(normalized)
            || normalized.endsWith(".githubusercontent.com");
    }
}
