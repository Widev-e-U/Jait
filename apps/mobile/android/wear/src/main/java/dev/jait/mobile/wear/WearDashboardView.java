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
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Every screen of the watch app, rendered imperatively with plain widgets in a shadcn-style
 * token language (see {@link WearTheme}):
 *
 * <ul>
 *   <li>{@link #buildHome} — metrics dashboard: connection banner, metric chips, running chats,
 *       recent chats, and needs-reply cards.</li>
 *   <li>{@link #buildChats} — chat index with All/Running/Idle filter chips.</li>
 *   <li>{@link #buildChat} — a chat transcript rendered as real message bubbles.</li>
 *   <li>{@link #buildRequests} — the agent inbox (questions that need a reply).</li>
 * </ul>
 */
public final class WearDashboardView {
    private static final int MAX_CHATS_PER_PAGE = 5;
    private static final int MAX_MESSAGES_PER_PAGE = 3;
    private static final int MAX_REQUESTS_PER_PAGE = 2;

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
        body.addView(header(null, null, true));

        addConnectionBanner(body, snapshot);
        addMetricChips(body, snapshot, pendingCount(entries));

        List<WearSnapshotStore.Chat> running = byStatus(snapshot.chats, "running");
        List<WearSnapshotStore.Chat> recent = sortedByUpdated(snapshot.chats);

        if (snapshot.chats.isEmpty()) {
            body.addView(emptyCard("No chats synced yet.\nOpen Jait on your phone."));
        } else {
            List<WearRequestStore.Entry> pending = pendingOnly(entries);
            if (!pending.isEmpty()) {
                body.addView(sectionTitle("Needs reply", pending.size()));
                for (int index = 0; index < pending.size() && index < 2; index++) {
                    body.addView(requestCard(pending.get(index)));
                }
                if (pending.size() > 2) {
                    body.addView(navRow("All agent requests", v -> listener.onRequests()));
                }
            }
            if (!running.isEmpty()) {
                body.addView(sectionTitle("Running now", running.size()));
                for (int index = 0; index < running.size() && index < 2; index++) {
                    body.addView(chatCard(running.get(index)));
                }
            }
            body.addView(sectionTitle("Recent chats", snapshot.chats.size()));
            for (int index = 0; index < recent.size() && index < 3; index++) {
                body.addView(chatCard(recent.get(index)));
            }
            body.addView(navRow("All chats", v -> listener.onChats()));
            body.addView(navRow("Agent inbox", v -> listener.onRequests()));
        }

        body.addView(footer(snapshot));
        return wrap(body);
    }

    // ------------------------------------------------------------------ chat index

    public View buildChats(WearSnapshotStore.Snapshot snapshot, int page, Listener listener) {
        this.listener = listener;

        LinearLayout body = root();
        body.addView(header("Chats", v -> listener.onHome(), false));
        body.addView(filterBar(snapshot.chats));

        List<WearSnapshotStore.Chat> chats = matches(sortedByUpdated(snapshot.chats));
        int pageCount = Math.max(1, (chats.size() + MAX_CHATS_PER_PAGE - 1) / MAX_CHATS_PER_PAGE);
        int safePage = clamp(page, 0, pageCount - 1);

        if (chats.isEmpty()) {
            body.addView(emptyCard("all".equals(sFilter) ? "No chats synced yet." : "No " + sFilter + " chats."));
        } else {
            int start = safePage * MAX_CHATS_PER_PAGE;
            for (int index = start; index < chats.size() && index < start + MAX_CHATS_PER_PAGE; index++) {
                body.addView(chatCard(chats.get(index)));
            }
        }
        body.addView(pageNav(safePage, pageCount, "chats"));
        return wrap(body);
    }

    // ------------------------------------------------------------------ chat transcript

    public View buildChat(WearSnapshotStore.Chat chat, int page, Listener listener) {
        this.listener = listener;

        LinearLayout body = root();
        body.addView(header(chat.title, v -> listener.onChats(), false));
        body.addView(chatStatusRow(chat));

        int total = chat.messages.size();
        int pageCount = Math.max(1, (total + MAX_MESSAGES_PER_PAGE - 1) / MAX_MESSAGES_PER_PAGE);
        // page counts back from the newest message: 0 = latest page.
        int safePage = clamp(page, 0, pageCount - 1);
        int end = total - safePage * MAX_MESSAGES_PER_PAGE;
        int start = Math.max(0, end - MAX_MESSAGES_PER_PAGE);

        for (int index = start; index < end; index++) {
            body.addView(messageBubble(chat.messages.get(index)));
        }

        if (safePage == 0 && "running".equals(chat.status)) {
            body.addView(typingPill());
        }
        body.addView(newerOlderNav(safePage, pageCount, total));
        return wrap(body);
    }

    // ------------------------------------------------------------------ agent inbox

    public View buildRequests(final List<WearRequestStore.Entry> entries, int page, Listener listener) {
        this.listener = listener;

        LinearLayout body = root();
        body.addView(header("Agent inbox", v -> listener.onHome(), false));

        int pageCount = Math.max(1, (entries.size() + MAX_REQUESTS_PER_PAGE - 1) / MAX_REQUESTS_PER_PAGE);
        int safePage = clamp(page, 0, pageCount - 1);
        int start = safePage * MAX_REQUESTS_PER_PAGE;

        if (entries.isEmpty()) {
            body.addView(emptyCard("No agent requests yet."));
        }
        for (int index = start; index < entries.size() && index < start + MAX_REQUESTS_PER_PAGE; index++) {
            body.addView(requestCard(entries.get(index)));
        }
        body.addView(pageNav(safePage, pageCount, "requests"));
        return wrap(body);
    }

    // ------------------------------------------------------------------ home widgets

    private void addConnectionBanner(LinearLayout parent, WearSnapshotStore.Snapshot snapshot) {
        if (snapshot.connected && (snapshot.error == null || snapshot.error.isEmpty())) return;
        LinearLayout banner = card(12, 10);
        if (!snapshot.connected) {
            banner.setBackground(rounded(12, WearTheme.card(context), WearTheme.destructive(context), dp(1)));
        }
        banner.addView(dot(!snapshot.connected ? WearTheme.destructive(context) : WearTheme.warning(context)));
        banner.addView(spacer(dp(8)));
        TextView message = text(
            !snapshot.connected ? "Not connected — open Jait on your phone" : snapshot.error,
            10,
            WearTheme.foreground(context)
        );
        message.setMaxLines(2);
        banner.addView(message, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        parent.addView(banner);
    }

    private void addMetricChips(LinearLayout parent, WearSnapshotStore.Snapshot snapshot, int pendingCount) {
        int running = Math.max(snapshot.activeThreads, byStatus(snapshot.chats, "running").size());

        LinearLayout row = new LinearLayout(context);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.addView(metricChip(running, "running", running > 0), chipParams(6));
        row.addView(metricChip(snapshot.chats.size(), "chats", false), chipParams(0));
        parent.addView(row);

        LinearLayout row2 = new LinearLayout(context);
        row2.setOrientation(LinearLayout.HORIZONTAL);
        row2.addView(metricChip(pendingCount, "need reply", pendingCount > 0), chipParams(6));
        row2.addView(metricChip(snapshot.updatedToday, "updated today", false), chipParams(0));
        parent.addView(row2);
    }

    private LinearLayout.LayoutParams chipParams(int rightMarginDp) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(28), 1f);
        params.setMargins(0, dp(7), dp(rightMarginDp), 0);
        return params;
    }

    private View metricChip(int value, String label, boolean emphasize) {
        TextView chip = new TextView(context);
        chip.setGravity(Gravity.CENTER);
        chip.setTextSize(10);
        chip.setTypeface(Typeface.DEFAULT_BOLD);
        chip.setTextColor(emphasize ? WearTheme.logoForeground(context) : WearTheme.foreground(context));
        chip.setText(value + "  " + label);
        chip.setBackground(rounded(
            9,
            emphasize ? tint(WearTheme.logoForeground(context), 30) : WearTheme.card(context),
            emphasize ? WearTheme.logoForeground(context) : WearTheme.border(context),
            dp(1)
        ));
        return chip;
    }

    private View sectionTitle(String title, int count) {
        TextView titleView = bold(
            title.toUpperCase(Locale.US) + (count > 0 ? "  ·  " + count : ""),
            8,
            WearTheme.mutedForeground(context)
        );
        titleView.setPadding(dp(2), dp(12), 0, dp(3));
        return titleView;
    }

    private View navRow(String label, View.OnClickListener onClick) {
        LinearLayout card = card(14, 13);
        card.setOnClickListener(onClick);
        card.addView(bold(label, 11, WearTheme.foreground(context)), 0);
        View spacer = new View(context);
        card.addView(spacer, new LinearLayout.LayoutParams(0, 1, 1f));
        TextView arrow = pill("›", WearTheme.background(context), WearTheme.mutedForeground(context));
        card.addView(arrow);
        return card;
    }

    private View footer(WearSnapshotStore.Snapshot snapshot) {
        TextView footer = text("synced " + ageAgo(snapshot.syncedAt) + " — tap ↻ to refresh", 8, WearTheme.mutedForeground(context));
        footer.setGravity(Gravity.CENTER);
        footer.setPadding(0, dp(16), 0, 0);
        footer.setOnClickListener(v -> listener.onRefresh());
        return footer;
    }

    // ------------------------------------------------------------------ list widgets

    private View chatCard(final WearSnapshotStore.Chat chat) {
        LinearLayout card = card(14, 12);
        card.setOnClickListener(v -> listener.onOpenChat(chat));

        card.addView(dot(statusColor(chat.status)));
        card.addView(spacer(dp(8)));

        LinearLayout textColumn = new LinearLayout(context);
        textColumn.setOrientation(LinearLayout.VERTICAL);
        TextView title = bold(chat.title, 11, WearTheme.foreground(context));
        title.setMaxLines(1);
        title.setEllipsize(TextUtils.TruncateAt.END);
        textColumn.addView(title);

        if (!chat.messages.isEmpty()) {
            WearSnapshotStore.Message last = chat.messages.get(chat.messages.size() - 1);
            TextView preview = text(last.content, 9, WearTheme.mutedForeground(context));
            preview.setMaxLines(1);
            preview.setEllipsize(TextUtils.TruncateAt.END);
            textColumn.addView(preview);
        }
        card.addView(textColumn, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

       card.addView(text(rightAge(chat.updatedAt), 8, WearTheme.mutedForeground(context)));
        return card;
    }

    private View requestCard(final WearRequestStore.Entry entry) {
        LinearLayout card = card(14, 12);
        if (entry.isPending()) {
            card.setOnClickListener(v -> listener.onOpenRequest(entry));
        }
        card.addView(dot(entry.isPending() ? WearTheme.warning(context) : WearTheme.mutedForeground(context)));
        card.addView(spacer(dp(8)));

        LinearLayout textColumn = new LinearLayout(context);
        textColumn.setOrientation(LinearLayout.VERTICAL);
        TextView title = bold(entry.title, 11, entry.isPending() ? WearTheme.foreground(context) : WearTheme.mutedForeground(context));
        title.setMaxLines(1);
        title.setEllipsize(TextUtils.TruncateAt.END);
        textColumn.addView(title);
        TextView question = text(entry.question, 9, WearTheme.mutedForeground(context));
        question.setMaxLines(2);
        question.setEllipsize(TextUtils.TruncateAt.END);
        textColumn.addView(question);
        card.addView(textColumn, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        return card;
    }

    private View emptyCard(String message) {
        LinearLayout card = card(14, 14);
        TextView text = text(message, 10, WearTheme.mutedForeground(context));
        text.setGravity(Gravity.CENTER);
        card.addView(text, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ));
        return card;
    }

    // ------------------------------------------------------------------ chat transcript widgets

    private View chatStatusRow(WearSnapshotStore.Chat chat) {
        LinearLayout row = row();
        row.setPadding(dp(2), 0, 0, dp(6));
        row.addView(dot(statusColor(chat.status)));
        row.addView(spacer(dp(6)));
        String label = chat.status;
        if (chat.providerId != null && !chat.providerId.isEmpty()) label += " · " + chat.providerId;
        String age = rightAge(chat.updatedAt);
        if (!age.isEmpty()) label += " · " + age;
        row.addView(text(label, 9, WearTheme.mutedForeground(context)));
        return row;
    }

    /** One message as a chat bubble: user right-tinted, assistant left-neutral. */
    private View messageBubble(WearSnapshotStore.Message message) {
        boolean fromUser = "user".equalsIgnoreCase(message.role);

        LinearLayout outer = new LinearLayout(context);
        outer.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams outerParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        );
        outerParams.setMargins(0, dp(6), 0, 0);
        outer.setLayoutParams(outerParams);

        LinearLayout bubble = new LinearLayout(context);
        bubble.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable shape = rounded(14, fromUser ? WearTheme.userBubble(context) : WearTheme.card(context), WearTheme.border(context), dp(1));
        // one tight corner marks the sender side, like shadcn chat bubbles
        shape.setCornerRadii(cornerRadii(12, 12, fromUser ? 3 : 12, fromUser ? 12 : 3));
        bubble.setBackground(shape);
        bubble.setPadding(dp(9), dp(7), dp(9), dp(7));

        TextView who = bold(fromUser ? "You" : "Jait", 8, WearTheme.mutedForeground(context));
        bubble.addView(who);
        TextView content = text(message.content, 11, WearTheme.foreground(context));
        content.setMaxWidth(dp(118));
        content.setMaxLines(10);
        content.setEllipsize(TextUtils.TruncateAt.END);
        bubble.addView(content);

        LinearLayout holder = new LinearLayout(context);
        holder.setOrientation(LinearLayout.HORIZONTAL);
        holder.setGravity(fromUser ? Gravity.END : Gravity.START);
        holder.addView(bubble, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ));
        outer.addView(holder);

        TextView stamp = text(shortTime(message.createdAt), 8, WearTheme.mutedForeground(context));
        stamp.setGravity(fromUser ? Gravity.END : Gravity.START);
        stamp.setPadding(dp(2), dp(2), dp(2), 0);
        outer.addView(stamp, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ));
        return outer;
    }

    private View typingPill() {
        LinearLayout pill = card(12, 12);
        pill.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout dotHolder = new LinearLayout(context);
        View dot = new View(context);
        dot.setBackground(circle(WearTheme.success(context), dp(4)));
        dotHolder.addView(dot, new LinearLayout.LayoutParams(dp(8), dp(8)));
        pill.addView(dotHolder);
        pill.addView(spacer(dp(7)));
        pill.addView(text("agent is running…", 9, WearTheme.mutedForeground(context)));
        return pill;
    }

    // ------------------------------------------------------------------ filter + navigation

    private View filterBar(List<WearSnapshotStore.Chat> allChats) {
        LinearLayout row = row();
        row.addView(filterChip("All", "all", allChats.size()));
        row.addView(filterChip("Run", "running", byStatus(allChats, "running").size()));
        row.addView(filterChip("Idle", "idle", byStatus(allChats, "idle").size()));
        return row;
    }

    private View filterChip(String label, String value, int count) {
        boolean active = sFilter.equals(value);
        TextView chip = pill(
            label + (count > 0 ? " " + count : ""),
            active ? WearTheme.surfaceActive(context) : WearTheme.card(context),
            active ? WearTheme.foreground(context) : WearTheme.mutedForeground(context)
        );
        if (active) {
            chip.setBackground(rounded(10, WearTheme.surfaceActive(context), WearTheme.primary(context), dp(1)));
        }
        chip.setOnClickListener(v -> {
            sFilter = value;
            this.listener.onChats();
        });
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(dp(3), 0, dp(3), 0);
        chip.setLayoutParams(params);
        return chip;
    }

    private View pageNav(int page, int pageCount, String noun) {
        if (pageCount <= 1) return spacer(dp(4));
        LinearLayout nav = row();
        nav.setGravity(Gravity.CENTER);
        nav.setPadding(0, dp(10), 0, dp(2));

        TextView prev = pill("‹", WearTheme.card(context), WearTheme.foreground(context));
        prev.setOnClickListener(v -> listener.onPage(Math.max(0, page - 1)));
        TextView counter = text((page + 1) + "/" + pageCount + " " + noun, 9, WearTheme.mutedForeground(context));
        LinearLayout.LayoutParams counterParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
        );
        counterParams.setMargins(dp(8), 0, dp(8), 0);
        TextView next = pill("›", WearTheme.card(context), WearTheme.foreground(context));
        next.setOnClickListener(v -> listener.onPage(Math.min(pageCount - 1, page + 1)));

        LinearLayout.LayoutParams pillParams = new LinearLayout.LayoutParams(dp(26), dp(26));
        nav.addView(prev, pillParams);
        nav.addView(counter, counterParams);
        nav.addView(next, pillParams);
        return nav;
    }

    /** Transcript pager: counts back from the newest message (0 = newest). */
    private View newerOlderNav(int page, int pageCount, int total) {
        LinearLayout nav = new LinearLayout(context);
        nav.setOrientation(LinearLayout.HORIZONTAL);
        nav.setGravity(Gravity.CENTER);
        nav.setPadding(0, dp(10), 0, 0);

        TextView older = pill("older ‹", WearTheme.card(context), WearTheme.foreground(context));
        olderButton(older, page, pageCount);
        TextView newer = pill("› newer", WearTheme.card(context), WearTheme.foreground(context));
        newerButton(newer, page);
        TextView counter = text(
            Math.min(total, total - page * MAX_MESSAGES_PER_PAGE) + " of " + total + " shown",
            8,
            WearTheme.mutedForeground(context)
        );
        LinearLayout.LayoutParams counterParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
        );
        counterParams.setMargins(dp(8), 0, dp(8), 0);

        nav.addView(older, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ));
        nav.addView(counter, counterParams);
        nav.addView(newer, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ));
        return nav;
    }

    private void olderButton(TextView button, int page, int pageCount) {
        if (page + 1 < pageCount) {
            button.setOnClickListener(v -> listener.onPage(page + 1));
        } else {
            button.setOnClickListener(null);
            button.setTextColor(WearTheme.mutedForeground(context));
        }
    }

    private void newerButton(TextView button, int page) {
        if (page > 0) {
            button.setOnClickListener(v -> listener.onPage(page - 1));
        } else {
            button.setOnClickListener(null);
            button.setTextColor(WearTheme.mutedForeground(context));
        }
    }

    // ------------------------------------------------------------------ header

    /** Shared header: optional back chip, title (or brand), theme switch, optional refresh. */
    private View header(String title, View.OnClickListener back, boolean withRefresh) {
        LinearLayout row = row();

        if (back != null) {
            TextView backChip = pill("‹", WearTheme.card(context), WearTheme.foreground(context));
            backChip.setBackground(rounded(9, WearTheme.card(context), WearTheme.border(context), dp(1)));
            backChip.setOnClickListener(back);
            row.addView(backChip, new LinearLayout.LayoutParams(dp(26), dp(26)));
            row.addView(spacer(dp(7)));
        }

        if (title == null) {
            LinearLayout brand = new LinearLayout(context);
            brand.setOrientation(LinearLayout.HORIZONTAL);
            brand.setGravity(Gravity.CENTER_VERTICAL);
            TextView logo = new TextView(context);
            logo.setText("J");
            logo.setTextColor(WearTheme.logoForeground(context));
            logo.setTypeface(Typeface.DEFAULT_BOLD);
            logo.setTextSize(10);
            logo.setGravity(Gravity.CENTER);
            logo.setBackground(rounded(8, WearTheme.logoBackground(context), WearTheme.logoForeground(context), dp(1)));
            brand.addView(logo, new LinearLayout.LayoutParams(dp(22), dp(22)));
            brand.addView(spacer(dp(6)));
            brand.addView(bold("Jait", 13, WearTheme.foreground(context)));
            row.addView(brand, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        } else {
            TextView titleView = bold(title, 12, WearTheme.foreground(context));
            titleView.setMaxLines(1);
            titleView.setEllipsize(TextUtils.TruncateAt.END);
            row.addView(titleView, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        }

        row.addView(spacer(dp(6)));
        LinearLayout.LayoutParams switchParams = new LinearLayout.LayoutParams(dp(34), dp(20));
        row.addView(themeSwitch(), switchParams);

        if (withRefresh) {
            row.addView(spacer(dp(6)));
            TextView refresh = pill("↻", WearTheme.card(context), WearTheme.foreground(context));
            refresh.setBackground(rounded(9, WearTheme.card(context), WearTheme.border(context), dp(1)));
            refresh.setOnClickListener(v -> listener.onRefresh());
            row.addView(refresh, new LinearLayout.LayoutParams(dp(26), dp(26)));
        }
        return row;
    }

    /** shadcn Switch-style dark/light toggle; ON = dark. */
    private View themeSwitch() {
        final boolean dark = WearTheme.isDark(context);

        LinearLayout track = new LinearLayout(context);
        track.setOrientation(LinearLayout.HORIZONTAL);
        track.setGravity(Gravity.CENTER_VERTICAL);
        track.setPadding(dp(2), 0, dp(2), 0);
        track.setBackground(rounded(
            11,
            dark ? WearTheme.surfaceActive(context) : WearTheme.mutedForeground(context),
            WearTheme.border(context),
            dp(1)
        ));

        View thumb = new View(context);
        thumb.setBackground(circle(WearTheme.primaryForeground(context), 8));

        LinearLayout thumbHolder = new LinearLayout(context);
        thumbHolder.setOrientation(LinearLayout.HORIZONTAL);
        thumbHolder.setGravity(dark ? Gravity.END : Gravity.START);
        thumbHolder.addView(thumb, new LinearLayout.LayoutParams(dp(16), dp(16)));

        track.addView(thumbHolder, new LinearLayout.LayoutParams(
            0, ViewGroup.LayoutParams.MATCH_PARENT, 1f
        ));
        track.setOnClickListener(v -> this.listener.onToggleTheme());
        track.setContentDescription(dark ? "Switch to light mode" : "Switch to dark mode");
        return track;
    }

    // ------------------------------------------------------------------ layout primitives

    private LinearLayout root() {
        LinearLayout layout = new LinearLayout(context);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(dp(10), dp(8), dp(10), dp(16));
        return layout;
    }

    private ScrollView wrap(LinearLayout body) {
        body.setBackgroundColor(WearTheme.background(context));
        ScrollView scroll = new ScrollView(context);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.addView(body, new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ));
        return scroll;
    }

    private LinearLayout row() {
        LinearLayout layout = new LinearLayout(context);
        layout.setOrientation(LinearLayout.HORIZONTAL);
        layout.setGravity(Gravity.CENTER_VERTICAL);
        return layout;
    }

    private LinearLayout card(int radiusDp, int paddingDp) {
        LinearLayout layout = new LinearLayout(context);
        layout.setOrientation(LinearLayout.HORIZONTAL);
        layout.setGravity(Gravity.CENTER_VERTICAL);
        layout.setBackground(rounded(radiusDp, WearTheme.card(context), WearTheme.border(context), dp(1)));
        layout.setPadding(dp(paddingDp), dp(paddingDp), dp(paddingDp), dp(paddingDp));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(0, dp(6), 0, 0);
        layout.setLayoutParams(params);
        return layout;
    }

    private View dot(int color) {
        View dot = new View(context);
        dot.setBackground(circle(color, 6));
        dot.setLayoutParams(new LinearLayout.LayoutParams(dp(6), dp(6)));
        return dot;
    }

    private View spacer(int size) {
        View spacer = new View(context);
        spacer.setLayoutParams(new LinearLayout.LayoutParams(size, 1));
        return spacer;
    }

    // ------------------------------------------------------------------ drawable + text helpers

    private GradientDrawable rounded(float radiusDp, int fillColor, int strokeColor, int strokePx) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setShape(GradientDrawable.RECTANGLE);
        drawable.setCornerRadius(dp(radiusDp));
        drawable.setColor(fillColor);
        if (strokePx > 0) drawable.setStroke(strokePx, strokeColor);
        return drawable;
    }

    /** Filled circle sized to the view; `sizeDp` is the intended diameter in dp. */
    private GradientDrawable circle(int fillColor, float sizeDp) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setShape(GradientDrawable.OVAL);
        drawable.setColor(fillColor);
        return drawable;
    }

    private float[] cornerRadii(float tl, float tr, float br, float bl) {
        float tlPx = dp(tl);
        float trPx = dp(tr);
        float brPx = dp(br);
        float blPx = dp(bl);
        return new float[]{tlPx, tlPx, trPx, trPx, brPx, brPx, blPx, blPx};
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
        pill.setBackground(rounded(10, fillColor, 0, 0));
        pill.setPadding(dp(9), dp(5), dp(9), dp(5));
        return pill;
    }

    private TextView text(String label, float sizeSp, int color) {
        TextView view = new TextView(context);
        view.setText(label);
        view.setTextColor(color);
        view.setTextSize(sizeSp);
        return view;
    }

    private TextView bold(String label, float sizeSp, int color) {
        TextView view = text(label, sizeSp, color);
        view.setTypeface(Typeface.DEFAULT_BOLD);
        return view;
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private int dp(float value) {
        return Math.max(1, Math.round(TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, value, context.getResources().getDisplayMetrics()
        )));
    }

    // ------------------------------------------------------------------ data helpers

    private int statusColor(String status) {
        String normalized = status == null ? "" : status.toLowerCase(Locale.US);
        switch (normalized) {
            case "running":
            case "active":
                return WearTheme.success(context);
            case "pending":
            case "waiting":
            case "needs_input":
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
                format.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
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

    private String ageAgo(long millis) {
        if (millis <= 0) return "never";
        return relativeSince(millis);
    }

    private String relativeSince(long epochMillis) {
        long delta = System.currentTimeMillis() - epochMillis;
        if (delta < 0) delta = 0;
        long minutes = delta / 60000L;
        if (minutes < 1) return "just now";
        if (minutes < 60) return minutes + "m ago";
        long hours = minutes / 60;
        if (hours < 24) return hours + "h ago";
        return (hours / 24) + "d ago";
    }

    private String shortTime(String iso) {
        Long epoch = parseTimestamp(iso);
        if (epoch == null) return "";
        return new SimpleDateFormat("HH:mm", Locale.US).format(new Date(epoch));
    }
}