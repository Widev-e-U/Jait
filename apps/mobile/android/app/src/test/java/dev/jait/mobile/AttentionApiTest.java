package dev.jait.mobile;

import static org.junit.Assert.*;
import android.app.Notification;
import androidx.core.app.NotificationCompat;
import java.lang.reflect.Method;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
public class AttentionApiTest {
    @Test public void routesBulkApprovalSeparatelyFromSingleApproval() {
        assertEquals("/api/consent/request/approve-all", AttentionApi.consentPath("request", "approve-all"));
        assertEquals("/api/mobile/consent/request/approve", AttentionApi.consentPath("request", "approve"));
        assertEquals("/api/mobile/consent/request/reject", AttentionApi.consentPath("request", "reject"));
        assertEquals("/api/consent/a%2Fb/approve-all", AttentionApi.consentPath("a/b", "approve-all"));
        assertNull(AttentionApi.consentPath("request", "unknown"));
        assertNull(AttentionApi.consentPath("", "approve-all"));
    }

    @Test public void rendersAllThreeDistinctNotificationButtons() throws Exception {
        JaitMessagingService service = Robolectric.buildService(JaitMessagingService.class).get();
        JSONObject item = new JSONObject("{\"kind\":\"consent\",\"actions\":[{\"id\":\"approve\",\"label\":\"Approve\",\"kind\":\"approve\"},{\"id\":\"reject\",\"label\":\"Reject\",\"kind\":\"reject\"},{\"id\":\"approve-all\",\"label\":\"Approve all\",\"kind\":\"approve-all\"}]}");
        NotificationCompat.Builder builder = new NotificationCompat.Builder(RuntimeEnvironment.getApplication(), "test");
        Method method = JaitMessagingService.class.getDeclaredMethod("addAttentionActions", NotificationCompat.Builder.class, JSONObject.class, String.class);
        method.setAccessible(true);
        method.invoke(service, builder, item, "request");
        Notification notification = builder.build();
        assertEquals(3, notification.actions.length);
        assertEquals("Approve", notification.actions[0].title.toString());
        assertEquals("Reject", notification.actions[1].title.toString());
        assertEquals("Approve all", notification.actions[2].title.toString());
        assertNotEquals(notification.actions[0].actionIntent, notification.actions[2].actionIntent);
    }
}
