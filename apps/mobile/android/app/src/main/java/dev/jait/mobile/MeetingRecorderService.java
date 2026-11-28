package dev.jait.mobile;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;
import java.io.File;
import java.io.IOException;
import java.util.concurrent.TimeUnit;

/** Owns the recorder while Jait is in the background or the screen is locked. */
public final class MeetingRecorderService extends Service {
    static final String STOP = "dev.jait.mobile.STOP_MEETING";
    static final String CHANNEL = "meeting-recording";
    static final Object LOCK = new Object();
    private static final int NOTIFICATION_ID = 45108;
    private static final int MAX_BYTES = 96 * 1024 * 1024 - 512 * 1024;
    private MediaRecorder recorder;
    private static String activeId;

    static SharedPreferences metadata(Context context) {
        return context.getSharedPreferences("meeting-recording", Context.MODE_PRIVATE);
    }

    static File audioFile(Context context) {
        return new File(context.getFilesDir(), "pending-meeting.m4a");
    }

    static String phase(Context context) {
        synchronized (LOCK) {
            String phase = metadata(context).getString("phase", "idle");
            return "recording".equals(phase) && activeId == null ? "failed" : phase;
        }
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        synchronized (LOCK) {
            if (intent == null || STOP.equals(intent.getAction())) {
                finish(true);
                return START_NOT_STICKY;
            }
            if (recorder != null) return START_NOT_STICKY;
            String id = intent.getStringExtra("id");
            String owner = intent.getStringExtra("owner");
            long now = System.currentTimeMillis();
            SharedPreferences metadata = metadata(this);
            try {
                showRecordingNotification(now);
                metadata.edit().putString("id", id).putString("owner", owner)
                    .putLong("startedAt", now).putString("phase", "recording").commit();
                recorder = Build.VERSION.SDK_INT >= 31 ? new MediaRecorder(this) : new MediaRecorder();
                recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
                recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
                recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
                recorder.setAudioSamplingRate(24000);
                recorder.setAudioChannels(1);
                recorder.setAudioEncodingBitRate(64000);
                recorder.setMaxDuration((int) TimeUnit.HOURS.toMillis(2));
                recorder.setMaxFileSize(MAX_BYTES);
                recorder.setOutputFile(audioFile(this).getAbsolutePath());
                recorder.setOnErrorListener((source, what, extra) -> finish(false));
                recorder.setOnInfoListener((source, what, extra) -> {
                    if (what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED
                        || what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_FILESIZE_REACHED) finish(true);
                });
                recorder.prepare();
                recorder.start();
                activeId = id;
            } catch (IOException | RuntimeException failure) {
                metadata.edit().putString("id", id).putString("owner", owner).putString("phase", "failed").commit();
                finish(false);
            }
            return START_NOT_STICKY;
        }
    }

    private void showRecordingNotification(long now) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26) {
            manager.createNotificationChannel(new NotificationChannel(CHANNEL, "Meeting recording", NotificationManager.IMPORTANCE_LOW));
        }
        PendingIntent stop = PendingIntent.getService(this, NOTIFICATION_ID,
            new Intent(this, MeetingRecorderService.class).setAction(STOP), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent open = PendingIntent.getActivity(this, NOTIFICATION_ID,
            new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        startForeground(NOTIFICATION_ID, new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now).setContentTitle("Recording a meeting")
            .setContentText("Jait is using your microphone").setContentIntent(open)
            .setOngoing(true).setOnlyAlertOnce(true).setWhen(now).setUsesChronometer(true)
            .addAction(android.R.drawable.ic_media_pause, "Stop recording", stop).build());
    }

    private void finish(boolean save) {
        synchronized (LOCK) {
            if (recorder != null) {
                try { recorder.stop(); }
                catch (RuntimeException failure) { save = false; }
                finally { recorder.release(); recorder = null; }
                File file = audioFile(this);
                save = save && file.length() > 0;
                metadata(this).edit().putString("phase", save ? "ready" : "failed").commit();
                if (!save) file.delete();
            }
            activeId = null;
            if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE);
            else stopForeground(true);
            stopSelf();
        }
    }

    @Override
    public void onDestroy() {
        synchronized (LOCK) {
            if (recorder != null) finish(true);
        }
        super.onDestroy();
    }
}
