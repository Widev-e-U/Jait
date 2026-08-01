package dev.jait.mobile;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class AgentQuestionPresentationTest {
    @Test
    public void everyQuestionUsesAvailableSystemOverlay() {
        assertTrue(AgentQuestionPresentation.shouldUseSystemOverlay(true));
    }

    @Test
    public void unavailableSystemOverlayFallsBack() {
        assertFalse(AgentQuestionPresentation.shouldUseSystemOverlay(false));
    }
}
