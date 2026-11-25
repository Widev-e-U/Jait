package dev.jait.mobile;

import android.app.Notification;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;
import androidx.core.content.pm.ShortcutInfoCompat;
import androidx.core.content.pm.ShortcutManagerCompat;
import androidx.core.graphics.drawable.IconCompat;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

/** Messenger metadata for the unread events retained by ChatNotifications. */
final class MessengerNotification {
    private static final String EXTRA = "jait.messenger";
    private final Bundle state;
    private final Bundle events;

    private MessengerNotification(Bundle state) {
        this.state = new Bundle(state);
        Bundle savedEvents = state.getBundle("events");
        events = savedEvents == null ? new Bundle() : new Bundle(savedEvents);
        this.state.putBundle("events", events);
    }

    static boolean isMessage(String cardId, String link) {
        return cardId.startsWith("matrix-room:") && link != null && link.startsWith("/messenger?") && !link.contains("\\");
    }

    static MessengerNotification restore(Notification notification) {
        Bundle state = notification.extras.getBundle(EXTRA);
        return state == null ? null : new MessengerNotification(state);
    }

    static MessengerNotification start(Notification previous, String cardId, String link, String scope, String title) {
        MessengerNotification conversation = previous == null ? null : restore(previous);
        if (conversation == null || !link.equals(conversation.state.getString("link"))
            || !normalizeScope(scope).equals(conversation.state.getString("scope"))) {
            conversation = new MessengerNotification(new Bundle());
            conversation.state.putString("cardId", cardId);
            conversation.state.putString("link", link);
            conversation.state.putString("scope", normalizeScope(scope));
        }
        conversation.state.putString("title", title == null || title.trim().isEmpty() ? "Messenger" : title);
        return conversation;
    }

    private static String normalizeScope(String scope) {
        return scope == null ? "" : scope.replaceAll("/+$", "");
    }

    void append(String id, String groupSender, long timestamp) {
        Bundle event = new Bundle();
        if (groupSender != null && !groupSender.isEmpty()) {
            event.putString("sender", groupSender);
            state.putBoolean("group", true);
        }
        event.putLong("time", timestamp > 0 ? timestamp : System.currentTimeMillis());
        events.putBundle(id, event);
        if (state.getBoolean("group")) state.remove("avatar");
    }

    void remove(String id) {
        events.remove(id);
        if (state.getBoolean("group") && id.equals(state.getString("avatarEvent"))) state.remove("avatar");
    }

    void setAvatar(String eventId, Bitmap bitmap) {
        int largest = Math.max(bitmap.getWidth(), bitmap.getHeight());
        if (largest > 128) {
            bitmap = Bitmap.createScaledBitmap(bitmap, Math.max(1, bitmap.getWidth() * 128 / largest),
                Math.max(1, bitmap.getHeight() * 128 / largest), true);
        }
        state.putParcelable("avatar", bitmap);
        state.putString("avatarEvent", eventId);
    }

    boolean hasImage(String eventId) {
        Bundle event = events.getBundle(eventId);
        return event != null && event.containsKey("image");
    }

    void setImage(String eventId, Uri uri) {
        Bundle event = events.getBundle(eventId);
        Bundle updated = event == null ? new Bundle() : new Bundle(event);
        updated.putParcelable("image", uri);
        events.putBundle(eventId, updated);
    }

    void apply(Context context, NotificationCompat.Builder builder, List<String> ids, List<String> lines,
               boolean updateShortcut) {
        String title = state.getString("title", "Messenger");
        boolean group = state.getBoolean("group");
        Bitmap avatar = state.getParcelable("avatar");
        IconCompat conversationIcon = IconCompat.createWithBitmap(
            avatar == null ? NotificationAvatar.fallback(title) : avatar);
        Person peer = new Person.Builder().setName(title).setIcon(conversationIcon).build();
        NotificationCompat.MessagingStyle style = new NotificationCompat.MessagingStyle(
            new Person.Builder().setName("You").build());
        if (group) style.setConversationTitle(title);
        style.setGroupConversation(group);
        String latestId = ids.get(ids.size() - 1);
        Person latestSender = peer;
        for (int i = 0; i < ids.size(); i++) {
            String id = ids.get(i);
            Bundle event = events.getBundle(id);
            String sender = event == null ? null : event.getString("sender");
            Person person = peer;
            String text = lines.get(i);
            if (group && sender != null) {
                Person.Builder personBuilder = new Person.Builder().setName(sender);
                if (avatar != null && id.equals(state.getString("avatarEvent"))) {
                    personBuilder.setIcon(IconCompat.createWithBitmap(avatar));
                }
                person = personBuilder.build();
                String prefix = sender + ": ";
                if (text.startsWith(prefix)) text = text.substring(prefix.length());
            }
            if (id.equals(latestId)) latestSender = person;
            long timestamp = event == null ? 0 : event.getLong("time");
            Uri image = event == null ? null : event.getParcelable("image");
            if (image != null) {
                style.addMessage(new NotificationCompat.MessagingStyle.Message("Photo", timestamp, person)
                    .setData("image/jpeg", image));
            }
            if (image == null || (!text.isEmpty() && !"Photo".equals(text))) style.addMessage(text, timestamp, person);
        }
        builder.setStyle(style).setLargeIcon((Bitmap) null)
            .setGroup(null).setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_ALL);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            String cardId = state.getString("cardId");
            String scope = state.getString("scope");
            String shortcutId = "messenger-" + UUID.nameUUIDFromBytes((scope + "\n" + cardId).getBytes(StandardCharsets.UTF_8));
            if (updateShortcut || !state.getBoolean("shortcutPublished")) {
                Intent intent = NotificationNavigation.intent(context, cardId, state.getString("link"), scope)
                    .setAction(Intent.ACTION_VIEW);
                ShortcutInfoCompat shortcut = new ShortcutInfoCompat.Builder(context, shortcutId)
                    .setShortLabel(title).setIcon(conversationIcon).setLongLived(true)
                    .setPerson(latestSender).setIntent(intent).build();
                try {
                    state.putBoolean("shortcutPublished", ShortcutManagerCompat.pushDynamicShortcut(context, shortcut));
                } catch (IllegalStateException | SecurityException ignored) {
                    state.putBoolean("shortcutPublished", false);
                }
            }
            if (state.getBoolean("shortcutPublished")) builder.setShortcutId(shortcutId);
        }
        Bundle extras = new Bundle();
        extras.putBundle(EXTRA, state);
        builder.addExtras(extras);
    }
}
