package dev.jait.mobile;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/** Shared native entry for WebView and background push completion alerts. */
final class ChatNotifications {
    private static final String CHANNEL = "jait-chat-completions";
    private ChatNotifications() {}

    static void show(Context context, String id, String title, String body) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        NotificationChannel channel = new NotificationChannel(CHANNEL, "Chat completions",
            NotificationManager.IMPORTANCE_HIGH);
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return;
        // A short persisted dedupe window covers push and WebView racing, and service restarts.
        android.content.SharedPreferences prefs = context.getSharedPreferences(CHANNEL, Context.MODE_PRIVATE);
        synchronized (ChatNotifications.class) {
            long now = System.currentTimeMillis();
            if (id.equals(prefs.getString("lastId", "")) && now - prefs.getLong("lastAt", 0) < 60_000) return;
            prefs.edit().putString("lastId", id).putLong("lastAt", now).apply();
        }
        Intent intent = new Intent(context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent open = PendingIntent.getActivity(context, id.hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        manager.notify(id, 0, new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_jait_notification)
            .setContentTitle(title).setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setContentIntent(open).setAutoCancel(true).setOnlyAlertOnce(true)
            // Standard Android bridging also reaches watches without the companion installed.
            .setLocalOnly(false).build());
        PhoneWearListenerService.pushSnapshot(context);
    }
}
