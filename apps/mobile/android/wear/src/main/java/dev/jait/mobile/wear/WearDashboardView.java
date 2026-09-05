package dev.jait.mobile.wear;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import androidx.wear.widget.BoxInsetLayout;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Every screen of the watch app, rendered imperatively with plain widgets in the Jait
 * design language (see {@link WearTheme}):
 *
 * <ul>
 *   <li>{@link #buildHome} — centered brand, connection banner, metric chips, recent chats
 *       and two big centered actions.</li>
 *   <li>{@link #buildChats} — chat index with All/Running/Waiting filter pills.</li>
 *   <li>{@link #buildChat} — a chat transcript rendered as borderless message bubbles.</li>
 *   <li>{@link #buildRequests} — the agent inbox (questions that need a reply).</li>
 * </ul>
 *
 * Design rules: no hairline borders (everything is a subtle fill), centered content, and a
 * near-black dark palette. Everything sits inside a {@link BoxInsetLayout} with
 * {@code BOX_ALL} so headers, trailing buttons and footers clear the curved bezel of round
 * watch faces — this is what keeps the top-right controls fully visible.
 */
public final class WearDashboardView {
    private static final int MAX_CHATS_PER_PAGE = 4;
    private static final int MAX_MESSAGES_PER_PAGE = 3;
    private static final int MAX_REQUESTS_PER_PAGE = 2;

    private static final String[] FILTERS = {"all", "running", "waiting"};

    /** Chat-list filter, process-wide so it survives activity re-renders. */
    private static String sFilter = "all";

    private final Context context;
    private Listener listener;

    /** Callbacks fired by the screens; implemented by {@link WearQuestionActivity}. */
    public interface Listener {
        void onHome();

        void onChats();

        void onRequests();

        void onRefresh();

        void onOpenChat(WearSnapshotStore.Chat chat);

        void onOpenRequest(WearRequestStore.Entry entry);

        void onPage(int nextPage);

        void onToggleTheme();
    }

    public WearDashboardView(Context context) {
        this.context = context;
        this.listener = null;
    }

    // ------------------------------------------------------------------ home dashboard

    public View buildHome(
        WearSnapshotStore.Snapshot snapshot,
        List<WearRequestStore.Entry> entries,
        Listener listener
    ) {
        this.listener = listener;

        LinearLayout body = root();
        body.addView(brandRow());

        if (!snapshot.connected) {
            body.addView(connectionBanner(), layoutMatch(0, 0, 0, 12));
        }

        List<WearSnapshotStore.Chat> running = byStatus(snapshot.chats, "running");
        List<WearSnapshotStore.Chat> waiting = byStatus(snapshot.chats, "waiting");
        int pending = pendingCount(entries);

        body.addView(metricChips(running.size(), waiting.size(), snapshot.chats.size(), pending),
            layoutWrap(0, 0, 0, 14));

        if (snapshot.chats.isEmpty()) {
            TextView empty = centeredNote("No chats yet.\nOpen Jait on your phone.", 11);
            body.addView(empty, layoutMatch(0, 6, 0, 4));
        } else {
            body.addView(sectionTitle("Recent"));
            List<WearSnapshotStore.Chat> recent = sortedByUpdated(snapshot.chats);
            for (int index = 0; index < Math.min(3, recent.size()); index++) {
                body.addView(chatCard(recent.get(index)), layoutMatch(0, 6, 0, 6));
            }
        }

        TextView inbox = primaryPill(pending == 0 ? "Agent inbox" : "Agent inbox · " + pending);
        inbox.setOnClickListener(view -> listener.onRequests());
        body.addView(inbox, layoutMatch(0, 14, 0, 8));

        TextView chats = secondaryPill("All chats · " + snapshot.chats.size());
        chats.setOnClickListener(view -> listener.onChats());
        body.addView(chats, layoutMatch(0, 0, 0, 10));

        TextView refresh = footer(tapToRefresh(), view -> listener.onRefresh());
        body.addView(refresh, layoutMatch(0, 0, 0, 2));

        return wrap(body, homeHeader(listener));
    }

    // ------------------------------------------------------------------ chat index

    public View buildChats(WearSnapshotStore.Snapshot snapshot, int page, Listener listener) {
        this.listener = listener;

        LinearLayout body = root();
        body.addView(screenHeader("Chats", v -> listener.onHome(), listener), layoutMatch(0, 10, 0, 8));
        body.addView(filterBar(), layoutWrap(0, 0, 0, 10));

        List<WearSnapshotStore.Chat> chats = matches(sortedByUpdated(snapshot.chats));
        int pageCount = Math.max(1, (chats.size() + MAX_CHATS_PER_PAGE - 1) / MAX_CHATS_PER_PAGE);
        int safePage = clamp(page, 0, pageCount - 1);

        if (chats.isEmpty()) {
            body.addView(centeredNote("all".equals(sFilter) ? "No chats synced yet." : "No " + sFilter + " chats.", 11),
                layoutMatch(0, 16, 0, 4));
        } else {
            body.addView(sectionTitle("Updated"));
            int start = safePage * MAX_CHATS_PER_PAGE;
            for (int index = start; index < chats.size() && index < start + MAX_CHATS_PER_PAGE; index++) {
                body.addView(chatCard(chats.get(index)), layoutMatch(0, 6, 0, 6));
            }
        }
        body.addView(pageNav(safePage, pageCount, "chats"), layoutWrap(0, 8, 0, 2));
        return wrap(body, null);
    }

    // ------------------------------------------------------------------ chat transcript

    public View buildChat(WearSnapshotStore.Chat chat, int page, Listener listener) {
        this.listener = listener;

        LinearLayout body = root();
        body.addView(screenHeader(chat.title, v -> listener.onChats(), listener), layoutMatch(0, 10, 0, 8));
        body.addView(chatStatusRow(chat), layoutMatch(0, 0, 0, 10));

        int total = chat.messages.size();
        int pageCount = Math.max(1, (total + MAX_MESSAGES_PER_PAGE - 1) / MAX_MESSAGES_PER_PAGE);
        // page counts back from the newest message: 0 = latest page.
        int safePage = clamp(page, 0, pageCount - 1);
        int end = total - safePage * MAX_MESSAGES_PER_PAGE;
        int start = Math.max(0, end - MAX_MESSAGES_PER_PAGE);

        if (total == 0) {
            body.addView(centeredNote("No messages yet.", 10), layoutMatch(0, 14, 0, 4));
        }
        for (int index = start; index < end; index++) {
            body.addView(messageBubble(chat.messages.get(index)), layoutMatch(0, 0, 0, 8));
        }

        if (safePage == 0 && "running".equals(chat.status)) {
            body.addView(typingPill(), layoutWrap(0, 2, 0, 6));
        }
        body.addView(newerOlderNav(safePage, pageCount, total), layoutWrap(0, 2, 0, 2));
        return wrap(body, null);
    }

    // ------------------------------------------------------------------ agent inbox

    public View buildRequests(final List<WearRequestStore.Entry> entries, int page, Listener listener) {
        this.listener = listener;

        LinearLayout body = root();
        body.addView(screenHeader("Agent inbox", v -> listener.onHome(), listener), layoutMatch(0, 10, 0, 8));

        int pageCount = Math.max(1, (entries.size() + MAX_REQUESTS_PER_PAGE - 1) / MAX_REQUESTS_PER_PAGE);
        int safePage = clamp(page, 0, pageCount - 1);
        int start = safePage * MAX_REQUESTS_PER_PAGE;

        if (entries.isEmpty()) {
            body.addView(centeredNote("All quiet — nothing needs you.", 11), layoutMatch(0, 16, 0, 4));
        }
        for (int index = start; index < entries.size() && index < start + MAX_REQUESTS_PER_PAGE; index++) {
            body.addView(requestCard(entries.get(index)), layoutMatch(0, 6, 0, 6));
        }
        body.addView(pageNav(safePage, pageCount, "requests"), layoutWrap(0, 8, 0, 2));
        return wrap(body, null);
    }

    // ------------------------------------------------------------------ home widgets

    private LinearLayout brandRow() {
        LinearLayout brand = new LinearLayout(context);
        brand.setOrientation(LinearLayout.VERTICAL);
        brand.setGravity(Gravity.CENTER);
        brand.setPadding(0, dp(8), 0, dp(2));

        TextView name = text("Jait", 16, WearTheme.foreground(context), true);
        name.setLetterSpacing(0.02f);
        brand.addView(name);
        TextView tagline = text("agent inbox", 8, WearTheme.mutedForeground(context));
        tagline.setLetterSpacing(0.1f);
        tagline.setPadding(0, dp(3), 0, 0);
        brand.addView(tagline);
        return brand;
    }

    private LinearLayout connectionBanner() {
        LinearLayout banner = card(14, 10);
        banner.setBackground(fill(14, tint(WearTheme.destructive(context), 34)));
        banner.addView(dot(WearTheme.destructive(context)));
        banner.addView(spacer(dp(8)));
        TextView message = text("Not connected — open Jait on your phone", 10, WearTheme.foreground(context));
        message.setMaxLines(2);
        banner.addView(message, stretch());
        return banner;
    }

    private LinearLayout metricChips(int running, int waiting, int total, int pending) {
        LinearLayout chips = new LinearLayout(context);
        chips.setOrientation(LinearLayout.HORIZONTAL);
        chips.setGravity(Gravity.CENTER);
        if (running > 0) chips.addView(metricChip(running, "running", WearTheme.success(context)));
        if (waiting > 0) chips.addView(metricChip(waiting, "waiting", WearTheme.warning(context)));
        if (pending > 0) chips.addView(metricChip(pending, "inbox", WearTheme.primary(context)));
        if (chips.getChildCount() == 0) chips.addView(metricChip(total, "chats", WearTheme.mutedForeground(context)));
        return chips;
    }

    private LinearLayout metricChip(int value, String label, int accent) {
        LinearLayout chip = new LinearLayout(context);
        chip.setOrientation(LinearLayout.VERTICAL);
        chip.setGravity(Gravity.CENTER);
        chip.setBackground(fill(12, WearTheme.card(context)));
        chip.setPadding(dp(10), dp(8), dp(10), dp(8));

        TextView valueView = text(String.valueOf(value), 14, accent, true);
        chip.addView(valueView);
        TextView labelView = text(label, 8, WearTheme.mutedForeground(context));
        labelView.setPadding(0, dp(1), 0, 0);
        chip.addView(labelView);

        LinearLayout.LayoutParams margins = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
        );
        margins.setMargins(dp(3), 0, dp(3), 0);
        chip.setLayoutParams(margins);
        return chip;
    }

    private LinearLayout chatStatusRow(WearSnapshotStore.Chat chat) {
        LinearLayout rowView = card(12, 8);
        rowView.addView(dot(statusColor(chat.status)));
        rowView.addView(spacer(dp(6)));
        TextView status = text(statusLabel(chat), 9, WearTheme.mutedForeground(context));
        rowView.addView(status, stretch());
        rowView.addView(text(shortTime(chat.updatedAt), 8, WearTheme.mutedForeground(context)));
        return rowView;
    }

    // ------------------------------------------------------------------ cards

    private LinearLayout chatCard(final WearSnapshotStore.Chat chat) {
        LinearLayout card = card(14, 9);
        card.setOrientation(LinearLayout.VERTICAL);

        LinearLayout top = row();
        TextView title = text(chatTitle(chat), 11, WearTheme.foreground(context), true);
        title.setMaxLines(1);
        title.setEllipsize(TextUtils.TruncateAt.END);
        top.addView(title, stretch());
        top.addView(dot(statusColor(chat.status)));
        card.addView(top);

        LinearLayout bottom = row();
        bottom.setPadding(0, dp(3), 0, 0);
        TextView status = text(statusLabel(chat), 9, WearTheme.mutedForeground(context));
        bottom.addView(status, stretch());
        bottom.addView(text(rightAge(chat.updatedAt), 8, WearTheme.mutedForeground(context)));
        card.addView(bottom);

        card.setOnClickListener(v -> listener.onOpenChat(chat));
        return card;
    }

    private LinearLayout requestCard(final WearRequestStore.Entry entry) {
        LinearLayout card = card(14, 9);
        card.setOrientation(LinearLayout.VERTICAL);

        TextView title = text(entry.title, 11, WearTheme.foreground(context), true);
        title.setMaxLines(1);
        title.setEllipsize(TextUtils.TruncateAt.END);
        card.addView(title);

        TextView question = text(entry.question, 10, WearTheme.mutedForeground(context));
        question.setMaxLines(2);
        question.setLineSpacing(0, 1.1f);
        question.setEllipsize(TextUtils.TruncateAt.END);
        question.setPadding(0, dp(3), 0, 0);
        card.addView(question);

        TextView action = text("tap to answer  →", 9, WearTheme.primary(context), true);
        action.setPadding(0, dp(7), 0, 0);
        card.addView(action);

        card.setOnClickListener(v -> listener.onOpenRequest(entry));
        return card;
    }

    private LinearLayout messageBubble(WearSnapshotStore.Message message) {
        boolean fromUser = WearSnapshotStore.ROLE_USER.equals(message.role);

        LinearLayout holder = new LinearLayout(context);
        holder.setOrientation(LinearLayout.HORIZONTAL);

        LinearLayout bubble = new LinearLayout(context);
        bubble.setOrientation(LinearLayout.VERTICAL);
        bubble.setBackground(fill(12, fromUser ? WearTheme.userBubble(context) : WearTheme.card(context)));
        bubble.setPadding(dp(9), dp(7), dp(9), dp(7));

        TextView body = text(message.content, 10, WearTheme.foreground(context));
        body.setMaxLines(6);
        body.setLineSpacing(0, 1.12f);
        body.setEllipsize(TextUtils.TruncateAt.END);
        bubble.addView(body);

        LinearLayout.LayoutParams bubbleParams = new LinearLayout.LayoutParams(
            0, ViewGroup.LayoutParams.WRAP_CONTENT, fromUser ? 1f : 3f
        );
        if (fromUser) {
            bubbleParams.setMargins(dp(28), 0, 0, 0); // user bubble pushed right, indented
        } else {
            bubbleParams.setMargins(0, 0, dp(28), 0); // agent bubble pushed left
        }
        holder.addView(bubble, bubbleParams);
        return holder;
    }

    private TextView typingPill() {
        TextView pill = text("agent is typing…", 9, WearTheme.mutedForeground(context));
        pill.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.ITALIC));
        pill.setGravity(Gravity.CENTER);
        return pill;
    }

    // ------------------------------------------------------------------ headers & nav

    /** Home header: brand-free, only the theme toggle pinned to the readable edge. */
    private View homeHeader(final Listener listener) {
        FrameLayout bar = new FrameLayout(context);
        TextView themeToggle = iconPill(WearTheme.isDark(context) ? "☀" : "☾",
            WearTheme.card(context), WearTheme.foreground(context));
        themeToggle.setOnClickListener(v -> listener.onToggleTheme());
        bar.addView(themeToggle, edgeParams(Gravity.END, 0, 0, 0, 0));
        return bar;
    }

    /** Screen header: centered title, back on the readable left, theme toggle on the right. */
    private View screenHeader(String title, View.OnClickListener back, final Listener listener) {
        FrameLayout bar = new FrameLayout(context);

        TextView titleView = text(title, 12, WearTheme.foreground(context), true);
        titleView.setGravity(Gravity.CENTER);
        titleView.setMaxLines(1);
        titleView.setEllipsize(TextUtils.TruncateAt.END);
        titleView.setPadding(dp(34), 0, dp(34), 0);
        bar.addView(titleView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER
        ));

        TextView backPill = iconPill("‹", WearTheme.card(context), WearTheme.foreground(context));
        backPill.setOnClickListener(back);
        bar.addView(backPill, edgeParams(Gravity.START, 0, 0, 0, 0));

        TextView themeToggle = iconPill(WearTheme.isDark(context) ? "☀" : "☾",
            WearTheme.card(context), WearTheme.foreground(context));
        themeToggle.setOnClickListener(v -> listener.onToggleTheme());
        bar.addView(themeToggle, edgeParams(Gravity.END, 0, 0, 0, 0));
        return bar;
    }

    private LinearLayout filterBar() {
        LinearLayout bar = new LinearLayout(context);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER);
        for (final String filter : FILTERS) {
            boolean selected = filter.equals(sFilter);
            TextView chip = pill(filter, selected ? WearTheme.surfaceActive(context) : WearTheme.card(context),
                selected ? WearTheme.primary(context) : WearTheme.mutedForeground(context));
            chip.setOnClickListener(v -> {
                sFilter = filter;
                listener.onChats();
            });
            bar.addView(chip, chipMargins());
        }
        return bar;
    }

    private LinearLayout pageNav(int page, int pageCount, String noun) {
        LinearLayout nav = new LinearLayout(context);
        nav.setOrientation(LinearLayout.HORIZONTAL);
        nav.setGravity(Gravity.CENTER);
        if (pageCount <= 1) {
            nav.addView(spacer(dp(4)));
            return nav;
        }
        TextView prev = iconPill("‹", WearTheme.card(context), WearTheme.foreground(context));
        prev.setOnClickListener(v -> listener.onPage(Math.max(0, page - 1)));
        nav.addView(prev, iconPillParams());

        TextView counter = text((page + 1) + "/" + pageCount + " " + noun, 9, WearTheme.mutedForeground(context));
        LinearLayout.LayoutParams counterParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
        );
        counterParams.setMargins(dp(8), 0, dp(8), 0);
        nav.addView(counter, counterParams);

        TextView next = iconPill("›", WearTheme.card(context), WearTheme.foreground(context));
        next.setOnClickListener(v -> listener.onPage(Math.min(pageCount - 1, page + 1)));
        nav.addView(next, iconPillParams());
        return nav;
    }

    private LinearLayout newerOlderNav(int page, int pageCount, int total) {
        LinearLayout nav = new LinearLayout(context);
        nav.setOrientation(LinearLayout.HORIZONTAL);
        nav.setGravity(Gravity.CENTER);
        boolean hasOlder = (page + 1) * MAX_MESSAGES_PER_PAGE < total;
        boolean hasNewer = page > 0;
        if (hasOlder) {
            TextView older = pill("older  ‹", WearTheme.card(context), WearTheme.mutedForeground(context));
            older.setOnClickListener(v -> listener.onPage(page + 1));
            nav.addView(older, chipMargins());
        }
        if (hasNewer) {
            TextView newer = pill("›  newer", WearTheme.card(context), WearTheme.mutedForeground(context));
            newer.setOnClickListener(v -> listener.onPage(page - 1));
            nav.addView(newer, chipMargins());
        }
        if (!hasOlder && !hasNewer) nav.addView(spacer(dp(4)));
        return nav;
    }

    private TextView sectionTitle(String label) {
        TextView title = text(label.toUpperCase(Locale.US), 8, WearTheme.mutedForeground(context), true);
        title.setLetterSpacing(0.08f);
        title.setPadding(dp(2), dp(10), 0, dp(3));
        return title;
    }

    private TextView primaryPill(String label) {
        TextView pill = bigPill(label);
        pill.setTextColor(WearTheme.foreground(context));
        pill.setBackground(fill(999, WearTheme.logoBackground(context)));
        return pill;
    }

    private TextView secondaryPill(String label) {
        TextView pill = bigPill(label);
        pill.setTextColor(WearTheme.mutedForeground(context));
        pill.setBackground(fill(999, WearTheme.card(context)));
        return pill;
    }

    private TextView bigPill(String label) {
        TextView pill = new TextView(context);
        pill.setText(label);
        pill.setTextSize(11);
        pill.setTypeface(Typeface.DEFAULT_BOLD);
        pill.setGravity(Gravity.CENTER);
        pill.setPadding(dp(12), dp(11), dp(12), dp(11));
        pill.setClickable(true);
        pill.setFocusable(true);
        return pill;
    }

    private TextView footer(String label, View.OnClickListener onClick) {
        TextView footer = text(label, 8, WearTheme.mutedForeground(context));
        footer.setGravity(Gravity.CENTER);
        footer.setClickable(true);
        footer.setFocusable(true);
        footer.setOnClickListener(onClick);
        footer.setPadding(0, dp(6), 0, dp(2));
        return footer;
    }

    private TextView centeredNote(String message, float sizeSp) {
        TextView note = text(message, sizeSp, WearTheme.mutedForeground(context));
        note.setGravity(Gravity.CENTER);
        note.setLineSpacing(0, 1.15f);
        return note;
    }

    // ------------------------------------------------------------------ layout helpers

    private LinearLayout root() {
        LinearLayout layout = new LinearLayout(context);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(dp(2), dp(2), dp(2), dp(12));
        return layout;
    }

    /** Borderless surface: rounded fill, no stroke. */
    private LinearLayout card(int radiusDp, int padDp) {
        LinearLayout layout = new LinearLayout(context);
        layout.setOrientation(LinearLayout.HORIZONTAL);
        layout.setGravity(Gravity.CENTER_VERTICAL);
        layout.setBackground(fill(radiusDp, WearTheme.card(context)));
        layout.setPadding(dp(padDp), dp(padDp), dp(padDp), dp(padDp));
        layout.setClickable(true);
        layout.setFocusable(true);
        return layout;
    }

    /** Scrollable page inside BoxInsetLayout so content clears round bezels. */
    private View wrap(LinearLayout body, View overlayHeader) {
        body.setBackgroundColor(WearTheme.background(context));
        ScrollView scroll = new ScrollView(context);
        scroll.setFillViewport(true);
        scroll.setClipToPadding(false);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.addView(body, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        BoxInsetLayout box = new BoxInsetLayout(context);
        box.setBackgroundColor(WearTheme.background(context));

        BoxInsetLayout.LayoutParams scrollParams = new BoxInsetLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT, Gravity.CENTER
        );
        scrollParams.boxedEdges = BoxInsetLayout.LayoutParams.BOX_ALL;
        box.addView(scroll, scrollParams);

        if (overlayHeader != null) {
            BoxInsetLayout.LayoutParams headerParams = new BoxInsetLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP
            );
            headerParams.boxedEdges = BoxInsetLayout.LayoutParams.BOX_ALL;
            box.addView(overlayHeader, headerParams);
        }
        return box;
    }

    private LinearLayout row() {
        LinearLayout layout = new LinearLayout(context);
        layout.setOrientation(LinearLayout.HORIZONTAL);
        layout.setGravity(Gravity.CENTER_VERTICAL);
        return layout;
    }

    private View dot(int color) {
        View dot = new View(context);
        dot.setBackground(circle(color));
        dot.setLayoutParams(new LinearLayout.LayoutParams(dp(6), dp(6)));
        return dot;
    }

    private View spacer(int width) {
        View spacer = new View(context);
        spacer.setLayoutParams(new LinearLayout.LayoutParams(width, 1));
        return spacer;
    }

    private LinearLayout.LayoutParams stretch() {
        return new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
    }

    /** Full-width block with outer margins (left, top, right, bottom dp). */
    private LinearLayout.LayoutParams layoutMatch(int left, int top, int right, int bottom) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(dp(left), dp(top), dp(right), dp(bottom));
        return params;
    }

    /** Centered wrap-content block with outer margins (left, top, right, bottom dp). */
    private LinearLayout.LayoutParams layoutWrap(int left, int top, int right, int bottom) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(dp(left), dp(top), dp(right), dp(bottom));
        return params;
    }

    private LinearLayout.LayoutParams chipMargins() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(dp(3), 0, dp(3), 0);
        return params;
    }

    private LinearLayout.LayoutParams iconPillParams() {
        return new LinearLayout.LayoutParams(dp(28), dp(28));
    }

    private FrameLayout.LayoutParams edgeParams(int gravity, int left, int top, int right, int bottom) {
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(dp(28), dp(28), gravity);
        params.setMargins(dp(left), dp(top), dp(right), dp(bottom));
        return params;
    }

    // ------------------------------------------------------------------ drawing helpers

    /** Rounded fill with no border — the Jait watch style. */
    private GradientDrawable fill(float radiusDp, int fillColor) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setShape(GradientDrawable.RECTANGLE);
        drawable.setCornerRadius(dp(radiusDp));
        drawable.setColor(fillColor);
        return drawable;
    }

    private GradientDrawable circle(int fillColor) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setShape(GradientDrawable.OVAL);
        drawable.setColor(fillColor);
        return drawable;
    }

    private int tint(int base, int alpha255) {
        return Color.argb(alpha255, Color.red(base), Color.green(base), Color.blue(base));
    }

    private TextView pill(String label, int fillColor, int textColor) {
        TextView pill = new TextView(context);
        pill.setText(label);
        pill.setTextColor(textColor);
        pill.setTextSize(9);
        pill.setTypeface(Typeface.DEFAULT_BOLD);
        pill.setGravity(Gravity.CENTER);
        pill.setBackground(fill(10, fillColor));
        pill.setPadding(dp(9), dp(5), dp(9), dp(5));
        pill.setClickable(true);
        pill.setFocusable(true);
        return pill;
    }

    private TextView iconPill(String glyph, int fillColor, int textColor) {
        TextView pill = new TextView(context);
        pill.setText(glyph);
        pill.setTextColor(textColor);
        pill.setTextSize(13);
        pill.setTypeface(Typeface.DEFAULT_BOLD);
        pill.setGravity(Gravity.CENTER);
        pill.setBackground(fill(999, fillColor));
        pill.setClickable(true);
        pill.setFocusable(true);
        return pill;
    }

    private TextView text(String label, float sizeSp, int color) {
        TextView view = new TextView(context);
        view.setText(label);
        view.setTextColor(color);
        view.setTextSize(sizeSp);
        return view;
    }

    private TextView text(String label, float sizeSp, int color, boolean bold) {
        TextView view = text(label, sizeSp, color);
        if (bold) view.setTypeface(Typeface.DEFAULT_BOLD);
        return view;
    }

    private int dp(float value) {
        return Math.max(1, Math.round(TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, value, context.getResources().getDisplayMetrics()
        )));
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    // ------------------------------------------------------------------ data helpers

    private String chatTitle(WearSnapshotStore.Chat chat) {
        return TextUtils.isEmpty(chat.title) ? "Untitled chat" : chat.title;
    }

    private String statusLabel(WearSnapshotStore.Chat chat) {
        String normalized = chat.status == null ? "" : chat.status.toLowerCase(Locale.US);
        switch (normalized) {
            case "running":
            case "active":
                return "Running now";
            case "waiting":
            case "needs_input":
            case "pending":
                return "Needs your reply";
            case "error":
            case "failed":
                return "Needs attention";
            default:
                return "Idle";
        }
    }

    private int statusColor(String status) {
        String normalized = status == null ? "" : status.toLowerCase(Locale.US);
        switch (normalized) {
            case "running":
            case "active":
                return WearTheme.success(context);
            case "waiting":
            case "needs_input":
            case "pending":
                return WearTheme.warning(context);
            case "error":
            case "failed":
                return WearTheme.destructive(context);
            default:
                return WearTheme.mutedForeground(context);
        }
    }

    private List<WearSnapshotStore.Chat> byStatus(List<WearSnapshotStore.Chat> chats, String status) {
        List<WearSnapshotStore.Chat> result = new ArrayList<>();
        for (WearSnapshotStore.Chat chat : chats) {
            if (status.equalsIgnoreCase(chat.status)) result.add(chat);
        }
        return result;
    }

    private List<WearSnapshotStore.Chat> matches(List<WearSnapshotStore.Chat> chats) {
        if ("all".equals(sFilter)) return chats;
        List<WearSnapshotStore.Chat> result = new ArrayList<>();
        for (WearSnapshotStore.Chat chat : chats) {
            if (sFilter.equalsIgnoreCase(chat.status)) result.add(chat);
        }
        return result;
    }

    private List<WearSnapshotStore.Chat> sortedByUpdated(List<WearSnapshotStore.Chat> chats) {
        List<WearSnapshotStore.Chat> copy = new ArrayList<>(chats);
        copy.sort((left, right) -> parseDate(right.updatedAt).compareTo(parseDate(left.updatedAt)));
        return copy;
    }

    private List<WearRequestStore.Entry> pendingOnly(List<WearRequestStore.Entry> entries) {
        List<WearRequestStore.Entry> pending = new ArrayList<>();
        for (WearRequestStore.Entry entry : entries) {
            if (entry.isPending()) pending.add(entry);
        }
        return pending;
    }

    private int pendingCount(List<WearRequestStore.Entry> entries) {
        return pendingOnly(entries).size();
    }

    private Date parseDate(String raw) {
        Long parsed = parseTimestamp(raw);
        return new Date(parsed == null ? 0L : parsed);
    }

    /** Best-effort ISO-8601 parser; returns epoch millis or null. */
    private static Long parseTimestamp(String raw) {
        if (raw == null || raw.isEmpty()) return null;
        String[] patterns = {
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
            "yyyy-MM-dd'T'HH:mm:ss'Z'",
            "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
            "yyyy-MM-dd'T'HH:mm:ssXXX",
            "yyyy-MM-dd HH:mm:ss"
        };
        for (String pattern : patterns) {
            try {
                SimpleDateFormat format = new SimpleDateFormat(pattern, Locale.US);
                format.setTimeZone(TimeZone.getTimeZone("UTC"));
                return format.parse(raw).getTime();
            } catch (ParseException ignored) {
            }
        }
        return null;
    }

    private String rightAge(String iso) {
        Long epoch = parseTimestamp(iso);
        if (epoch == null) return "";
        return relativeSince(epoch);
    }

    private String relativeSince(long epochMillis) {
        long delta = Math.max(0, System.currentTimeMillis() - epochMillis);
        long minutes = delta / 60000L;
        if (minutes < 1) return "just now";
        if (minutes < 60) return minutes + "m";
        long hours = minutes / 60;
        if (hours < 24) return hours + "h";
        return (hours / 24) + "d";
    }

    private String shortTime(String iso) {
        Long epoch = parseTimestamp(iso);
        if (epoch == null) return "";
        return new SimpleDateFormat("HH:mm", Locale.US).format(new Date(epoch));
    }

    private String tapToRefresh() {
        return "tap to refresh";
    }
}