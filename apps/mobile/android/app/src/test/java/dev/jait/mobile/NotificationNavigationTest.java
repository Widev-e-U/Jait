package dev.jait.mobile;

import static org.junit.Assert.*;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.service.notification.StatusBarNotification;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
public class NotificationNavigationTest {
    private Context context;
    private NotificationManager manager;
    @Before public void setup() {
        context = RuntimeEnvironment.getApplication();
        manager = context.getSystemService(NotificationManager.class);
        manager.cancelAll();
        context.getSharedPreferences("jait-chat-completions", 0).edit().clear().commit();
        context.getSharedPreferences("jait-notification-navigation", 0).edit().clear().commit();
        NotificationNavigation.resumed = false;
        NotificationNavigation.visibleSession = "";
    }
    @Test public void tapSurvivesStartupAndOnlyMatchingAcknowledgementClearsIt() {
        Intent intent = NotificationNavigation.intent(context, "chat:alpha", "/chat?sessionId=alpha", "https://gateway.test");
        assertNotNull(NotificationNavigation.capture(context, intent));
        assertNull(NotificationNavigation.capture(context, intent));
        assertEquals("/chat?sessionId=alpha", NotificationNavigation.pending(context).optString("link"));
        NotificationNavigation.acknowledge(context, "chat:beta");
        assertNotNull(NotificationNavigation.pending(context));
        NotificationNavigation.acknowledge(context, "chat:alpha");
        assertNull(NotificationNavigation.pending(context));
    }
    @Test public void differentCardsHaveDifferentPendingIntentIdentities() {
        Intent a = NotificationNavigation.intent(context, "chat:alpha", "/chat?sessionId=alpha", "");
        Intent b = NotificationNavigation.intent(context, "chat:beta", "/chat?sessionId=beta", "");
        assertFalse(a.filterEquals(b));
    }
    @Test public void duplicateDeliveryDoesNotOverwriteNewerTurnAndCardsReplacePerChat() {
        show("alpha:1", "alpha", "First");
        show("beta:1", "beta", "Other chat");
        show("alpha:2", "alpha", "Second");
        show("alpha:1", "alpha", "Delayed duplicate");
        assertEquals(3, manager.getActiveNotifications().length); // Two conversations and their summary.
        for (StatusBarNotification card : manager.getActiveNotifications()) {
            if ("chat:alpha".equals(card.getTag())) {
                assertEquals("Second", card.getNotification().extras.getString("android.text"));
                assertEquals(java.util.Arrays.asList("First", "Second"),
                    card.getNotification().extras.getStringArrayList("jait.lines"));
            }
        }
    }
    @Test public void avatarIsAttachedOnlyToTheLatestEventAndSurvivesRebuild() {
        show("alpha:1", "alpha", "First");
        show("alpha:2", "alpha", "Second");
        android.graphics.Bitmap avatar = android.graphics.Bitmap.createBitmap(2, 2, android.graphics.Bitmap.Config.ARGB_8888);
        ChatNotifications.attachAvatar(context, "chat:alpha", "alpha:1", avatar);
        assertNull(manager.getActiveNotifications()[0].getNotification().getLargeIcon());
        ChatNotifications.attachAvatar(context, "chat:alpha", "alpha:2", avatar);
        assertNotNull(manager.getActiveNotifications()[0].getNotification().getLargeIcon());
        ChatNotifications.clear(context, "chat:alpha", "alpha:1");
        assertNotNull(manager.getActiveNotifications()[0].getNotification().getLargeIcon());
    }
    @Test public void avatarRejectsExternalAndInvalidData() {
        assertNull(NotificationAvatar.decode("https://example.com/avatar.png"));
        assertNull(NotificationAvatar.decode("data:image/svg+xml;base64,PHN2Zz4="));
        assertNull(NotificationAvatar.decode("data:image/png;base64,"));
    }
    @Test public void visibleChatDoesNotAlertButDifferentChatDoes() {
        NotificationNavigation.resumed = true;
        NotificationNavigation.visibleSession = "alpha";
        show("alpha:1", "alpha", "Visible");
        assertEquals(0, manager.getActiveNotifications().length);
        show("beta:1", "beta", "Other chat");
        assertEquals(1, manager.getActiveNotifications().length);
    }
    @Test public void readRevokesOnlyTheExactCardAndDelayedDeliveryCannotResurrectIt() {
        show("alpha:1", "alpha", "First");
        show("beta:1", "beta", "Other chat");
        ChatNotifications.clear(context, "chat:alpha", "alpha:1");
        assertEquals(1, manager.getActiveNotifications().length);
        assertEquals("chat:beta", manager.getActiveNotifications()[0].getTag());
        show("alpha:1", "alpha", "Late push");
        assertEquals(1, manager.getActiveNotifications().length);
        show("alpha:2", "alpha", "New reply");
        ChatNotifications.clear(context, "chat:alpha", "alpha:1");
        assertEquals(3, manager.getActiveNotifications().length);
    }
    @Test public void readBeforeCompletionPushSuppressesItsFirstDelivery() {
        ChatNotifications.clear(context, "chat:alpha", "alpha:1");
        show("alpha:1", "alpha", "Delayed first delivery");
        assertEquals(0, manager.getActiveNotifications().length);
        show("alpha:2", "alpha", "New reply");
        assertEquals(1, manager.getActiveNotifications().length);
    }
    @Test public void backgroundPushUsesTheSameExactEventRevocation() {
        show("alpha:1", "alpha", "Ready");
        org.robolectric.android.controller.ServiceController<JaitMessagingService> controller =
            org.robolectric.Robolectric.buildService(JaitMessagingService.class).create();
        try {
            controller.get().onMessageReceived(new com.google.firebase.messaging.RemoteMessage.Builder("test")
                .addData("type", "chat.notification-read").addData("id", "alpha:1")
                .addData("replaceId", "chat:alpha").build());
            assertEquals(0, manager.getActiveNotifications().length);
            show("alpha:1", "alpha", "Late completion");
            assertEquals(0, manager.getActiveNotifications().length);
        } finally { controller.destroy(); }
    }
    @Test public void readingOneEventKeepsOtherUnreadLinesAndDismissalRemovesSummary() {
        show("alpha:1", "alpha", "First");
        show("alpha:2", "alpha", "Second");
        show("beta:1", "beta", "Other");
        ChatNotifications.clear(context, "chat:alpha", "alpha:1");
        StatusBarNotification alpha = null;
        for (StatusBarNotification card : manager.getActiveNotifications())
            if ("chat:alpha".equals(card.getTag())) alpha = card;
        assertNotNull(alpha);
        assertEquals(java.util.Arrays.asList("Second"), alpha.getNotification().extras.getStringArrayList("jait.lines"));
        ChatNotifications.cancel(context, "chat:beta");
        assertEquals(1, manager.getActiveNotifications().length);
        ChatNotifications.clear(context, "chat:alpha", "alpha:2");
        assertEquals(0, manager.getActiveNotifications().length);
    }
    @Test public void imagePreviewOnlyUpdatesTheCurrentUnreadEvent() {
        show("alpha:1", "alpha", "Photo");
        android.graphics.Bitmap bitmap = android.graphics.Bitmap.createBitmap(2, 2, android.graphics.Bitmap.Config.ARGB_8888);
        ChatNotifications.attachImage(context, "chat:alpha", "alpha:1", bitmap);
        assertNotNull(manager.getActiveNotifications()[0].getNotification().extras.getParcelable("android.picture"));
        show("alpha:2", "alpha", "Newer");
        ChatNotifications.attachImage(context, "chat:alpha", "alpha:1", bitmap);
        assertNull(manager.getActiveNotifications()[0].getNotification().extras.getParcelable("android.picture"));
        ChatNotifications.cancel(context, "chat:alpha");
        ChatNotifications.attachImage(context, "chat:alpha", "alpha:2", bitmap);
        assertEquals(0, manager.getActiveNotifications().length);
    }
    @Test public void stackedCardWrapsEveryMessageInsteadOfEllipsizingInboxRows() {
        show("alpha:1", "alpha", "First");
        show("alpha:2", "alpha", "Second");
        StatusBarNotification alpha = null;
        for (StatusBarNotification card : manager.getActiveNotifications())
            if ("chat:alpha".equals(card.getTag())) alpha = card;
        assertNotNull(alpha);
        assertNull(alpha.getNotification().extras.getCharSequenceArray("android.textLines"));
        assertEquals("First\nSecond", alpha.getNotification().extras.getCharSequence("android.bigText").toString());
    }
    private void show(String event, String session, String body) {
        ChatNotifications.show(context, event, "Response ready", body, "chat:" + session,
            "/chat?sessionId=" + session, "https://gateway.test", session, true);
    }
}
