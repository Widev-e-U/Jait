package dev.jait.mobile.wear;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.List;

final class WearDashboardView {
    interface Listener {
        void onHome();
        void onChats();
        void onRequests();
        void onRefresh();
        void onOpenChat(WearSnapshotStore.Chat chat);
        void onOpenRequest(WearRequestStore.Entry entry);
        void onPage(int page);
    }

    private static final int BACKGROUND = Color.rgb(13, 15, 18);
    private static final int SURFACE = Color.rgb(24, 26, 31);
    private static final int SURFACE_ACTIVE = Color.rgb(22, 31, 45);
    private static final int BORDER = Color.rgb(52, 57, 66);
    private static final int PRIMARY = Color.rgb(242, 244, 247);
    private static final int SECONDARY = Color.rgb(174, 180, 189);
    private static final int MUTED = Color.rgb(104, 111, 121);
    private static final int BLUE = Color.rgb(96, 165, 250);
    private static final int GREEN = Color.rgb(74, 222, 128);
    private static final int RED = Color.rgb(248, 113, 113);

    private final Context context;

    WearDashboardView(Context context) {
        this.context = context;
    }

    View buildHome(
        WearSnapshotStore.Snapshot snapshot,
        List<WearRequestStore.Entry> requests,
        Listener listener
    ) {
        int pending = 0;
        for (WearRequestStore.Entry entry : requests) {
            if (entry.isPending()) pending++;
        }

        LinearLayout root = screen(40, 30, 40, 10);
        root.addView(brandHeader(listener), fixedHeight(28, 0, 0, 0, 4));

        LinearLayout metrics = new LinearLayout(context);
        metrics.setOrientation(LinearLayout.HORIZONTAL);
        metrics.addView(
            metric(String.valueOf(snapshot.activeThreads), "ACTIVE", snapshot.activeThreads > 0 ? GREEN : MUTED),
            weightedHeight(1f, 40, 0, 0, 3, 0)
        );
        metrics.addView(
            metric(String.valueOf(pending), "NEEDS REPLY", pending > 0 ? BLUE : MUTED),
            weightedHeight(1f, 40, 3, 0, 0, 0)
        );
        root.addView(metrics, fixedHeight(40, 0, 0, 0, 4));

        String chatsDetail = snapshot.totalThreads == 0
            ? "Recent conversations"
            : snapshot.totalThreads + " chats · " + snapshot.updatedToday + " today";
        root.addView(
            actionRow("Chats", chatsDetail, BLUE, listener::onChats),
            fixedHeight(40, 0, 0, 0, 4)
        );

        String requestsDetail = requests.isEmpty()
            ? "No agent requests yet"
            : requests.size() + " recent · " + pending + " pending";
        root.addView(
            actionRow("Requests", requestsDetail, pending > 0 ? BLUE : SECONDARY, listener::onRequests),
            fixedHeight(40, 0, 0, 0, 4)
        );

        String syncText;
        int syncColor;
        if (snapshot.connected) {
            syncText = "Synced " + WearPromptView.ageLabel(snapshot.syncedAt, System.currentTimeMillis()) + " ago";
            syncColor = MUTED;
        } else {
            syncText = snapshot.error.isEmpty() ? "Tap refresh to sync" : snapshot.error;
            syncColor = RED;
        }
        TextView sync = text(syncText, 9, syncColor, false);
        sync.setGravity(Gravity.CENTER);
        sync.setSingleLine(true);
        root.addView(sync, fixedHeight(13, 0, 0, 0, 0));
        return root;
    }

