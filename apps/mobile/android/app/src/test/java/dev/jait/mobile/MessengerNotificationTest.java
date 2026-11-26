package dev.jait.mobile;

import static org.junit.Assert.*;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.graphics.Bitmap;
import android.net.Uri;
import android.provider.OpenableColumns;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.RemoteMessage;
import java.util.List;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class MessengerNotificationTest {
    private static final String ROOM = "matrix-room:!room:test";
    private static final String LINK = "/messenger?roomId=!room%3Atest";
    private static final String SCOPE = "https://gateway.test";
    private Context context;
    private NotificationManager manager;

    @Before public void setup() {
        context = RuntimeEnvironment.getApplication();
        manager = context.getSystemService(NotificationManager.class);
        manager.cancelAll();
        context.getSharedPreferences("jait-chat-completions", 0).edit().clear().commit();
    }

    @Test public void pushLinksTheSenderAvatarToTheConversationShortcut() {
        var service = Robolectric.buildService(JaitMessagingService.class).create();
        try {
            service.get().onMessageReceived(new RemoteMessage.Builder("test")
                .addData("type", "chat.completed").addData("id", "matrix-message:$one")
                .addData("replaceId", ROOM).addData("link", LINK)
                .addData("title", "Thomas").addData("body", "Hello").addData("timestamp", "1234").build());
            String shortcutId = card().getShortcutId();
            assertNotNull(shortcutId);
            ChatNotifications.attachAvatar(context, ROOM, "matrix-message:$one", bitmap());
            Notification notification = card();
            assertEquals(shortcutId, notification.getShortcutId());
            assertNull(notification.getLargeIcon());
            assertNull(notification.getGroup());
            NotificationCompat.MessagingStyle.Message message = messages().get(0);
            assertEquals("Thomas", message.getPerson().getName().toString());
            assertEquals(1234, message.getTimestamp());
            assertNotNull(message.getPerson().getIcon());
            ShortcutInfo shortcut = context.getSystemService(ShortcutManager.class).getDynamicShortcuts().stream()
                .filter(candidate -> shortcutId.equals(candidate.getId())).findFirst().orElseThrow();
            assertEquals(LINK, NotificationNavigation.capture(context, shortcut.getIntent()).optString("link"));
        } finally {
            service.destroy();
        }
    }

    @Test public void aLateImageStaysWithItsUnreadMessageAndKeepsTheCaption() throws Exception {
        show("photo", "Alice", "Evening sky", 1000);
        show("next", "Bob", "Hello", 2000);
        ChatNotifications.attachImage(context, ROOM, "photo", bitmap());
        List<NotificationCompat.MessagingStyle.Message> messages = messages();
        assertEquals(3, messages.size());
        Uri preview = messages.get(0).getDataUri();
        assertNotNull(preview);
        assertEquals("image/jpeg", messages.get(0).getDataMimeType());
        assertEquals("Alice", messages.get(0).getPerson().getName().toString());
        try (var cursor = context.getContentResolver().query(preview, new String[]{OpenableColumns.SIZE}, null, null, null)) {
            assertNotNull(cursor);
            assertTrue(cursor.moveToFirst());
            assertTrue(cursor.getLong(0) > 0);
        }
        assertEquals("Evening sky", messages.get(1).getText().toString());
        assertEquals(messages.get(0).getTimestamp(), messages.get(1).getTimestamp());
        assertEquals("Bob", messages.get(2).getPerson().getName().toString());
        ChatNotifications.attachAvatar(context, ROOM, "next", bitmap());
        assertEquals(preview, messages().get(0).getDataUri());
        ChatNotifications.clear(context, ROOM, "photo");
        ChatNotifications.attachImage(context, ROOM, "photo", bitmap());
        assertEquals(1, messages().size());
        assertEquals("Hello", messages().get(0).getText().toString());
        assertNull(messages().get(0).getDataUri());
    }

    @Test public void lateSenderAvatarsRemainOnTheirMessages() {
        show("first", "Alice", "Hi", 1000);
        show("second", "Bob", "Hello", 2000);
        ChatNotifications.attachAvatar(context, ROOM, "first", bitmap());
        ChatNotifications.attachAvatar(context, ROOM, "second", bitmap());
        assertNotNull(messages().get(0).getPerson().getIcon());
        assertNotNull(messages().get(1).getPerson().getIcon());
        show("third", "Carol", "Hey", 3000);
        assertNotNull(messages().get(0).getPerson().getIcon());
        assertNotNull(messages().get(1).getPerson().getIcon());
        assertNull(messages().get(2).getPerson().getIcon());
    }

    private void show(String id, String sender, String text, long timestamp) {
        ChatNotifications.show(context, id, "Family", sender + ": " + text, ROOM, LINK, SCOPE, "", false,
            null, sender, timestamp);
    }

    private Notification card() {
        return manager.getActiveNotifications()[0].getNotification();
    }

    private List<NotificationCompat.MessagingStyle.Message> messages() {
        NotificationCompat.MessagingStyle style = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(card());
        assertNotNull(style);
        return style.getMessages();
    }

    private static Bitmap bitmap() {
        return Bitmap.createBitmap(8, 8, Bitmap.Config.ARGB_8888);
    }
}
