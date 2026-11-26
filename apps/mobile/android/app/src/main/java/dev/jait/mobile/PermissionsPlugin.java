package dev.jait.mobile;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
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
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }),
        @Permission(alias = "calendar", strings = { Manifest.permission.READ_CALENDAR })
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

    @PluginMethod
    public void getDevicePermissions(PluginCall call) {
        Context context = getContext();
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        NotificationManager notifications = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        JSObject result = new JSObject();
        result.put("microphone", getPermissionState("microphone").toString());
        result.put("notifications", notificationState().toString());
        result.put("calendar", getPermissionState("calendar").toString());
        result.put("overlay", Build.VERSION.SDK_INT < Build.VERSION_CODES.M
            ? "not-required" : settingState(Settings.canDrawOverlays(context)));
        result.put("fullScreen", Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE
            ? "not-required" : settingState(notifications.canUseFullScreenIntent()));
        result.put("exactAlarms", Build.VERSION.SDK_INT < Build.VERSION_CODES.S
            ? "not-required" : settingState(alarms.canScheduleExactAlarms()));
        result.put("installUpdates", Build.VERSION.SDK_INT < Build.VERSION_CODES.O
            ? "not-required" : settingState(canInstallUpdates(context)));
        call.resolve(result);
    }

    @PluginMethod
    public void manageDevicePermission(PluginCall call) {
        String name = call.getString("name", "");
        switch (name) {
            case "microphone":
            case "calendar":
            case "notifications":
                PermissionState current = name.equals("notifications") ? notificationState() : getPermissionState(name);
                if (current == PermissionState.PROMPT || current == PermissionState.PROMPT_WITH_RATIONALE) {
                    requestPermissionForAlias(name, call, "devicePermissionResult");
                    return;
                }
                if (name.equals("notifications") && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    openSettings(call, new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName()));
                    return;
                }
                openAppSettings(call);
                return;
            case "overlay":
                openSpecialSettings(call, Build.VERSION_CODES.M, Settings.ACTION_MANAGE_OVERLAY_PERMISSION);
                return;
            case "fullScreen":
                openSpecialSettings(call, Build.VERSION_CODES.UPSIDE_DOWN_CAKE, Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
                return;
            case "exactAlarms":
                openSpecialSettings(call, Build.VERSION_CODES.S, Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
                return;
            case "installUpdates":
                openSpecialSettings(call, Build.VERSION_CODES.O, Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                return;
            default:
                call.reject("Unknown Android permission");
        }
    }

    @PermissionCallback
    private void devicePermissionResult(PluginCall call) {
        call.resolve();
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        openSettings(call, appSettingsIntent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS));
    }

    static boolean canInstallUpdates(Context context) {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context.getPackageManager().canRequestPackageInstalls();
    }

    private PermissionState notificationState() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            PermissionState state = getPermissionState("notifications");
            if (state != PermissionState.GRANTED) return state;
        }
        return NotificationManagerCompat.from(getContext()).areNotificationsEnabled()
            ? PermissionState.GRANTED : PermissionState.DENIED;
    }

    private static String settingState(boolean allowed) {
        return (allowed ? PermissionState.GRANTED : PermissionState.DENIED).toString();
    }

    private void openSpecialSettings(PluginCall call, int minimumVersion, String action) {
        if (Build.VERSION.SDK_INT >= minimumVersion) {
            openSettings(call, appSettingsIntent(action));
        } else {
            call.resolve();
        }
    }

    private Intent appSettingsIntent(String action) {
        return new Intent(action, Uri.fromParts("package", getContext().getPackageName(), null));
    }

    private void openSettings(PluginCall call, Intent intent) {
        try {
            getActivity().startActivity(intent);
        } catch (ActivityNotFoundException | SecurityException error) {
            try {
                getActivity().startActivity(appSettingsIntent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS));
            } catch (ActivityNotFoundException | SecurityException fallbackError) {
                call.reject("Could not open Android settings", fallbackError);
                return;
            }
        }
        call.resolve();
    }

    private JSObject state(String alias) {
        JSObject result = new JSObject();
        result.put("state", getPermissionState(alias).toString());
        return result;
    }
}