    View buildChats(WearSnapshotStore.Snapshot snapshot, int page, Listener listener) {
        LinearLayout root = screen(30, 24, 30, 12);
        int pageCount = WearPagination.pageCount(snapshot.chats.size());
        int safePage = WearPagination.clampPage(page, pageCount);
        root.addView(
            pageHeader("Chats", snapshot.activeThreads + " active", listener),
            fixedHeight(30, 0, 0, 0, 5)
        );

        if (snapshot.chats.isEmpty()) {
            root.addView(
                emptyCard(
                    snapshot.connected ? "No chats yet" : "Phone not synced",
                    snapshot.connected ? "Start a conversation in Jait." : snapshot.error
                ),
                fixedHeight(110, 0, 0, 0, 5)
            );
        } else {
            int start = safePage * WearPagination.PAGE_SIZE;
            for (int slot = 0; slot < WearPagination.PAGE_SIZE; slot++) {
                int index = start + slot;
                if (index < snapshot.chats.size()) {
                    WearSnapshotStore.Chat chat = snapshot.chats.get(index);
                    root.addView(
                        chatCard(chat, () -> listener.onOpenChat(chat)),
                        fixedHeight(53, 0, 0, 0, slot == 0 ? 4 : 0)
                    );
                } else {
                    root.addView(new View(context), fixedHeight(53, 0, 0, 0, slot == 0 ? 4 : 0));
                }
            }
            root.addView(new View(context), fixedHeight(5, 0, 0, 0, 0));
        }

        root.addView(pager(safePage, pageCount, listener), fixedHeight(30, 0, 0, 0, 0));
        return root;
    }

    View buildChat(WearSnapshotStore.Chat chat, int page, Listener listener) {
        LinearLayout root = screen(28, 18, 28, 10);
        int pageCount = WearPagination.pageCount(chat.messages.size());
        int safePage = WearPagination.clampPage(page, pageCount);
        root.addView(
            pageHeader(chat.title, statusLabel(chat.status), listener),
            fixedHeight(32, 0, 0, 0, 4)
        );

        TextView provider = text(
            chat.providerId + " · " + chat.messages.size() + " messages",
            9,
            MUTED,
            false
        );
        provider.setGravity(Gravity.CENTER);
        provider.setSingleLine(true);
        root.addView(provider, fixedHeight(16, 0, 0, 0, 4));

        if (chat.messages.isEmpty()) {
            root.addView(
                emptyCard("No messages captured", "This chat has no readable message activity yet."),
                fixedHeight(108, 0, 0, 0, 5)
            );
        } else {
            int start = safePage * WearPagination.PAGE_SIZE;
            for (int slot = 0; slot < WearPagination.PAGE_SIZE; slot++) {
                int index = start + slot;
                if (index < chat.messages.size()) {
                    root.addView(
                        messageCard(chat.messages.get(index)),
                        fixedHeight(52, 0, 0, 0, slot == 0 ? 4 : 0)
                    );
                } else {
                    root.addView(new View(context), fixedHeight(52, 0, 0, 0, slot == 0 ? 4 : 0));
                }
            }
            root.addView(new View(context), fixedHeight(5, 0, 0, 0, 0));
        }

        root.addView(pager(safePage, pageCount, listener), fixedHeight(30, 0, 0, 0, 0));
        return root;
    }

    View buildRequests(List<WearRequestStore.Entry> entries, int page, Listener listener) {
        LinearLayout root = screen(30, 24, 30, 12);
        int pending = 0;
        for (WearRequestStore.Entry entry : entries) {
            if (entry.isPending()) pending++;
        }
        int pageCount = WearPagination.pageCount(entries.size());
        int safePage = WearPagination.clampPage(page, pageCount);
        root.addView(
            pageHeader("Requests", pending + " pending", listener),
            fixedHeight(30, 0, 0, 0, 5)
        );

        if (entries.isEmpty()) {
            root.addView(
                emptyCard("All clear", "Agent questions will appear here."),
                fixedHeight(110, 0, 0, 0, 5)
            );
        } else {
            int start = safePage * WearPagination.PAGE_SIZE;
            for (int slot = 0; slot < WearPagination.PAGE_SIZE; slot++) {
                int index = start + slot;
                if (index < entries.size()) {
                    WearRequestStore.Entry entry = entries.get(index);
                    root.addView(
                        requestCard(entry, () -> listener.onOpenRequest(entry)),
                        fixedHeight(53, 0, 0, 0, slot == 0 ? 4 : 0)
                    );
                } else {
                    root.addView(new View(context), fixedHeight(53, 0, 0, 0, slot == 0 ? 4 : 0));
                }
            }
            root.addView(new View(context), fixedHeight(5, 0, 0, 0, 0));
        }

        root.addView(pager(safePage, pageCount, listener), fixedHeight(30, 0, 0, 0, 0));
        return root;
    }

