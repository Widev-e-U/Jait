package dev.jait.mobile;

final class AgentQuestionPresentation {
    enum Mode {
        SYSTEM_OVERLAY,
        FULL_SCREEN_ACTIVITY
    }

    private AgentQuestionPresentation() {
    }

    static boolean shouldUseSystemOverlay(boolean overlayAvailable) {
        return overlayAvailable;
    }

    static Mode modeFor(boolean screenLocked, boolean overlayAvailable) {
        if (!screenLocked && overlayAvailable) return Mode.SYSTEM_OVERLAY;
        return Mode.FULL_SCREEN_ACTIVITY;
    }

    static String subtitleFor(String attention) {
        return "urgent".equals(attention)
            ? "Urgent input needed to continue."
            : "Jait needs your input to continue.";
    }
}
