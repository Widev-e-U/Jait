package dev.jait.mobile;

import android.app.KeyguardManager;
import android.content.Context;
import android.os.PowerManager;

final class AgentDeviceState {
    static final class Snapshot {
        final boolean interactive;
        final boolean locked;

        Snapshot(boolean interactive, boolean locked) {
            this.interactive = interactive;
            this.locked = locked;
        }

        boolean isActive() {
            return interactive && !locked;
        }
    }

    private AgentDeviceState() {
    }

    static Snapshot read(Context context) {
        PowerManager powerManager =
            (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        KeyguardManager keyguardManager =
            (KeyguardManager) context.getSystemService(Context.KEYGUARD_SERVICE);
        boolean interactive = powerManager != null && powerManager.isInteractive();
        boolean locked = keyguardManager != null && keyguardManager.isKeyguardLocked();
        return new Snapshot(interactive, locked);
    }

    static boolean isActive(Context context) {
        return read(context).isActive();
    }
}
