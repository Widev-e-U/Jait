package dev.jait.mobile.wear;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;

/**
 * Centralized dark/light palette for the watch UI. The user can toggle the theme from the home
 * header; the choice is persisted locally so it survives app restarts. All watch views should read
 * colors from here instead of hard-coding values.
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

    int background() {
        return dark ? Color.rgb(13, 15, 18) : Color.rgb(244, 246, 250);
    }

    int surface() {
        return dark ? Color.rgb(24, 26, 31) : Color.rgb(255, 255, 255);
    }

    int surfaceActive() {
        return dark ? Color.rgb(22, 31, 45) : Color.rgb(224, 232, 244);
    }

    int border() {
        return dark ? Color.rgb(52, 57, 66) : Color.rgb(205, 211, 222);
    }

    int borderActive() {
        return dark ? Color.rgb(43, 61, 86) : Color.rgb(168, 190, 220);
    }

    int primary() {
        return dark ? Color.rgb(242, 244, 247) : Color.rgb(24, 28, 36);
    }

    int secondary() {
        return dark ? Color.rgb(174, 180, 189) : Color.rgb(88, 96, 110);
    }

    int muted() {
        return dark ? Color.rgb(104, 111, 121) : Color.rgb(120, 128, 142);
    }

    int disabled() {
        return dark ? Color.rgb(65, 70, 78) : Color.rgb(196, 202, 212);
    }

    int blue() {
        return dark ? Color.rgb(96, 165, 250) : Color.rgb(37, 99, 235);
    }

    int green() {
        return dark ? Color.rgb(74, 222, 128) : Color.rgb(22, 163, 74);
    }

    int red() {
        return dark ? Color.rgb(248, 113, 113) : Color.rgb(220, 38, 38);
    }

    int userBubble() {
        return dark ? Color.rgb(24, 42, 66) : Color.rgb(214, 228, 250);
    }

    int userBubbleBorder() {
        return dark ? Color.rgb(48, 85, 132) : Color.rgb(147, 178, 224);
    }

    int logoBackground() {
        return dark ? Color.WHITE : Color.rgb(24, 28, 36);
    }
}
