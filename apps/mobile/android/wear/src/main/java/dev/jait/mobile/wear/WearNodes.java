package dev.jait.mobile.wear;

import android.content.Context;
import com.google.android.gms.tasks.Tasks;
import com.google.android.gms.wearable.CapabilityClient;
import com.google.android.gms.wearable.CapabilityInfo;
import com.google.android.gms.wearable.Node;
import com.google.android.gms.wearable.Wearable;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * Resolves the phone node for Wearable message sends. {@code getConnectedNodes()} alone misses the
 * phone when the watch is only reachable over Wi-Fi or the cloud (BLE asleep/disconnected), which
 * looks exactly like "sync stopped working". We union it with capability-filtered nodes, which
 * includes cloud-reachable phones, so messages go out over whichever route is available.
 */
final class WearNodes {
    /** Capability both the phone and watch apps advertise in their manifests. */
    static final String CAPABILITY = "jait_companion";

    private WearNodes() {
    }

    /** All nodes messages can currently reach: directly connected plus cloud-reachable peers. */
    static List<Node> reachable(Context context) {
        Map<String, Node> nodes = new LinkedHashMap<>();
        try {
            List<Node> connected = Tasks.await(
                Wearable.getNodeClient(context).getConnectedNodes(), 5, TimeUnit.SECONDS
            );
            for (Node node : connected) nodes.put(node.getId(), node);
        } catch (Exception ignored) {
        }
        try {
            // FILTER_ALL also matches the phone when it's only cloud-reachable.
            CapabilityInfo capability = Tasks.await(
                Wearable.getCapabilityClient(context)
                    .getCapability(CAPABILITY, CapabilityClient.FILTER_ALL),
                5,
                TimeUnit.SECONDS
            );
            for (Node node : capability.getNodes()) nodes.put(node.getId(), node);
        } catch (Exception ignored) {
        }
        return new ArrayList<>(nodes.values());
    }
}