    private View brandHeader(Listener listener) {
        LinearLayout header = new LinearLayout(context);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);

        FrameLayout logo = new FrameLayout(context);
        logo.setBackground(rounded(Color.WHITE, 8, Color.TRANSPARENT));
        ImageView logoMark = new ImageView(context);
        logoMark.setImageResource(R.drawable.ic_jait_mark_dark);
        logoMark.setPadding(dp(5), dp(5), dp(5), dp(5));
        logo.addView(logoMark, new FrameLayout.LayoutParams(dp(28), dp(28), Gravity.CENTER));
        header.addView(logo, new LinearLayout.LayoutParams(dp(28), dp(28)));

        LinearLayout brandText = new LinearLayout(context);
        brandText.setOrientation(LinearLayout.VERTICAL);
        TextView title = text("Jait", 14, PRIMARY, true);
        title.setSingleLine(true);
        brandText.addView(title);
        TextView subtitle = text("WATCH", 8, BLUE, true);
        subtitle.setLetterSpacing(0.15f);
        brandText.addView(subtitle);
        header.addView(brandText, weightedWrap(1f, 8, 0, 0, 0));

        TextView refresh = text("↻", 18, SECONDARY, false);
        refresh.setGravity(Gravity.CENTER);
        refresh.setBackground(rounded(SURFACE, 12, BORDER));
        refresh.setClickable(true);
        refresh.setFocusable(true);
        refresh.setOnClickListener(view -> listener.onRefresh());
        header.addView(refresh, new LinearLayout.LayoutParams(dp(28), dp(28)));
        return header;
    }

    private View pageHeader(String titleValue, String subtitleValue, Listener listener) {
        LinearLayout header = new LinearLayout(context);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);

        TextView back = text("‹", 22, PRIMARY, false);
        back.setGravity(Gravity.CENTER);
        back.setBackground(rounded(SURFACE, 12, BORDER));
        back.setClickable(true);
        back.setFocusable(true);
        back.setOnClickListener(view -> listener.onHome());
        header.addView(back, new LinearLayout.LayoutParams(dp(28), dp(28)));

        LinearLayout heading = new LinearLayout(context);
        heading.setOrientation(LinearLayout.VERTICAL);
        TextView title = text(titleValue, 13, PRIMARY, true);
        title.setSingleLine(true);
        title.setEllipsize(TextUtils.TruncateAt.END);
        heading.addView(title);
        TextView subtitle = text(subtitleValue, 8, MUTED, false);
        subtitle.setSingleLine(true);
        heading.addView(subtitle);
        header.addView(heading, weightedWrap(1f, 8, 0, 0, 0));
        return header;
    }

    private View metric(String value, String label, int accentColor) {
        LinearLayout card = new LinearLayout(context);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER);
        card.setBackground(rounded(SURFACE, 13, BORDER));

        TextView number = text(value, 17, accentColor, true);
        number.setGravity(Gravity.CENTER);
        card.addView(number);
        TextView caption = text(label, 8, MUTED, true);
        caption.setGravity(Gravity.CENTER);
        caption.setLetterSpacing(0.08f);
        card.addView(caption);
        return card;
    }

    private View actionRow(String titleValue, String subtitleValue, int accentColor, Runnable action) {
        LinearLayout row = new LinearLayout(context);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(12), 0, dp(10), 0);
        row.setBackground(rounded(SURFACE_ACTIVE, 13, Color.rgb(43, 61, 86)));
        row.setClickable(true);
        row.setFocusable(true);
        row.setOnClickListener(view -> action.run());

        LinearLayout labels = new LinearLayout(context);
        labels.setOrientation(LinearLayout.VERTICAL);
        TextView title = text(titleValue, 12, PRIMARY, true);
        labels.addView(title);
        TextView subtitle = text(subtitleValue, 8, MUTED, false);
        subtitle.setSingleLine(true);
        subtitle.setEllipsize(TextUtils.TruncateAt.END);
        labels.addView(subtitle);
        row.addView(labels, weightedWrap(1f, 0, 0, 0, 0));

        TextView arrow = text("›", 20, accentColor, false);
        arrow.setGravity(Gravity.CENTER);
        row.addView(arrow, new LinearLayout.LayoutParams(dp(20), dp(30)));
        return row;
    }

    private View chatCard(WearSnapshotStore.Chat chat, Runnable action) {
        LinearLayout card = baseListCard();
        card.setOnClickListener(view -> action.run());

        LinearLayout top = new LinearLayout(context);
        top.setOrientation(LinearLayout.HORIZONTAL);
        TextView title = text(chat.title, 11, PRIMARY, true);
        title.setSingleLine(true);
        title.setEllipsize(TextUtils.TruncateAt.END);
        top.addView(title, weightedWrap(1f, 0, 0, 0, 0));
        TextView status = text(statusLabel(chat.status), 8, statusColor(chat.status), true);
        top.addView(status);
        card.addView(top);

        String preview = chat.messages.isEmpty()
            ? chat.providerId
            : chat.messages.get(chat.messages.size() - 1).content;
        TextView detail = text(preview, 9, SECONDARY, false);
        detail.setSingleLine(true);
        detail.setEllipsize(TextUtils.TruncateAt.END);
        card.addView(detail, matchWrap(0, 4, 0, 0));
        return card;
    }

    private View requestCard(WearRequestStore.Entry entry, Runnable action) {
        LinearLayout card = baseListCard();
        if (entry.isPending()) {
            card.setOnClickListener(view -> action.run());
        } else {
            card.setClickable(false);
            card.setAlpha(0.75f);
        }

        LinearLayout top = new LinearLayout(context);
        top.setOrientation(LinearLayout.HORIZONTAL);
        TextView title = text(entry.title, 11, PRIMARY, true);
        title.setSingleLine(true);
        title.setEllipsize(TextUtils.TruncateAt.END);
        top.addView(title, weightedWrap(1f, 0, 0, 0, 0));
        String state = entry.isPending()
            ? "REPLY"
            : WearRequestStore.STATE_ANSWERED.equals(entry.state) ? "DONE" : "CLOSED";
        TextView status = text(state, 8, entry.isPending() ? BLUE : MUTED, true);
        top.addView(status);
        card.addView(top);

        TextView detail = text(entry.question, 9, SECONDARY, false);
        detail.setSingleLine(true);
        detail.setEllipsize(TextUtils.TruncateAt.END);
        card.addView(detail, matchWrap(0, 4, 0, 0));
        return card;
    }

    private View messageCard(WearSnapshotStore.Message message) {
        LinearLayout card = new LinearLayout(context);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(10), dp(7), dp(10), dp(7));
        boolean fromUser = "user".equals(message.role);
        card.setBackground(rounded(
            fromUser ? Color.rgb(24, 42, 66) : SURFACE,
            12,
            fromUser ? Color.rgb(48, 85, 132) : BORDER
        ));

        TextView role = text(fromUser ? "YOU" : "JAIT", 8, fromUser ? BLUE : GREEN, true);
        role.setLetterSpacing(0.08f);
        card.addView(role);
        TextView content = text(message.content, 9, PRIMARY, false);
        content.setMaxLines(2);
        content.setEllipsize(TextUtils.TruncateAt.END);
        card.addView(content, matchWrap(0, 3, 0, 0));
        return card;
    }

    private LinearLayout baseListCard() {
        LinearLayout card = new LinearLayout(context);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setPadding(dp(11), dp(7), dp(11), dp(7));
        card.setBackground(rounded(SURFACE, 12, BORDER));
        card.setClickable(true);
        card.setFocusable(true);
        return card;
    }

    private View emptyCard(String titleValue, String detailValue) {
        LinearLayout card = new LinearLayout(context);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER);
        card.setPadding(dp(12), dp(10), dp(12), dp(10));
        card.setBackground(rounded(SURFACE, 14, BORDER));

        TextView title = text(titleValue, 12, PRIMARY, true);
        title.setGravity(Gravity.CENTER);
        card.addView(title);
        TextView detail = text(detailValue == null ? "" : detailValue, 9, MUTED, false);
        detail.setGravity(Gravity.CENTER);
        detail.setMaxLines(2);
        detail.setEllipsize(TextUtils.TruncateAt.END);
        card.addView(detail, matchWrap(0, 5, 0, 0));
        return card;
    }

    private View pager(int page, int pageCount, Listener listener) {
        LinearLayout row = new LinearLayout(context);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);

        TextView previous = pagerButton("‹", page > 0);
        if (page > 0) previous.setOnClickListener(view -> listener.onPage(page - 1));
        row.addView(previous, new LinearLayout.LayoutParams(dp(42), dp(30)));

        TextView indicator = text((page + 1) + " / " + pageCount, 9, MUTED, true);
        indicator.setGravity(Gravity.CENTER);
        row.addView(indicator, weightedWrap(1f, 0, 0, 0, 0));

        TextView next = pagerButton("›", page + 1 < pageCount);
        if (page + 1 < pageCount) next.setOnClickListener(view -> listener.onPage(page + 1));
        row.addView(next, new LinearLayout.LayoutParams(dp(42), dp(30)));
        return row;
    }

    private TextView pagerButton(String label, boolean enabled) {
        TextView button = text(label, 20, enabled ? PRIMARY : Color.rgb(65, 70, 78), false);
        button.setGravity(Gravity.CENTER);
        button.setBackground(rounded(SURFACE, 13, BORDER));
        button.setClickable(enabled);
        button.setFocusable(enabled);
        return button;
    }

    private LinearLayout screen(int left, int top, int right, int bottom) {
        LinearLayout root = new LinearLayout(context);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BACKGROUND);
        root.setPadding(dp(left), dp(top), dp(right), dp(bottom));
        return root;
    }

    private String statusLabel(String status) {
        if ("running".equals(status)) return "RUNNING";
        if ("completed".equals(status)) return "DONE";
        if ("error".equals(status)) return "ERROR";
        if ("interrupted".equals(status)) return "STOPPED";
        return "IDLE";
    }

    private int statusColor(String status) {
        if ("running".equals(status)) return GREEN;
        if ("error".equals(status)) return RED;
        if ("completed".equals(status)) return BLUE;
        return MUTED;
    }

    private TextView text(String value, int size, int color, boolean bold) {
        TextView view = new TextView(context);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        if (bold) view.setTypeface(Typeface.DEFAULT_BOLD);
        return view;
    }

    private GradientDrawable rounded(int color, int radiusDp, int strokeColor) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(radiusDp));
        if (strokeColor != Color.TRANSPARENT) drawable.setStroke(dp(1), strokeColor);
        return drawable;
    }

    private LinearLayout.LayoutParams fixedHeight(
        int height, int marginStart, int marginTop, int marginEnd, int marginBottom
    ) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            dp(height)
        );
        params.setMargins(dp(marginStart), dp(marginTop), dp(marginEnd), dp(marginBottom));
        return params;
    }

    private LinearLayout.LayoutParams weightedHeight(
        float weight,
        int height,
        int marginStart,
        int marginTop,
        int marginEnd,
        int marginBottom
    ) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(height));
        params.weight = weight;
        params.setMargins(dp(marginStart), dp(marginTop), dp(marginEnd), dp(marginBottom));
        return params;
    }

    private LinearLayout.LayoutParams weightedWrap(
        float weight, int marginStart, int marginTop, int marginEnd, int marginBottom
    ) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            0,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.weight = weight;
        params.setMargins(dp(marginStart), dp(marginTop), dp(marginEnd), dp(marginBottom));
        return params;
    }

    private LinearLayout.LayoutParams matchWrap(
        int marginStart, int marginTop, int marginEnd, int marginBottom
    ) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(dp(marginStart), dp(marginTop), dp(marginEnd), dp(marginBottom));
        return params;
    }

    private int dp(int value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }
}
