package dev.jait.mobile.wear;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;

/**
 * Centralized dark/light palette for the watch UI. Values mirror the Jait web/desktop shadcn theme
 * (apps/web/src/index.css: hsl(--dark-hue=220 --dark-sat=12% ...) tokens) so the watch looks like
 * the rest of the product. The user can toggle the theme from the home header; the choice is
 * persisted locally so it survives app restarts. All watch views should read colors from here
 * instead of hard-coding values.
 */
final class WearTheme {
    static final String MODE_DARK = "dark";
    static final String MODE_LIGHT = "light";

    private static final String PREFS = "jait-wear-theme";
    private static final String KEY_MODE = "mode";

    private final boolean dark;

    private WearTheme(boolean dark) {
        this.dark = dark;
    }

    static WearTheme load(Context context) {
        SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        return new WearTheme(!MODE_LIGHT.equals(preferences.getString(KEY_MODE, MODE_DARK)));
    }

    void save(Context context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_MODE, dark ? MODE_DARK : MODE_LIGHT)
            .apply();
    }

    boolean isDark() {
        return dark;
    }

    WearTheme toggled() {
        return new WearTheme(!dark);
    }

    static void toggle(Context context) {
        WearTheme current = load(context);
        current.toggled().save(context);
    }

    // --background hsl(210 18% 94%) / 220 12% 5%
    int background() {
        return dark ? Color.rgb(11, 12, 14) : Color.rgb(237, 240, 242);
    }

    // --card hsl(210 18% 96%) / 220 12% 10%
    int surface() {
        return dark ? Color.rgb(22, 24, 29) : Color.rgb(243, 245, 247);
    }

    // --accent hsl(210 14% 88%) / 220 12% 18%
    int surfaceActive() {
        return dark ? Color.rgb(40, 44, 51) : Color.rgb(220, 224, 229);
    }

    // --border hsl(210 12% 80%) / 220 12% 24%
    int border() {
        return dark ? Color.rgb(54, 59, 69) : Color.rgb(198, 204, 210);
    }

    // --secondary (secondary button background) hsl(210 14% 88%) / 220 12% 15%
    int borderActive() {
        return dark ? Color.rgb(34, 37, 43) : Color.rgb(220, 224, 229);
    }

    // --foreground hsl(0 0% 3.9%) / 210 20% 96% (body/titles)
    int primary() {
        return dark ? Color.rgb(243, 245, 247) : Color.rgb(10, 10, 10);
    }

    // secondary text: previews, between foreground and muted-foreground (foreground @70%)
    int secondary() {
        return dark ? Color.rgb(173, 175, 177) : Color.rgb(78, 79, 80);
    }

    // --muted-foreground hsl(0 0% 45.1%) / 215 12% 52%
    int muted() {
        return dark ? Color.rgb(118, 130, 147) : Color.rgb(115, 115, 115);
    }

    int disabled() {
        return dark ? Color.rgb(100, 103, 108) : Color.rgb(163, 163, 163);
    }

    // --primary hsl(217 91% 60%)
    int blue() {
        return Color.rgb(60, 131, 246);
    }

    // --primary-foreground (text/keys on top of blue)
    int onPrimary() {
        return Color.WHITE;
    }

    int green() {
        return dark ? Color.rgb(74, 222, 128) : Color.rgb(22, 163, 74);
    }

    // --destructive, brightened in dark mode so 9sp text stays readable on the watch
    int red() {
        return dark ? Color.rgb(248, 113, 113) : Color.rgb(239, 68, 68);
    }

    // --primary @10-12% composited over --background (matches the web chat user bubble tint)
    int userBubble() {
        return dark ? Color.rgb(17, 26, 42) : Color.rgb(219, 229, 242);
    }

    // --primary @~40% over the bubble
    int userBubbleBorder() {
        return dark ? Color.rgb(31, 60, 107) : Color.rgb(157, 191, 244);
    }

    // banner/background chips: --secondary hsl(210 14% 88%) / 220 12% 15%
    int bannerBg() {
        return borderActive();
    }

    int bannerBorder() {
        return dark ? Color.rgb(46, 50, 58) : Color.rgb(205, 210, 216);
    }

    int logoBackground() {
        return dark ? Color.WHITE : Color.rgb(24, 28, 36);
    }
}