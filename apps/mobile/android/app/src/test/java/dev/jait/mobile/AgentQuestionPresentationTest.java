package dev.jait.mobile;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class AgentQuestionPresentationTest {
    @Test
    public void urgentQuestionUsesAvailableSystemOverlay() {
        assertTrue(AgentQuestionPresentation.shouldUseSystemOverlay("urgent", true));
    }

    @Test
    public void normalQuestionDoesNotUseSystemOverlay() {
        assertFalse(AgentQuestionPresentation.shouldUseSystemOverlay("normal", true));
    }

    @Test
    public void unavailableSystemOverlayFallsBack() {
        assertFalse(AgentQuestionPresentation.shouldUseSystemOverlay("urgent", false));
    }
}
