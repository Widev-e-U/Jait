package dev.jait.mobile;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.PixelFormat;
import android.os.Build;
import android.provider.Settings;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import androidx.core.content.ContextCompat;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Draws the agent-question card as a system overlay so it appears immediately over whatever
 * app is in the foreground, without requiring a notification tap first. Only usable while the
 * display is interactive, the screen is unlocked, and "display over other apps" is granted;
 * callers fall back to a plain notification otherwise.
 */
final class AgentOverlayWindow {
    private static WindowManager windowManager;
    private static View currentView;
    private static String currentRequestId;
    private static BroadcastReceiver dismissReceiver;

    private AgentOverlayWindow() {
    }

    static boolean canShow(Context context) {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context);
    }

    static boolean show(Context appContext, JSONObject request) {
        String requestId = request.optString("id", "");
        return show(appContext, request, (result, cancelled) ->
            AgentQuestionApi.submit(appContext, requestId, result, cancelled)
        );
    }

    static synchronized boolean show(
        Context appContext,
        JSONObject request,
        AgentPromptView.Listener listener
    ) {
        String requestId = request.optString("id", "");
        if (requestId.isEmpty() || !AgentDeviceState.isActive(appContext)) return false;
        if (requestId.equals(currentRequestId) && currentView != null) return true;
        dismiss(appContext);

        AgentPromptView promptView = new AgentPromptView(appContext, (result, cancelled) -> {
            listener.onResult(result, cancelled);
            WearBridge.relayDismiss(appContext, requestId);
            dismiss(appContext);
        });
        View card;
        try {
            card = promptView.build(request);
        } catch (JSONException error) {
            return false;
        }

        card.setBackground(
            ContextCompat.getDrawable(appContext, R.drawable.agent_prompt_card_background)
        );
        // Absorb taps anywhere on the card so they don't fall through to the scrim's
        // tap-outside-to-cancel handler below - only non-interactive children otherwise.
        card.setClickable(true);

        FrameLayout scrim = new FrameLayout(appContext);
        scrim.setFocusableInTouchMode(true);
        int cardWidth = (int) (appContext.getResources().getDisplayMetrics().widthPixels * 0.88);
        FrameLayout.LayoutParams cardParams =
            new FrameLayout.LayoutParams(cardWidth, FrameLayout.LayoutParams.WRAP_CONTENT);
        cardParams.gravity = Gravity.CENTER;
        scrim.addView(card, cardParams);
        scrim.setOnClickListener(view -> promptView.cancel());
        scrim.setOnKeyListener((view, keyCode, event) -> {
            if (keyCode == KeyEvent.KEYCODE_BACK && event.getAction() == KeyEvent.ACTION_UP) {
                promptView.cancel();
                return true;
            }
            return false;
        });

        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;
        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            type,
            WindowManager.LayoutParams.FLAG_DIM_BEHIND,
            PixelFormat.TRANSLUCENT
        );
        params.dimAmount = 0.62f;
        params.gravity = Gravity.CENTER;

        WindowManager wm = (WindowManager) appContext.getSystemService(Context.WINDOW_SERVICE);
        try {
            wm.addView(scrim, params);
        } catch (Exception error) {
            return false;
        }
        windowManager = wm;
        currentView = scrim;
        currentRequestId = requestId;

        ((NotificationManager) appContext.getSystemService(Context.NOTIFICATION_SERVICE))
            .cancel(AgentPromptActivity.notificationId(requestId));

        dismissReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (requestId.equals(intent.getStringExtra(AgentPromptActivity.EXTRA_REQUEST_ID))) {
                    dismiss(appContext);
                }
            }
        };
        ContextCompat.registerReceiver(
            appContext,
            dismissReceiver,
            new IntentFilter(AgentPromptActivity.ACTION_DISMISS),
            ContextCompat.RECEIVER_NOT_EXPORTED
        );
        return true;
    }

    private static synchronized void dismiss(Context context) {
        if (windowManager != null && currentView != null) {
            try {
                windowManager.removeView(currentView);
            } catch (Exception ignored) {
            }
        }
        if (dismissReceiver != null) {
            try {
                context.unregisterReceiver(dismissReceiver);
            } catch (Exception ignored) {
            }
            dismissReceiver = null;
        }
        windowManager = null;
        currentView = null;
        currentRequestId = null;
    }
}
