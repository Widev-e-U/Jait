package dev.jait.mobile.wear;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.CompoundButton;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.ScrollView;
import android.widget.TextView;
import androidx.wear.widget.BoxInsetLayout;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Watch-side agent-question card - a trimmed port of the phone's AgentPromptView, wrapped in a
 * BoxInsetLayout so content clears the curved edge of round watch faces. Produces the same
 * {"answers": {...}} result shape so it can be submitted through the existing gateway endpoint
 * unchanged.
 */
final class WearPromptView {
    interface Listener {
        void onResult(JSONObject result, boolean cancelled);
    }

    interface OpenListener {
        void onOpen(WearRequestStore.Entry entry);
    }

    private final Context context;
    private final Listener listener;
    private final Palette theme;
    private final Map<String, List<CompoundButton>> optionInputs = new LinkedHashMap<>();
    private final Map<String, EditText> freeTextInputs = new LinkedHashMap<>();
    private final List<String> questionIds = new ArrayList<>();

    WearPromptView(Context context, Listener listener) {
        this.context = context;
        this.listener = listener;
        this.theme = new Palette(context);
    }

    /**
     * Instance-style facade over the static {@link WearTheme} shadcn tokens, so view code can read
     * like a stylesheet. `primary` here is foreground text; the brand blue lives on `blue()`.
     */
    private static final class Palette {
        private final Context context;

        Palette(Context context) {
            this.context = context;
        }

        int background() {
            return WearTheme.background(context);
        }

        int primary() {
            return WearTheme.foreground(context);
        }

        int muted() {
            return WearTheme.mutedForeground(context);
        }

        int secondary() {
            return WearTheme.mutedForeground(context);
        }

        int surface() {
            return WearTheme.card(context);
        }

        int border() {
            return WearTheme.border(context);
        }

        /** Focused accent: primary-tinted fill/hairline (web `chip-active`). */
        int borderActive() {
            return WearTheme.surfaceActive(context);
        }

        int blue() {
            return WearTheme.primary(context);
        }

        int onPrimary() {
            return WearTheme.primaryForeground(context);
        }

        int green() {
            return WearTheme.success(context);
        }
    }

    View buildHome(List<WearRequestStore.Entry> entries, OpenListener openListener) {
        int pendingCount = 0;
        for (WearRequestStore.Entry entry : entries) {
            if (entry.isPending()) pendingCount++;
        }

        LinearLayout content = new LinearLayout(context);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(34), dp(28), dp(34), dp(32));

        LinearLayout brand = new LinearLayout(context);
        brand.setOrientation(LinearLayout.HORIZONTAL);
        brand.setGravity(Gravity.CENTER_VERTICAL);

        FrameLayout mark = new FrameLayout(context);
        mark.setBackground(rounded(theme.blue(), 9, theme.blue()));
        ImageView markIcon = new ImageView(context);
        markIcon.setImageResource(R.drawable.ic_jait_mark);
        markIcon.setPadding(dp(7), dp(7), dp(7), dp(7));
        mark.addView(markIcon, new FrameLayout.LayoutParams(dp(34), dp(34), Gravity.CENTER));
        brand.addView(mark, new LinearLayout.LayoutParams(dp(34), dp(34)));

        LinearLayout heading = new LinearLayout(context);
        heading.setOrientation(LinearLayout.VERTICAL);
        TextView title = text("Jait", 18, theme.primary(), true);
        heading.addView(title);
        TextView subtitle = text("Agent inbox", 10, theme.muted(), false);
        heading.addView(subtitle);
        brand.addView(heading, weightedLayoutWrap(1f, 10, 0, 0, 0));

        if (pendingCount > 0) {
            TextView badge = text(String.valueOf(pendingCount), 10, theme.onPrimary(), true);
            badge.setGravity(Gravity.CENTER);
            badge.setBackground(rounded(theme.blue(), 10, Color.TRANSPARENT));
            brand.addView(badge, new LinearLayout.LayoutParams(dp(24), dp(24)));
        }
        content.addView(brand, layoutMatch(0, 0, 0, 18));

