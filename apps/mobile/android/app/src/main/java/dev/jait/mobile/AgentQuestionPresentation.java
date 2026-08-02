package dev.jait.mobile;

final class AgentQuestionPresentation {
    enum Mode {
        SYSTEM_OVERLAY,
        DIRECT_ACTIVITY,
        NOTIFICATION_ONLY
    }

    private AgentQuestionPresentation() {
    }

    static boolean shouldUseSystemOverlay(boolean overlayAvailable) {
        return overlayAvailable;
    }

    static Mode modeFor(
        boolean screenInteractive,
        boolean screenLocked,
        boolean overlayAvailable
    ) {
        if (!screenInteractive || screenLocked) return Mode.NOTIFICATION_ONLY;
        if (overlayAvailable) return Mode.SYSTEM_OVERLAY;
        return Mode.DIRECT_ACTIVITY;
    }

    static String subtitleFor(String attention) {
        return "urgent".equals(attention)
            ? "Urgent input needed to continue."
            : "Input needed to continue.";
    }

    static String titleFor(String title) {
        String trimmed = title == null ? "" : title.trim();
        if (trimmed.isEmpty() || "Jait needs your input".equalsIgnoreCase(trimmed)) {
            return "Input requested";
        }
        return trimmed;
    }
}
