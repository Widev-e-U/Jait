package dev.jait.mobile;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
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
 * app is in the foreground, without requiring a notification tap first. Only usable when the
 * screen is unlocked and "display over other apps" is granted; callers fall back to a plain
 * notification otherwise.
 */
final class AgentOverlayWindow {
    private static WindowManager windowManager;
    private static View currentView;
    private static BroadcastReceiver dismissReceiver;

    private AgentOverlayWindow() {
    }

    static boolean canShow(Context context) {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context);
    }

    static synchronized void show(Context appContext, JSONObject request) {
        String requestId = request.optString("id", "");
        if (requestId.isEmpty()) return;
        dismiss(appContext);

        View card;
        try {
            card = new AgentPromptView(appContext, (result, cancelled) -> {
                AgentQuestionApi.submit(appContext, requestId, result, cancelled);
                dismiss(appContext);
            }).build(request);
        } catch (JSONException error) {
            return;
        }

        float density = appContext.getResources().getDisplayMetrics().density;
        GradientDrawable cardBackground = new GradientDrawable();
        cardBackground.setColor(Color.rgb(8, 16, 29));
        cardBackground.setCornerRadius(density * 20);
        cardBackground.setStroke(Math.round(density), Color.rgb(51, 65, 85));
        card.setBackground(cardBackground);
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
        scrim.setOnClickListener(view -> {
            AgentQuestionApi.submit(appContext, requestId, null, true);
            dismiss(appContext);
        });
        scrim.setOnKeyListener((view, keyCode, event) -> {
            if (keyCode == KeyEvent.KEYCODE_BACK && event.getAction() == KeyEvent.ACTION_UP) {
                AgentQuestionApi.submit(appContext, requestId, null, true);
                dismiss(appContext);
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
        params.dimAmount = 0.55f;
        params.gravity = Gravity.CENTER;

        WindowManager wm = (WindowManager) appContext.getSystemService(Context.WINDOW_SERVICE);
        try {
            wm.addView(scrim, params);
        } catch (Exception error) {
            return;
        }
        windowManager = wm;
        currentView = scrim;

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
    }
}
