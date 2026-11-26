package dev.jait.mobile;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import android.app.Notification;
import android.os.Bundle;
import android.service.notification.StatusBarNotification;
import java.util.ArrayList;

/** Shared entry for WebView and FCM alerts. Event dedupe and card replacement are separate. */
final class ChatNotifications {
    private static final String CHANNEL = "jait-chat-completions";
    private static final String GROUP = "jait-chats";
    private static final String SUMMARY_TAG = "jait-chat-summary";
    private static final String IDS = "jait.eventIds";
    private static final String LINES = "jait.lines";
    private static final int MAX_LINES = 10;
    private ChatNotifications() {}

    private static StatusBarNotification card(NotificationManager manager, String cardId) {
        for (StatusBarNotification posted : manager.getActiveNotifications()) {
            if (cardId.equals(posted.getTag()) && posted.getId() == 0) return posted;
        }
        return null;
    }

    private static ArrayList<String> values(Bundle extras, String key) {
        ArrayList<String> values = extras.getStringArrayList(key);
        return values == null ? new ArrayList<>() : new ArrayList<>(values);
    }

    private static void applyContent(Context context, NotificationCompat.Builder builder, ArrayList<String> ids,
                                     ArrayList<String> lines, MessengerNotification conversation, boolean updateShortcut) {
        Bundle extras = new Bundle();
        extras.putStringArrayList(IDS, ids);
        extras.putStringArrayList(LINES, lines);
        extras.putString("jait.eventId", ids.get(ids.size() - 1));
        builder.addExtras(extras).setContentText(lines.get(lines.size() - 1));
        if (conversation != null) {
            conversation.apply(context, builder, ids, lines, updateShortcut);
            return;
        }
        if (lines.size() == 1) {
            builder.setStyle(new NotificationCompat.BigTextStyle().bigText(lines.get(0)));
        } else {
            // InboxStyle rows are single lines that Android ellipsizes. BigTextStyle wraps every message in full.
            StringBuilder text = new StringBuilder();
            for (int i = 0; i < lines.size(); i++) {
                if (i > 0) text.append('\n');
                text.append(lines.get(i));
            }
            builder.setStyle(new NotificationCompat.BigTextStyle().bigText(text)
                .setSummaryText(lines.size() + " messages")).setNumber(lines.size());
        }
    }

