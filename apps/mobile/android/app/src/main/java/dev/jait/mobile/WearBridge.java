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
 * Relays agent questions to a paired Wear OS watch (and dismiss signals back) over the
 * Wearable Data Layer, so a question can be answered from the wrist without touching the
 * phone. No-op if no watch is paired/reachable. Runs on a background thread since node
 * discovery and message sends block.
 */
final class WearBridge {
    private static final String QUESTION_PATH = "/jait/question";
    private static final String DISMISS_PATH = "/jait/dismiss";
    private static final String UPDATE_PATH = "/jait/update";

    private WearBridge() {
    }

    static void relayQuestion(Context context, JSONObject request) {
        send(context, QUESTION_PATH, request.toString());
    }

    static void relayDismiss(Context context, String requestId) {
        if (requestId == null || requestId.isEmpty()) return;
        send(context, DISMISS_PATH, requestId);
    }

    /**
     * Tells a paired watch a new build is available so it can download and install it over its
     * own network - triggered whenever the phone starts applying its own update, since both
     * builds are always cut from the same release.
     */
    static void relayUpdate(Context context, String downloadUrl) {
        if (downloadUrl == null || downloadUrl.isEmpty()) return;
        send(context, UPDATE_PATH, downloadUrl);
    }

    private static void send(Context context, String path, String payload) {
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
