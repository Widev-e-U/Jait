package dev.jait.mobile;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.net.Uri;
import android.util.Base64;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.IOException;
import java.io.RandomAccessFile;

@CapacitorPlugin(name = "MeetingRecorder", permissions = {
    @Permission(alias = "microphone", strings = {Manifest.permission.RECORD_AUDIO}),
    @Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS})
})
public final class MeetingRecorderPlugin extends Plugin {
    private static final int CHUNK_SIZE = 512 * 1024;

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "microphoneResult");
        } else microphoneResult(call);
    }

    @PermissionCallback
    private void microphoneResult(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            call.reject("Allow microphone access to record a meeting.");
        } else if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notificationResult");
        } else notificationResult(call);
    }

    @PermissionCallback
    private void notificationResult(PluginCall call) {
        Context context = getContext();
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) {
            call.reject("Enable Jait notifications to keep the recording controls visible in the background.");
            return;
        }
        String id = call.getString("id", "");
        String owner = call.getString("owner", "");
        if (!id.matches("[0-9a-f-]{36}") || owner.isEmpty() || owner.length() > 1500) {
            call.reject("Invalid meeting recording.");
            return;
        }
        synchronized (MeetingRecorderService.LOCK) {
            String phase = MeetingRecorderService.phase(context);
            if ("recording".equals(phase) || "ready".equals(phase)) {
                call.reject("Another meeting recording is still on this device.");
                return;
            }
            try {
                ContextCompat.startForegroundService(context, new Intent(context, MeetingRecorderService.class)
                    .putExtra("id", id).putExtra("owner", owner));
                call.resolve();
            } catch (RuntimeException failure) { call.reject("Could not start microphone recording."); }
        }
    }

    private boolean owns(PluginCall call) {
        String owner = call.getString("owner", "");
        return !owner.isEmpty() && owner.equals(MeetingRecorderService.metadata(getContext()).getString("owner", ""));
    }

    @PluginMethod
    public void state(PluginCall call) {
        synchronized (MeetingRecorderService.LOCK) {
            Context context = getContext();
            String phase = owns(call) ? MeetingRecorderService.phase(context) : "idle";
            SharedPreferences metadata = MeetingRecorderService.metadata(context);
            JSObject result = new JSObject();
            result.put("phase", phase);
            if (!"idle".equals(phase)) {
                result.put("startedAt", metadata.getLong("startedAt", 0));
                result.put("id", metadata.getString("id", ""));
                result.put("size", MeetingRecorderService.audioFile(context).length());
            }
            call.resolve(result);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        synchronized (MeetingRecorderService.LOCK) {
            Context context = getContext();
            if (owns(call) && "recording".equals(MeetingRecorderService.phase(context))) {
                context.startService(new Intent(context, MeetingRecorderService.class).setAction(MeetingRecorderService.STOP));
            }
            call.resolve();
        }
    }

    @PluginMethod
    public void read(PluginCall call) {
        synchronized (MeetingRecorderService.LOCK) {
            int offset = call.getInt("offset", -1);
            int length = call.getInt("length", 0);
            if (!owns(call) || !"ready".equals(MeetingRecorderService.phase(getContext()))
                || offset < 0 || length <= 0 || length > CHUNK_SIZE) {
                call.reject("Recording is unavailable.");
                return;
            }
            try (RandomAccessFile file = new RandomAccessFile(MeetingRecorderService.audioFile(getContext()), "r")) {
                byte[] audio = new byte[length];
                file.seek(offset);
                file.readFully(audio);
                JSObject result = new JSObject();
                result.put("audio", Base64.encodeToString(audio, Base64.NO_WRAP));
                call.resolve(result);
            } catch (IOException failure) { call.reject("Could not read recorded audio."); }
        }
    }

    @PluginMethod
    public void openNote(PluginCall call) {
        Uri note = Uri.parse(call.getString("url", ""));
        if (!"obsidian".equals(note.getScheme()) || !"open".equals(note.getHost())) {
            call.reject("Invalid Obsidian note link.");
            return;
        }
        try {
            getContext().startActivity(new Intent(Intent.ACTION_VIEW, note).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            call.resolve();
        } catch (RuntimeException failure) { call.reject("Obsidian could not open this note on this device."); }
    }

    @PluginMethod
    public void discard(PluginCall call) {
        synchronized (MeetingRecorderService.LOCK) {
            Context context = getContext();
            if (owns(call) && !"recording".equals(MeetingRecorderService.phase(context))) {
                java.io.File file = MeetingRecorderService.audioFile(context);
                if (file.exists() && !file.delete()) { call.reject("Could not remove the recording."); return; }
                MeetingRecorderService.metadata(context).edit().clear().commit();
            }
            call.resolve();
        }
    }
}
