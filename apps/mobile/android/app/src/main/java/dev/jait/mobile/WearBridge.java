package dev.jait.mobile;

import android.content.Context;
import com.google.android.gms.tasks.Tasks;
import com.google.android.gms.wearable.MessageClient;
import com.google.android.gms.wearable.Node;
import com.google.android.gms.wearable.Wearable;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

/**
 * Relays Jait companion data between the phone and paired Wear OS watches over the Wearable
 * Data Layer. Authentication remains on the phone; the watch only receives display snapshots.
 */
final class WearBridge {
    private static final String ATTENTION_PATH = "/jait/attention";
    private static final String DISMISS_PATH = "/jait/dismiss";
    private static final String SNAPSHOT_PATH = "/jait/snapshot";

    private WearBridge() {
    }

    /**
     * Relays a full attention item — consent prompts included, not just questions — so the watch
     * can render the same actions the phone card offers.
     */
    static void relayAttention(Context context, JSONObject item) {
        sendToAll(context, ATTENTION_PATH, item.toString());
    }

    static void relayDismiss(Context context, String requestId) {
        if (requestId == null || requestId.isEmpty()) return;
        sendToAll(context, DISMISS_PATH, requestId);
    }

    static void relaySnapshot(Context context, String nodeId, JSONObject snapshot) {
        if (nodeId == null || nodeId.isEmpty()) return;
        Context appContext = context.getApplicationContext();
        new Thread(() -> {
            try {
                byte[] data = snapshot.toString().getBytes(StandardCharsets.UTF_8);
                Tasks.await(
                    Wearable.getMessageClient(appContext).sendMessage(nodeId, SNAPSHOT_PATH, data),
                    5,
                    TimeUnit.SECONDS
                );
            } catch (Exception ignored) {
            }
        }, "jait-wear-snapshot").start();
    }

    private static void sendToAll(Context context, String path, String payload) {
        Context appContext = context.getApplicationContext();
        new Thread(() -> {
            try {
                byte[] data = payload.getBytes(StandardCharsets.UTF_8);
                List<Node> nodes = Tasks.await(
                    Wearable.getNodeClient(appContext).getConnectedNodes(), 5, TimeUnit.SECONDS
                );
                MessageClient messageClient = Wearable.getMessageClient(appContext);
                for (Node node : nodes) {
                    Tasks.await(messageClient.sendMessage(node.getId(), path, data), 5, TimeUnit.SECONDS);
                }
            } catch (Exception ignored) {
            }
        }, "jait-wear-relay").start();
    }
}
