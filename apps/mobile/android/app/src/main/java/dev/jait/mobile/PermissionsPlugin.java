package dev.jait.mobile;

import android.Manifest;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Requests Android runtime ("dangerous") permissions on demand.
 *
 * Declaring a permission in AndroidManifest.xml is NOT enough to show the
 * system dialog on Android 6.0+ (API 23+). The app must actively call
 * requestPermissions() while running. This plugin is the bridge that lets the
 * JS layer trigger those requests and learn the resulting state.
 */
@CapacitorPlugin(
    name = "Permissions",
    permissions = {
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }),
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class PermissionsPlugin extends Plugin {

    @PluginMethod
    public void requestMicrophone(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "microphoneResult");
        } else {
            call.resolve(state("microphone"));
        }
    }

    @PermissionCallback
    private void microphoneResult(PluginCall call) {
        call.resolve(state("microphone"));
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notificationsResult");
        } else {
            call.resolve(state("notifications"));
        }
    }

    @PermissionCallback
    private void notificationsResult(PluginCall call) {
        call.resolve(state("notifications"));
    }

    private JSObject state(String alias) {
        JSObject result = new JSObject();
        result.put("state", getPermissionState(alias).toString());
        return result;
    }
}