        if (entries.isEmpty()) {
            LinearLayout empty = new LinearLayout(context);
            empty.setOrientation(LinearLayout.VERTICAL);
            empty.setGravity(Gravity.CENTER);
            empty.setPadding(dp(14), dp(34), dp(14), dp(34));
            empty.setBackground(rounded(theme.surface(), 18, Color.TRANSPARENT));

            TextView emptyTitle = text("All quiet", 15, theme.primary(), true);
            emptyTitle.setGravity(Gravity.CENTER);
            empty.addView(emptyTitle);
            TextView emptyDetail = text(
                "Questions from your agents will collect here.",
                11,
                theme.muted(),
                false
            );
            emptyDetail.setGravity(Gravity.CENTER);
            emptyDetail.setLineSpacing(0, 1.15f);
            empty.addView(emptyDetail, layoutMatch(8, 8, 8, 0));
            content.addView(empty);
        } else {
            for (WearRequestStore.Entry entry : entries) {
                content.addView(buildInboxCard(entry, openListener), layoutMatch(0, 0, 0, 10));
            }
        }

        ScrollView scrollView = new ScrollView(context);
        scrollView.setFillViewport(true);
        scrollView.setClipToPadding(false);
        scrollView.setBackgroundColor(theme.background());
        scrollView.addView(content, new ScrollView.LayoutParams(
            ScrollView.LayoutParams.MATCH_PARENT,
            ScrollView.LayoutParams.WRAP_CONTENT
        ));

