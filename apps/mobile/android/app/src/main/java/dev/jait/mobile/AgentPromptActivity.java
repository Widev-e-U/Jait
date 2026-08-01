package dev.jait.mobile;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Bundle;
import android.view.WindowManager;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import org.json.JSONException;
import org.json.JSONObject;

public class AgentPromptActivity extends AppCompatActivity {
    public static final String ACTION_RESULT = "dev.jait.mobile.AGENT_PROMPT_RESULT";
    public static final String ACTION_DISMISS = "dev.jait.mobile.AGENT_PROMPT_DISMISS";
    public static final String EXTRA_REQUEST = "request";
    public static final String EXTRA_REQUEST_ID = "requestId";
    public static final String EXTRA_RESULT = "result";
    public static final String EXTRA_CANCELLED = "cancelled";
    public static final String EXTRA_DIRECT_SUBMIT = "directSubmit";

    private AgentPromptView promptView;
    private String requestId = "";
    private boolean directSubmit;
    private BroadcastReceiver dismissReceiver;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
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
        directSubmit = intent.getBooleanExtra(EXTRA_DIRECT_SUBMIT, false);
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
                .cancel(notificationId(requestId));
            promptView = new AgentPromptView(this, this::handleResult);
            setContentView(promptView.build(request));
        } catch (JSONException error) {
            finish();
        }
    }

    private void handleResult(JSONObject result, boolean cancelled) {
        if (directSubmit) {
            AgentQuestionApi.submit(this, requestId, result, cancelled);
        } else {
            Intent response = new Intent(ACTION_RESULT);
            response.setPackage(getPackageName());
            response.putExtra(EXTRA_REQUEST_ID, requestId);
            response.putExtra(EXTRA_RESULT, result.toString());
            response.putExtra(EXTRA_CANCELLED, cancelled);
            sendBroadcast(response);
        }

        ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE))
            .cancel(notificationId(requestId));
        finish();
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
            this,
            dismissReceiver,
            new IntentFilter(ACTION_DISMISS),
            ContextCompat.RECEIVER_NOT_EXPORTED
        );
    }

    @Override
    public void onBackPressed() {
        if (promptView != null) promptView.cancel();
        else finish();
    }

    @Override
    protected void onDestroy() {
        if (dismissReceiver != null) {
            unregisterReceiver(dismissReceiver);
            dismissReceiver = null;
        }
        super.onDestroy();
    }

    public static int notificationId(String requestId) {
        return 0x4a17 ^ requestId.hashCode();
    }
}
