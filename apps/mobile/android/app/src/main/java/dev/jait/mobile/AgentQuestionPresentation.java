package dev.jait.mobile;

final class AgentQuestionPresentation {
    private AgentQuestionPresentation() {
    }

    static boolean shouldUseSystemOverlay(String attention, boolean overlayAvailable) {
        return "urgent".equals(attention) && overlayAvailable;
    }
}
