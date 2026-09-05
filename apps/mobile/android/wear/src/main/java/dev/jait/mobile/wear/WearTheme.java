package dev.jait.mobile.wear;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;

/**
 * Jait token palette for the watch. Mirrors apps/web/src/index.css, tuned for OLED wrist
 * displays: dark mode goes near-black (darker than the web shell) and cards are a barely-lifted
 * fill — the watch UI deliberately renders without hairline borders.
 */
final class WearTheme {
    private static final String PREFS = "jait-wear-theme";
    private static final String KEY_DARK = "dark";

    private WearTheme() {
    }

    static boolean isDark(Context context) {
        SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        return preferences.getBoolean(KEY_DARK, true);
    }

    static void toggle(Context context) {
        boolean nextTheme = !isDark(context);
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_DARK, nextTheme)
            .apply();
    }

    /** --background (page + notification background); OLED-dark, deeper than the web shell. */
    static int background(Context context) {
        return isDark(context) ? Color.rgb(6, 7, 9) : Color.rgb(222, 229, 237);
    }

    /** --foreground (primary text, icon strokes). */
    static int foreground(Context context) {
        return isDark(context) ? Color.rgb(235, 240, 247) : Color.rgb(10, 10, 10);
    }

    /** --muted-foreground (secondary text). */
    static int mutedForeground(Context context) {
        return isDark(context) ? Color.rgb(120, 130, 148) : Color.rgb(115, 115, 115);
    }

    /** --card (raised surfaces: banners, list rows, bubbles) — a barely-lifted fill, no border. */
    static int card(Context context) {
        return isDark(context) ? Color.rgb(15, 17, 21) : Color.rgb(235, 240, 246);
    }

    /** --border (hairlines around cards, chips, rows). */
    static int border(Context context) {
        return isDark(context) ? Color.rgb(52, 61, 72) : Color.rgb(199, 207, 216);
    }

    /** --primary (#3b82f6). */
    static int primary(Context context) {
        return Color.rgb(59, 130, 246);
    }

    /** --primary-foreground. */
    static int primaryForeground(Context context) {
        return Color.rgb(239, 246, 255);
    }

    /** Brand mark tile: blue-tinted fill without a hairline. */
    static int logoBackground(Context context) {
        return isDark(context) ? Color.rgb(20, 36, 62) : Color.rgb(219, 232, 250);
    }

    static int logoForeground(Context context) {
        return isDark(context) ? Color.rgb(96, 165, 250) : Color.rgb(37, 99, 235);
    }

    /** User message bubble: primary at ~14% over background, like the web composer. */
    static int userBubble(Context context) {
        return isDark(context) ? Color.rgb(22, 36, 61) : Color.rgb(214, 230, 252);
    }

    /** Focused chip background: primary at ~24% (web `chip-active`). */
    static int surfaceActive(Context context) {
        return isDark(context) ? Color.rgb(26, 43, 74) : Color.rgb(202, 223, 249);
    }

    static int success(Context context) {
        return Color.rgb(34, 197, 94);
    }

    static int warning(Context context) {
        return Color.rgb(245, 158, 11);
    }

    static int destructive(Context context) {
        return Color.rgb(239, 68, 68);
    }
}