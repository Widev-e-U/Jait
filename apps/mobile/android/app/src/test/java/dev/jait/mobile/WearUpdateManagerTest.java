package dev.jait.mobile;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class WearUpdateManagerTest {
    @Test
    public void acceptsGitHubReleaseUrls() {
        assertTrue(WearUpdateManager.isAllowedDownloadUri(
            "https://github.com/Widev-e-U/Jait/releases/download/v0.1.659/Jait-0.1.659-wear.apk"
        ));
        assertTrue(WearUpdateManager.isAllowedDownloadUri(
            "https://release-assets.githubusercontent.com/github-production-release-asset/wear.apk"
        ));
    }

    @Test
    public void rejectsNonGitHubAndInsecureUrls() {
        assertFalse(WearUpdateManager.isAllowedDownloadUri(
            "http://github.com/Widev-e-U/Jait/releases/download/v0.1.659/Jait-wear.apk"
        ));
        assertFalse(WearUpdateManager.isAllowedDownloadUri("https://example.com/Jait-wear.apk"));
        assertFalse(WearUpdateManager.isAllowedDownloadUri("https://github.com.example.com/Jait-wear.apk"));
    }
}
