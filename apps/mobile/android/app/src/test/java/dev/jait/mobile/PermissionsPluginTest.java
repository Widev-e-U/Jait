package dev.jait.mobile;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import java.util.Arrays;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
public class PermissionsPluginTest {
    @Test public void manifestDeclaresBothPermissionsRequiredByCapacitorAudioCapture() throws Exception {
        Context context = RuntimeEnvironment.getApplication();
        PackageInfo app = context.getPackageManager().getPackageInfo(context.getPackageName(), PackageManager.GET_PERMISSIONS);
        assertTrue(Arrays.asList(app.requestedPermissions).contains(Manifest.permission.RECORD_AUDIO));
        assertTrue(Arrays.asList(app.requestedPermissions).contains(Manifest.permission.MODIFY_AUDIO_SETTINGS));
    }

    @Test public void updateAccessFollowsTheCurrentAndroidGrant() {
        Context context = RuntimeEnvironment.getApplication();
        shadowOf(context.getPackageManager()).setCanRequestPackageInstalls(false);
        assertFalse(PermissionsPlugin.canInstallUpdates(context));
        shadowOf(context.getPackageManager()).setCanRequestPackageInstalls(true);
        assertTrue(PermissionsPlugin.canInstallUpdates(context));
    }
}