    static synchronized void updateSummary(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        int count = 0;
        for (StatusBarNotification posted : manager.getActiveNotifications()) {
            Notification notification = posted.getNotification();
            if (GROUP.equals(notification.getGroup()) && (notification.flags & Notification.FLAG_GROUP_SUMMARY) == 0) count++;
        }
        if (count < 2) {
            manager.cancel(SUMMARY_TAG, 0);
            return;
        }
        Notification summary = new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_jait_notification)
            .setContentTitle("Jait")
            .setContentText(count + " conversations")
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setGroup(GROUP).setGroupSummary(true)
            .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_CHILDREN)
            .build();
        manager.notify(SUMMARY_TAG, 0, summary);
    }

    static synchronized void attachImage(Context context, String cardId, String eventId, android.graphics.Bitmap image) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        StatusBarNotification posted = card(manager, cardId);
        if (posted == null) return;
        ArrayList<String> ids = values(posted.getNotification().extras, IDS);
        ArrayList<String> lines = values(posted.getNotification().extras, LINES);
        if (ids.isEmpty() || ids.size() != lines.size()) return;
        MessengerNotification conversation = MessengerNotification.restore(posted.getNotification());
        if (conversation != null) {
            if (!ids.contains(eventId) || conversation.hasImage(eventId)) return;
            android.net.Uri preview = NotificationPreviewProvider.store(context, image);
            if (preview == null) return;
            conversation.setImage(eventId, preview);
        } else if (!eventId.equals(ids.get(ids.size() - 1))) return;
        NotificationCompat.Builder builder = rebuild(context, posted.getNotification());
        applyContent(context, builder, ids, lines, conversation, false);
        if (conversation == null) {
            builder.setStyle(new NotificationCompat.BigPictureStyle().bigPicture(image)
                .setSummaryText(lines.size() > 1 ? lines.size() + " messages" : lines.get(0)));
        }
        builder.setOnlyAlertOnce(true);
        manager.notify(cardId, 0, builder.build());
    }

    static synchronized void attachAvatar(Context context, String cardId, String eventId, android.graphics.Bitmap avatar) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        StatusBarNotification posted = card(manager, cardId);
        if (posted == null) return;
        ArrayList<String> ids = values(posted.getNotification().extras, IDS);
        ArrayList<String> lines = values(posted.getNotification().extras, LINES);
        if (ids.isEmpty() || ids.size() != lines.size() || !ids.contains(eventId)) return;
        NotificationCompat.Builder builder = rebuild(context, posted.getNotification());
        MessengerNotification conversation = MessengerNotification.restore(posted.getNotification());
        if (conversation == null && !eventId.equals(ids.get(ids.size() - 1))) return;
        if (conversation != null) conversation.setAvatar(eventId, avatar);
        applyContent(context, builder, ids, lines, conversation, true);
        if (conversation == null) {
            android.os.Parcelable picture = posted.getNotification().extras.getParcelable(Notification.EXTRA_PICTURE);
            if (picture instanceof android.graphics.Bitmap) builder.setStyle(new NotificationCompat.BigPictureStyle().bigPicture((android.graphics.Bitmap) picture)
                .setSummaryText(lines.size() > 1 ? lines.size() + " messages" : lines.get(0)));
            builder.setLargeIcon(avatar);
        }
        builder.setOnlyAlertOnce(true);
        manager.notify(cardId, 0, builder.build());
    }

    static synchronized void cancel(Context context, String cardId) {
        context.getSystemService(NotificationManager.class).cancel(cardId, 0);
        updateSummary(context);
    }

    private static NotificationCompat.Builder rebuild(Context context, Notification notification) {
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_jait_notification)
            .setContentTitle(notification.extras.getCharSequence(Notification.EXTRA_TITLE))
            .setContentIntent(notification.contentIntent)
            .setDeleteIntent(notification.deleteIntent)
            .setAutoCancel(true).setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE).setGroup(GROUP)
            .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_CHILDREN);
        android.graphics.drawable.Icon icon = notification.getLargeIcon();
        if (icon != null) {
            android.graphics.drawable.Drawable drawable = icon.loadDrawable(context);
            if (drawable instanceof android.graphics.drawable.BitmapDrawable) {
                builder.setLargeIcon(((android.graphics.drawable.BitmapDrawable) drawable).getBitmap());
            }
        }
        for (int i = 0; i < NotificationCompat.getActionCount(notification); i++) {
            builder.addAction(NotificationCompat.getAction(notification, i));
        }
        return builder;
    }

    static synchronized void clear(Context context, String cardId, String eventId) {
        if (cardId == null || cardId.isEmpty() || eventId == null || eventId.isEmpty()) return;
        // A late FCM completion must not resurrect an event already read elsewhere.
        context.getSharedPreferences(CHANNEL, Context.MODE_PRIVATE).edit()
            .putLong(eventId, System.currentTimeMillis()).apply();
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        StatusBarNotification posted = card(manager, cardId);
        if (posted != null) {
            ArrayList<String> ids = values(posted.getNotification().extras, IDS);
            ArrayList<String> lines = values(posted.getNotification().extras, LINES);
            int index = ids.indexOf(eventId);
            if (index >= 0 && index < lines.size()) {
                boolean removedLatest = index == ids.size() - 1;
                ids.remove(index);
                lines.remove(index);
                if (ids.isEmpty()) manager.cancel(cardId, 0);
                else {
                    NotificationCompat.Builder builder = rebuild(context, posted.getNotification());
                    if (removedLatest) builder.setLargeIcon((android.graphics.Bitmap) null);
                    MessengerNotification conversation = MessengerNotification.restore(posted.getNotification());
                    if (conversation != null) conversation.remove(eventId);
                    applyContent(context, builder, ids, lines, conversation, removedLatest);
                    builder.setOnlyAlertOnce(true);
                    manager.notify(cardId, 0, builder.build());
                }
            } else if (ids.isEmpty() && eventId.equals(posted.getNotification().extras.getString("jait.eventId"))) {
                manager.cancel(cardId, 0);
            }
        }
        updateSummary(context);
        PhoneWearListenerService.pushSnapshot(context);
    }

    static void show(Context context, String id, String title, String body) {
        show(context, id, title, body, id, "/chat", NotificationNavigation.scope(context), "", false);
    }

    static void show(Context context, String id, String title, String body, String replaceId,
                     String link, String scope, String sessionId, boolean completion) {
        show(context, id, title, body, replaceId, link, scope, sessionId, completion, null);
    }

    static void show(Context context, String id, String title, String body, String replaceId,
                     String link, String scope, String sessionId, boolean completion, String markReadLink) {
        show(context, id, title, body, replaceId, link, scope, sessionId, completion, markReadLink, null, 0);
    }

    static synchronized void show(Context context, String id, String title, String body, String replaceId,
                     String link, String scope, String sessionId, boolean completion, String markReadLink,
                     String groupSender, long timestamp) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        NotificationChannel channel = new NotificationChannel(CHANNEL, "Chat completions", NotificationManager.IMPORTANCE_HIGH);
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return;
        String cardId = replaceId == null || replaceId.isEmpty() ? id : replaceId;
        android.content.SharedPreferences prefs = context.getSharedPreferences(CHANNEL, Context.MODE_PRIVATE);
        synchronized (ChatNotifications.class) {
            long now = System.currentTimeMillis();
            // Remember multiple recent events so interleaved chats and delayed FCM deliveries dedupe too.
            if (prefs.contains(id)) return;
            android.content.SharedPreferences.Editor edit = prefs.edit();
            for (java.util.Map.Entry<String, ?> entry : prefs.getAll().entrySet()) {
                if (!(entry.getValue() instanceof Long) || now - (Long) entry.getValue() > 3_600_000L) edit.remove(entry.getKey());
            }
            edit.putLong(id, now).apply();
        }
        if (completion && NotificationNavigation.resumed && !sessionId.isEmpty()
            && sessionId.equals(NotificationNavigation.visibleSession)) {
            cancel(context, cardId);
            return;
        }
        StatusBarNotification previous = card(manager, cardId);
        Notification previousNotification = previous == null ? null : previous.getNotification();
        MessengerNotification conversation = MessengerNotification.isMessage(cardId, link)
            ? MessengerNotification.start(previousNotification, cardId, link, scope, title) : null;
        ArrayList<String> ids = previousNotification == null ? new ArrayList<>() : values(previousNotification.extras, IDS);
        ArrayList<String> lines = previousNotification == null ? new ArrayList<>() : values(previousNotification.extras, LINES);
        // Legacy notifications have no history. Start a fresh bounded list in that case.
        if (ids.size() != lines.size()) { ids.clear(); lines.clear(); }
        ids.add(id);
        lines.add(body == null ? "" : body);
        if (conversation != null) conversation.append(id, groupSender, timestamp);
        while (ids.size() > MAX_LINES) {
            String expired = ids.remove(0);
            lines.remove(0);
            if (conversation != null) conversation.remove(expired);
        }
        Intent intent = NotificationNavigation.intent(context, cardId, link, scope);
        PendingIntent open = PendingIntent.getActivity(context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_jait_notification)
            .setContentTitle(title).setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setContentIntent(open).setAutoCancel(true)
            .setGroup(GROUP)
            .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_CHILDREN)
            .addAction(R.drawable.ic_jait_notification, "Open chat", open)
            .setLocalOnly(false);
        if (markReadLink != null && markReadLink.startsWith("/messenger?") && !markReadLink.contains("\\")) {
            Intent readIntent = NotificationNavigation.intent(context, cardId, markReadLink, scope);
            readIntent.setData(android.net.Uri.parse("jait-notification://mark-read/" + android.net.Uri.encode(cardId)));
            PendingIntent read = PendingIntent.getActivity(context, 0, readIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            builder.addAction(R.drawable.ic_jait_notification, "Mark as read", read);
        }
        Intent dismissed = new Intent(context, ChatNotificationDismissReceiver.class);
        dismissed.setData(android.net.Uri.parse("jait-notification://dismiss/" + android.net.Uri.encode(cardId)));
        builder.setDeleteIntent(PendingIntent.getBroadcast(context, 0, dismissed,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        applyContent(context, builder, ids, lines, conversation, true);
        manager.notify(cardId, 0, builder.build());
        updateSummary(context);
        PhoneWearListenerService.pushSnapshot(context);
    }
}
