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
    public void screenOffUsesNotificationOnlyEvenWhenUnlocked() {
        assertEquals(
            AgentQuestionPresentation.Mode.NOTIFICATION_ONLY,
            AgentQuestionPresentation.modeFor(false, false, true)
        );
    }

    @Test
    public void lockedInteractiveScreenUsesNotificationOnly() {
        assertEquals(
            AgentQuestionPresentation.Mode.NOTIFICATION_ONLY,
            AgentQuestionPresentation.modeFor(true, true, true)
        );
    }

    @Test
    public void activeUnlockedScreenUsesAvailableOverlay() {
        assertEquals(
            AgentQuestionPresentation.Mode.SYSTEM_OVERLAY,
            AgentQuestionPresentation.modeFor(true, false, true)
        );
    }

    @Test
    public void activeScreenWithoutOverlayPermissionUsesDirectActivity() {
        assertEquals(
            AgentQuestionPresentation.Mode.DIRECT_ACTIVITY,
            AgentQuestionPresentation.modeFor(true, false, false)
        );
    }

    @Test
    public void normalQuestionUsesContinuationCopy() {
        assertEquals(
            "Input needed to continue.",
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

    @Test
    public void defaultJaitHeadingDoesNotDuplicateBrandLockup() {
        assertEquals(
            "Input requested",
            AgentQuestionPresentation.titleFor("Jait needs your input")
        );
    }

    @Test
    public void customQuestionTitleIsPreserved() {
        assertEquals(
            "Morning check-in",
            AgentQuestionPresentation.titleFor("  Morning check-in  ")
        );
    }
}
