package dev.jait.mobile.wear;

import android.app.NotificationManager;
import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
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
    private static final String SNAPSHOT_REQUEST_PATH = "/jait/snapshot/request";

    private enum Screen {
        HOME,
        CHATS,
        CHAT,
        REQUESTS,
        QUESTION
    }

    private String requestId = "";
    private BroadcastReceiver companionReceiver;
    private Screen screen = Screen.HOME;
    private int page = 0;
    private WearSnapshotStore.Chat selectedChat;

    private final WearDashboardView.Listener dashboardListener = new WearDashboardView.Listener() {
        @Override
        public void onHome() {
            renderHome();
        }

        @Override
        public void onChats() {
            renderChats(0);
        }

        @Override
        public void onRequests() {
            renderRequests(0);
        }

        @Override
        public void onRefresh() {
            requestSnapshot();
            renderHome();
        }

        @Override
        public void onOpenChat(WearSnapshotStore.Chat chat) {
            selectedChat = chat;
            renderChat(0);
        }

        @Override
        public void onOpenRequest(WearRequestStore.Entry entry) {
            if (!entry.isPending()) return;
            Intent requestIntent = new Intent(WearQuestionActivity.this, WearQuestionActivity.class);
            requestIntent.putExtra(EXTRA_REQUEST, entry.rawRequest);
            renderRequest(requestIntent);
        }

        @Override
        public void onPage(int nextPage) {
            if (screen == Screen.CHATS) renderChats(nextPage);
            else if (screen == Screen.CHAT) renderChat(nextPage);
            else if (screen == Screen.REQUESTS) renderRequests(nextPage);
        }

        @Override
        public void onToggleTheme() {
            WearTheme.toggle(WearQuestionActivity.this);
            refreshCurrentScreen();
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        enableFullscreen();
        getWindow().addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
        );
        ensureNotificationPermission();
        registerCompanionReceiver();
        // Make sure the phone can always see which version is installed here, even before any
        // question/snapshot traffic has ever been exchanged.
        WearVersionReporter.publish(this);
        renderRequest(getIntent());
    }

    @Override
    protected void onResume() {
        super.onResume();
        ensureNotificationPermission();
        enableFullscreen();
        if (screen == Screen.QUESTION) return;
        // Wrist raised again: re-render current screen (picks up theme/snapshot changes) and
        // ask the phone for a fresh snapshot so metrics and chats are current.
        refreshCurrentScreen();
        requestSnapshot();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enableFullscreen();
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
            renderHome();
            requestSnapshot();
            return;
        }

        try {
            JSONObject request = new JSONObject(rawRequest);
            requestId = request.optString("id", "");
            if (requestId.isEmpty()) {
                renderHome();
                return;
            }
            screen = Screen.QUESTION;
            page = 0;
            ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE))
                .cancel(WearQuestionListenerService.notificationId(requestId));
            setContentView(new WearPromptView(this, this::handleResult).build(request));
        } catch (JSONException error) {
            renderHome();
        }
    }

    private void renderHome() {
        requestId = "";
        selectedChat = null;
        screen = Screen.HOME;
        page = 0;
        setContentView(new WearDashboardView(this).buildHome(
            WearSnapshotStore.read(this),
            WearRequestStore.list(this),
            dashboardListener
        ));
    }

    private void renderChats(int requestedPage) {
        requestId = "";
        selectedChat = null;
        screen = Screen.CHATS;
        page = requestedPage;
        setContentView(new WearDashboardView(this).buildChats(
            WearSnapshotStore.read(this),
            page,
            dashboardListener
        ));
    }

    private void renderChat(int requestedPage) {
        if (selectedChat == null) {
            renderChats(0);
            return;
        }
        requestId = "";
        screen = Screen.CHAT;
        page = requestedPage;
        setContentView(new WearDashboardView(this).buildChat(
            selectedChat,
            page,
            dashboardListener
        ));
    }

    private void renderRequests(int requestedPage) {
        requestId = "";
        selectedChat = null;
        screen = Screen.REQUESTS;
        page = requestedPage;
        setContentView(new WearDashboardView(this).buildRequests(
            WearRequestStore.list(this),
            page,
            dashboardListener
        ));
    }

    private void handleResult(JSONObject result, boolean cancelled) {
        String completedRequestId = requestId;
        if (completedRequestId.isEmpty()) return;
        WearRequestStore.markState(
            this,
            completedRequestId,
            cancelled ? WearRequestStore.STATE_DISMISSED : WearRequestStore.STATE_ANSWERED
        );
        sendAnswer(completedRequestId, result, cancelled);
        ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE))
            .cancel(WearQuestionListenerService.notificationId(completedRequestId));
        renderRequests(0);
    }

    private void requestSnapshot() {
        new Thread(() -> {
            try {
                byte[] data = new byte[0];
                MessageClient messageClient = Wearable.getMessageClient(this);
                for (Node node : WearNodes.reachable(this)) {
                    Tasks.await(
                        messageClient.sendMessage(node.getId(), SNAPSHOT_REQUEST_PATH, data),
                        5,
                        TimeUnit.SECONDS
                    );
                }
            } catch (Exception ignored) {
            }
        }, "jait-watch-snapshot-request").start();
    }

    private void sendAnswer(String requestId, JSONObject result, boolean cancelled) {
        new Thread(() -> {
            try {
                JSONObject payload = new JSONObject();
                payload.put("requestId", requestId);
                payload.put("cancelled", cancelled);
                if (!cancelled && result != null) payload.put("result", result);
                byte[] data = payload.toString().getBytes(StandardCharsets.UTF_8);
                MessageClient messageClient = Wearable.getMessageClient(this);
                for (Node node : WearNodes.reachable(this)) {
                    Tasks.await(messageClient.sendMessage(node.getId(), ANSWER_PATH, data), 5, TimeUnit.SECONDS);
                }
            } catch (Exception ignored) {
            }
        }, "jait-wear-answer").start();
    }

    private void registerCompanionReceiver() {
        companionReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (WearQuestionListenerService.ACTION_SNAPSHOT_UPDATED.equals(intent.getAction())) {
                    refreshCurrentScreenAfterSnapshot();
                    return;
                }

                String dismissedRequestId = intent.getStringExtra(EXTRA_REQUEST_ID);
                WearRequestStore.markState(
                    WearQuestionActivity.this,
                    dismissedRequestId,
                    WearRequestStore.STATE_DISMISSED
                );
                if (screen == Screen.QUESTION && requestId.equals(dismissedRequestId)) {
                    renderRequests(0);
                } else if (screen == Screen.REQUESTS || screen == Screen.HOME) {
                    refreshCurrentScreen();
                }
            }
        };
        IntentFilter filter = new IntentFilter(ACTION_DISMISS);
        filter.addAction(WearQuestionListenerService.ACTION_SNAPSHOT_UPDATED);
        ContextCompat.registerReceiver(
            this,
            companionReceiver,
            filter,
            ContextCompat.RECEIVER_NOT_EXPORTED
        );
    }

    private void refreshCurrentScreenAfterSnapshot() {
        if (screen == Screen.CHAT && selectedChat != null) {
            WearSnapshotStore.Snapshot snapshot = WearSnapshotStore.read(this);
            for (WearSnapshotStore.Chat chat : snapshot.chats) {
                if (selectedChat.id.equals(chat.id)) {
                    selectedChat = chat;
                    break;
                }
            }
        }
        refreshCurrentScreen();
    }

    private void refreshCurrentScreen() {
        if (screen == Screen.HOME) renderHome();
        else if (screen == Screen.CHATS) renderChats(page);
        else if (screen == Screen.CHAT) renderChat(page);
        else if (screen == Screen.REQUESTS) renderRequests(page);
    }

    /**
     * Watches on Android 13+ silently drop every notification until POST_NOTIFICATIONS is
     * granted at runtime, so ask once on the first launch of the dashboard.
     */
    private void ensureNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            == PackageManager.PERMISSION_GRANTED) {
            return;
        }
        ActivityCompat.requestPermissions(
            this,
            new String[]{Manifest.permission.POST_NOTIFICATIONS},
            1
        );
    }

    private void enableFullscreen() {
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        );
    }

    @Override
    public void onBackPressed() {
        if (screen == Screen.QUESTION) {
            handleResult(null, true);
        } else if (screen == Screen.CHAT) {
            renderChats(0);
        } else if (screen == Screen.CHATS || screen == Screen.REQUESTS) {
            renderHome();
        } else {
            finish();
        }
    }

    @Override
    protected void onDestroy() {
        if (companionReceiver != null) {
            unregisterReceiver(companionReceiver);
            companionReceiver = null;
        }
        super.onDestroy();
    }
}
