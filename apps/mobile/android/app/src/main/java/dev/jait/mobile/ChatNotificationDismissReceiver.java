package dev.jait.mobile;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Keep the group summary in sync when Android dismisses an individual card. */
public final class ChatNotificationDismissReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        ChatNotifications.updateSummary(context);
    }
}