        FrameLayout background = new FrameLayout(context);
        background.setBackgroundColor(theme.background());
        background.addView(scrollView, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ));
        return background;
    }

    private View buildInboxCard(WearRequestStore.Entry entry, OpenListener openListener) {
        LinearLayout card = new LinearLayout(context);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(14), dp(12), dp(14), dp(12));
        card.setBackground(rounded(theme.surface(), 14, Color.TRANSPARENT));

        LinearLayout metadata = new LinearLayout(context);
        metadata.setOrientation(LinearLayout.HORIZONTAL);
        metadata.setGravity(Gravity.CENTER_VERTICAL);

        int stateColor = theme.muted();
        String stateLabel = "Dismissed";
        if (WearRequestStore.STATE_PENDING.equals(entry.state)) {
            stateColor = theme.blue();
            stateLabel = "Needs reply";
        } else if (WearRequestStore.STATE_ANSWERED.equals(entry.state)) {
            stateColor = theme.green();
            stateLabel = "Answered";
        }

        TextView state = text(stateLabel, 10, stateColor, true);
        metadata.addView(state, weightedLayoutWrap(1f, 0, 0, 0, 0));
        TextView age = text(ageLabel(entry.receivedAt, System.currentTimeMillis()), 9, theme.muted(), false);
        metadata.addView(age);
        card.addView(metadata, layoutMatch(0, 0, 0, 7));

        TextView cardTitle = text(entry.title, 13, theme.primary(), true);
        cardTitle.setMaxLines(1);
        card.addView(cardTitle);

        TextView question = text(entry.question, 11, theme.secondary(), false);
        question.setMaxLines(3);
        question.setLineSpacing(0, 1.12f);
        card.addView(question, layoutMatch(0, 5, 0, 0));

        if (entry.isPending()) {
            TextView action = text("Tap to answer  →", 10, theme.blue(), true);
            card.addView(action, layoutMatch(0, 9, 0, 0));
            card.setClickable(true);
            card.setFocusable(true);
            card.setOnClickListener(view -> openListener.onOpen(entry));
        }
        return card;
    }

    static String ageLabel(long receivedAt, long now) {
        if (receivedAt <= 0L || now <= receivedAt) return "now";
        long minutes = (now - receivedAt) / 60_000L;
        if (minutes < 1L) return "now";
        if (minutes < 60L) return minutes + "m";
        long hours = minutes / 60L;
        if (hours < 24L) return hours + "h";
        long days = hours / 24L;
        return days + "d";
    }

    View build(JSONObject request) throws JSONException {
        optionInputs.clear();
        freeTextInputs.clear();
        questionIds.clear();

        LinearLayout root = new LinearLayout(context);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(8), dp(8), dp(8), dp(8));

        TextView title = text(request.optString("title", "Jait needs input"), 15, theme.primary(), true);
        title.setGravity(Gravity.CENTER);
        root.addView(title, layoutMatch(0, 4, 0, 8));

        JSONArray questions = request.optJSONArray("questions");
        if (questions == null || questions.length() == 0) {
            throw new JSONException("questions are required");
        }
        for (int index = 0; index < questions.length(); index++) {
            root.addView(buildQuestion(questions.getJSONObject(index)), layoutMatch(0, 0, 0, 8));
        }

        LinearLayout actions = new LinearLayout(context);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        root.addView(actions, layoutMatch(0, 6, 0, 8));

        Button cancel = button("Cancel", theme.borderActive(), theme.primary());
        cancel.setOnClickListener(view -> dispatch(true));
        actions.addView(cancel, weightedLayout(1f, 0, 0, 4, 0));

        Button submit = button("Send", theme.blue(), theme.onPrimary());
        submit.setOnClickListener(view -> dispatch(false));
        actions.addView(submit, weightedLayout(1f, 4, 0, 0, 0));

        ScrollView scrollView = new ScrollView(context);
        scrollView.setFillViewport(true);
        scrollView.setBackgroundColor(theme.background());
        scrollView.addView(root, new ScrollView.LayoutParams(
            ScrollView.LayoutParams.MATCH_PARENT, ScrollView.LayoutParams.WRAP_CONTENT
        ));

        BoxInsetLayout box = new BoxInsetLayout(context);
        box.setBackgroundColor(theme.background());
        BoxInsetLayout.LayoutParams boxParams = new BoxInsetLayout.LayoutParams(
            BoxInsetLayout.LayoutParams.MATCH_PARENT, BoxInsetLayout.LayoutParams.MATCH_PARENT
        );
        boxParams.boxedEdges = BoxInsetLayout.LayoutParams.BOX_ALL;
        box.addView(scrollView, boxParams);
        return box;
    }

    void cancel() {
        dispatch(true);
    }

    private View buildQuestion(JSONObject question) throws JSONException {
        String questionId = question.getString("id");
        questionIds.add(questionId);

        LinearLayout card = new LinearLayout(context);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(10), dp(10), dp(10), dp(10));
        card.setBackground(rounded(theme.surface(), 10, Color.TRANSPARENT));

        TextView questionText = text(question.optString("question", ""), 12, theme.primary(), false);
        questionText.setLineSpacing(0, 1.1f);
        card.addView(questionText, layoutMatch(0, 0, 0, 6));

        List<CompoundButton> controls = new ArrayList<>();
        JSONArray options = question.optJSONArray("options");
        if (options != null && options.length() > 0) {
            if (question.optBoolean("multiSelect", false)) {
                for (int index = 0; index < options.length(); index++) {
                    CheckBox checkBox = new CheckBox(context);
                    configureOption(checkBox, options.getJSONObject(index));
                    card.addView(checkBox, layoutMatch(0, 2, 0, 2));
                    controls.add(checkBox);
                }
            } else {
                RadioGroup group = new RadioGroup(context);
                group.setOrientation(RadioGroup.VERTICAL);
                for (int index = 0; index < options.length(); index++) {
                    RadioButton radioButton = new RadioButton(context);
                    configureOption(radioButton, options.getJSONObject(index));
                    group.addView(radioButton, layoutMatch(0, 2, 0, 2));
                    controls.add(radioButton);
                }
                card.addView(group);
            }
        }
        optionInputs.put(questionId, controls);

        if (question.optBoolean("allowFreeformInput", true)) {
            EditText freeText = new EditText(context);
            freeText.setHint("Answer...");
            freeText.setHintTextColor(theme.muted());
            freeText.setTextColor(theme.primary());
            freeText.setTextSize(12);
            freeText.setMinLines(1);
            freeText.setPadding(dp(10), dp(8), dp(10), dp(8));
            freeText.setBackground(rounded(theme.surface(), 8, Color.TRANSPARENT));
            card.addView(freeText, layoutMatch(0, 6, 0, 0));
            freeTextInputs.put(questionId, freeText);
        }

        return card;
    }

    private void configureOption(CompoundButton control, JSONObject option) {
        String label = option.optString("label", "");
        control.setText(label);
        control.setTag(label);
        control.setTextColor(theme.primary());
        control.setTextSize(12);
        control.setPadding(dp(4), dp(4), dp(4), dp(4));
        control.setButtonTintList(ColorStateList.valueOf(theme.blue()));
    }

    private void dispatch(boolean cancelled) {
        try {
            JSONObject result = new JSONObject();
            JSONObject answers = new JSONObject();
            for (String questionId : questionIds) {
                JSONObject answer = new JSONObject();
                JSONArray selected = new JSONArray();
                for (CompoundButton control : optionInputs.getOrDefault(questionId, Collections.emptyList())) {
                    if (control.isChecked()) selected.put(String.valueOf(control.getTag()));
                }
                EditText freeTextInput = freeTextInputs.get(questionId);
                String freeText = freeTextInput == null ? "" : freeTextInput.getText().toString().trim();
                answer.put("selected", selected);
                answer.put("freeText", freeText.isEmpty() ? JSONObject.NULL : freeText);
                answer.put("skipped", cancelled || (selected.length() == 0 && freeText.isEmpty()));
                answers.put(questionId, answer);
            }
            result.put("answers", answers);
            listener.onResult(result, cancelled);
        } catch (JSONException error) {
        }
    }

    private TextView text(String value, int size, int color, boolean bold) {
        TextView view = new TextView(context);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        if (bold) view.setTypeface(Typeface.DEFAULT_BOLD);
        return view;
    }

    private Button button(String value, int backgroundColor, int textColor) {
        Button button = new Button(context);
        button.setText(value);
        button.setTextColor(textColor);
        button.setTextSize(11);
        button.setAllCaps(false);
        button.setTypeface(Typeface.DEFAULT_BOLD);
        button.setBackground(rounded(backgroundColor, 9, Color.TRANSPARENT));
        button.setPadding(dp(4), dp(4), dp(4), dp(4));
        return button;
    }

    private GradientDrawable rounded(int color, int radiusDp, int strokeColor) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(radiusDp));
        if (strokeColor != Color.TRANSPARENT) drawable.setStroke(dp(1), strokeColor);
        return drawable;
    }

    private LinearLayout.LayoutParams layoutMatch(int marginStart, int marginTop, int marginEnd, int marginBottom) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(dp(marginStart), dp(marginTop), dp(marginEnd), dp(marginBottom));
        return params;
    }

    private LinearLayout.LayoutParams weightedLayout(
        float weight, int marginStart, int marginTop, int marginEnd, int marginBottom
    ) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(32));
        params.setMargins(dp(marginStart), dp(marginTop), dp(marginEnd), dp(marginBottom));
        params.weight = weight;
        return params;
    }

    private LinearLayout.LayoutParams weightedLayoutWrap(
        float weight, int marginStart, int marginTop, int marginEnd, int marginBottom
    ) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            0, LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(dp(marginStart), dp(marginTop), dp(marginEnd), dp(marginBottom));
        params.weight = weight;
        return params;
    }

    private int dp(int value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }
}
