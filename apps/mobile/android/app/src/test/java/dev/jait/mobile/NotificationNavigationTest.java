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
        assertEquals(2, manager.getActiveNotifications().length);
        for (StatusBarNotification card : manager.getActiveNotifications()) {
            if (card.getTag().equals("chat:alpha")) {
                assertEquals("Second", card.getNotification().extras.getString("android.text"));
            }
        }
    }
    @Test public void visibleChatDoesNotAlertButDifferentChatDoes() {
        NotificationNavigation.resumed = true;
        NotificationNavigation.visibleSession = "alpha";
        show("alpha:1", "alpha", "Visible");
        assertEquals(0, manager.getActiveNotifications().length);
        show("beta:1", "beta", "Other chat");
        assertEquals(1, manager.getActiveNotifications().length);
    }
    private void show(String event, String session, String body) {
        ChatNotifications.show(context, event, "Response ready", body, "chat:" + session,
            "/chat?sessionId=" + session, "https://gateway.test", session, true);
    }
}
