package dev.jait.mobile.wear;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Bundle;
import android.view.WindowManager;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import com.google.android.gms.tasks.Tasks;
import com.google.android.gms.wearable.MessageClient;
import com.google.android.gms.wearable.Node;
import com.google.android.gms.wearable.Wearable;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.json.JSONException;
import org.json.JSONObject;

public class WearQuestionActivity extends AppCompatActivity {
    public static final String ACTION_DISMISS = "dev.jait.mobile.wear.QUESTION_DISMISS";
    public static final String EXTRA_REQUEST = "request";
    public static final String EXTRA_REQUEST_ID = "requestId";
    private static final String ANSWER_PATH = "/jait/answer";

    private String requestId = "";
    private BroadcastReceiver dismissReceiver;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
        );
        registerDismissReceiver();
        renderRequest(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        renderRequest(intent);
    }

    private void renderRequest(Intent intent) {
        String rawRequest = intent.getStringExtra(EXTRA_REQUEST);
        if (rawRequest == null) {
            finish();
            return;
        }

        try {
            JSONObject request = new JSONObject(rawRequest);
            requestId = request.optString("id", "");
            if (requestId.isEmpty()) {
                finish();
                return;
            }
            ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE))
                .cancel(WearQuestionListenerService.notificationId(requestId));
            setContentView(new WearPromptView(this, this::handleResult).build(request));
        } catch (JSONException error) {
            finish();
        }
    }

    private void handleResult(JSONObject result, boolean cancelled) {
        sendAnswer(requestId, result, cancelled);
        ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE))
            .cancel(WearQuestionListenerService.notificationId(requestId));
        finish();
    }

    private void sendAnswer(String requestId, JSONObject result, boolean cancelled) {
        new Thread(() -> {
            try {
                JSONObject payload = new JSONObject();
                payload.put("requestId", requestId);
                payload.put("cancelled", cancelled);
                if (!cancelled && result != null) payload.put("result", result);
                byte[] data = payload.toString().getBytes(StandardCharsets.UTF_8);
                List<Node> nodes = Tasks.await(
                    Wearable.getNodeClient(this).getConnectedNodes(), 5, TimeUnit.SECONDS
                );
                MessageClient messageClient = Wearable.getMessageClient(this);
                for (Node node : nodes) {
                    Tasks.await(messageClient.sendMessage(node.getId(), ANSWER_PATH, data), 5, TimeUnit.SECONDS);
                }
            } catch (Exception ignored) {
            }
        }, "jait-wear-answer").start();
    }

    private void registerDismissReceiver() {
        dismissReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String dismissedRequestId = intent.getStringExtra(EXTRA_REQUEST_ID);
                if (requestId.equals(dismissedRequestId)) finish();
            }
        };
        ContextCompat.registerReceiver(
            this, dismissReceiver, new IntentFilter(ACTION_DISMISS), ContextCompat.RECEIVER_NOT_EXPORTED
        );
    }

    @Override
    public void onBackPressed() {
        handleResult(null, true);
    }

    @Override
    protected void onDestroy() {
        if (dismissReceiver != null) {
            unregisterReceiver(dismissReceiver);
            dismissReceiver = null;
        }
        super.onDestroy();
    }
}
