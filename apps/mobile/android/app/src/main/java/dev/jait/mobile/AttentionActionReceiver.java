package dev.jait.mobile;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import androidx.core.app.RemoteInput;

/**
 * Handles taps on an attention notification's action buttons — approve, reject, an option, or an
 * inline reply — so the user never has to open the app to unblock an agent.
 *
 * The notification is torn down locally straight away rather than waiting for the gateway's
 * `attention.cleared` round trip, so the card does not linger while the request is in flight.
 */
public class AttentionActionReceiver extends BroadcastReceiver {
    public static final String ACTION_RESOLVE = "dev.jait.mobile.ATTENTION_RESOLVE";
    public static final String EXTRA_KIND = "kind";
    public static final String EXTRA_REQUEST_ID = "requestId";
    public static final String EXTRA_ACTION_KIND = "actionKind";
    public static final String EXTRA_ACTION_ID = "actionId";
    /** Key the notification's RemoteInput writes the typed reply under. */
    public static final String KEY_REPLY = "attentionReply";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!ACTION_RESOLVE.equals(intent.getAction())) return;
        String requestId = intent.getStringExtra(EXTRA_REQUEST_ID);
        if (requestId == null || requestId.isEmpty()) return;

        Bundle remoteInput = RemoteInput.getResultsFromIntent(intent);
        CharSequence reply = remoteInput == null ? null : remoteInput.getCharSequence(KEY_REPLY);

        AttentionApi.resolve(
            context,
            intent.getStringExtra(EXTRA_KIND),
            requestId,
            intent.getStringExtra(EXTRA_ACTION_KIND),
            intent.getStringExtra(EXTRA_ACTION_ID),
            reply == null ? null : reply.toString()
        );

        ((NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE))
            .cancel(AgentPromptActivity.notificationId(requestId));
        WearBridge.relayDismiss(context, requestId);

        Intent dismissIntent = new Intent(AgentPromptActivity.ACTION_DISMISS);
        dismissIntent.setPackage(context.getPackageName());
        dismissIntent.putExtra(AgentPromptActivity.EXTRA_REQUEST_ID, requestId);
        context.sendBroadcast(dismissIntent);
    }
}
