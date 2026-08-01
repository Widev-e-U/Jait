package dev.jait.mobile;

import static org.junit.Assert.assertEquals;
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

    @Test
    public void lockedScreenUsesImmediateFullScreenPresentation() {
        assertEquals(
            AgentQuestionPresentation.Mode.FULL_SCREEN_ACTIVITY,
            AgentQuestionPresentation.modeFor(true, true)
        );
    }

    @Test
    public void unavailableOverlayUsesImmediateFullScreenPresentation() {
        assertEquals(
            AgentQuestionPresentation.Mode.FULL_SCREEN_ACTIVITY,
            AgentQuestionPresentation.modeFor(false, false)
        );
    }

    @Test
    public void normalQuestionUsesJaitContinuationCopy() {
        assertEquals(
            "Jait needs your input to continue.",
            AgentQuestionPresentation.subtitleFor("normal")
        );
    }

    @Test
    public void urgentQuestionOnlyChangesEmphasisCopy() {
        assertEquals(
            "Urgent input needed to continue.",
            AgentQuestionPresentation.subtitleFor("urgent")
        );
    }
}
