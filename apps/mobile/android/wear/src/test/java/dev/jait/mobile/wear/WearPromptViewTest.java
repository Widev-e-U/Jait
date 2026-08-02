package dev.jait.mobile.wear;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class WearPromptViewTest {
    @Test
    public void ageLabelUsesCompactWatchFriendlyUnits() {
        long now = 10L * 24L * 60L * 60L * 1000L;

        assertEquals("now", WearPromptView.ageLabel(now - 20_000L, now));
        assertEquals("5m", WearPromptView.ageLabel(now - 5L * 60_000L, now));
        assertEquals("3h", WearPromptView.ageLabel(now - 3L * 60L * 60_000L, now));
        assertEquals("2d", WearPromptView.ageLabel(now - 2L * 24L * 60L * 60_000L, now));
    }
}
