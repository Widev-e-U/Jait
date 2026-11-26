package dev.jait.mobile;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.graphics.drawable.StateListDrawable;
import android.os.Build;
import android.text.InputType;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.BackgroundColorSpan;
import android.text.style.ForegroundColorSpan;
import android.text.style.RelativeSizeSpan;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.CompoundButton;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.ScrollView;
import android.widget.TextView;
import androidx.core.content.ContextCompat;
import dev.jait.mobile.common.QuestionLinks;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Builds the native agent-question card UI. Shared by AgentPromptActivity (shown when the
 * screen is locked or the user taps a notification) and AgentOverlayWindow (shown directly as
 * a system overlay when the screen is unlocked), so both present an identical card.
 */
public class AgentPromptView {
    public interface Listener {
        void onResult(JSONObject result, boolean cancelled);
    }

    private static final int CARD_HEIGHT_DP = 440;
    private static final int FOREGROUND = 0xfff3f5f7;
    private static final int MUTED = 0xffa0a7b3;
    private static final int BORDER = 0xff363b45;
    private static final int DIVIDER = 0xff2b2f38;
    private static final int INPUT = 0xff101114;
    private static final int PRIMARY = 0xff3c83f6;
    private static final int BADGE = 0xff262a32;

    private final Context context;
    private final Listener listener;
    private final Map<String, List<CompoundButton>> optionInputs = new LinkedHashMap<>();
    private final Map<String, EditText> freeTextInputs = new LinkedHashMap<>();
    private final List<String> questionIds = new ArrayList<>();

    public AgentPromptView(Context context, Listener listener) {
        this.context = context;
        this.listener = listener;
    }

    public View build(JSONObject request) throws JSONException {
        optionInputs.clear();
        freeTextInputs.clear();
        questionIds.clear();

        LinearLayout root = new LinearLayout(context) {
            @Override
            protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
                // Keep the card height independent of its content and shrink in a smaller window.
                int height = View.resolveSize(dp(CARD_HEIGHT_DP), heightMeasureSpec);
                super.onMeasure(widthMeasureSpec, MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY));
            }
        };
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackground(ContextCompat.getDrawable(context, R.drawable.agent_prompt_card_background));
        root.setClipToOutline(true);
        root.setFocusableInTouchMode(true);
        root.setPadding(dp(1), dp(1), dp(1), dp(1));

        LinearLayout header = new LinearLayout(context);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(14), dp(10), dp(14), dp(10));
        root.addView(header, layoutMatch(0, 0, 0, 0));

        ImageView icon = new ImageView(context);
        icon.setImageResource(R.drawable.ic_agent_question);
        icon.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        header.addView(icon, new LinearLayout.LayoutParams(dp(18), dp(18)));

        TextView title = text(AgentQuestionPresentation.titleFor(request.optString("title")), 14, FOREGROUND, true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) title.setAccessibilityHeading(true);
        LinearLayout.LayoutParams titleParams = layout(0, LinearLayout.LayoutParams.WRAP_CONTENT, 8, 0, 0, 0);
        titleParams.weight = 1;
        header.addView(title, titleParams);

        if ("urgent".equals(request.optString("attention"))) {
            TextView urgent = text("Urgent", 11, 0xfff7ce82, true);
            urgent.setPadding(dp(6), dp(2), dp(6), dp(2));
            urgent.setBackground(rounded(0xff392b1b, 5, Color.TRANSPARENT));
            header.addView(urgent, layout(LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT, 8, 0, 0, 0));
        }
        addDivider(root);

        JSONArray questions = request.optJSONArray("questions");
        if (questions == null || questions.length() == 0) {
            throw new JSONException("questions are required");
        }

        ScrollView scrollView = new ScrollView(context);
        scrollView.setScrollbarFadingEnabled(false);
        root.addView(scrollView, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

        LinearLayout body = new LinearLayout(context);
        body.setOrientation(LinearLayout.VERTICAL);
        scrollView.addView(body, new ScrollView.LayoutParams(
            ScrollView.LayoutParams.MATCH_PARENT,
            ScrollView.LayoutParams.WRAP_CONTENT
        ));

        for (int index = 0; index < questions.length(); index++) {
            JSONObject question = questions.getJSONObject(index);
            body.addView(buildQuestion(question), layoutMatch(0, 0, 0, 0));
        }

        addDivider(root);
        LinearLayout actions = new LinearLayout(context);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
        actions.setPadding(dp(10), dp(4), dp(10), dp(4));
        root.addView(actions, layoutMatch(0, 0, 0, 0));

        Button cancel = button("Cancel", Color.TRANSPARENT, MUTED);
        cancel.setOnClickListener(view -> dispatch(true));
        actions.addView(cancel);

        Button submit = button("Submit ↵", PRIMARY, Color.WHITE);
        submit.setContentDescription("Submit");
        submit.setOnClickListener(view -> dispatch(false));
        actions.addView(submit, layout(LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT, 4, 0, 0, 0));

        return root;
    }

    public void cancel() {
        dispatch(true);
    }

    private View buildQuestion(JSONObject question) throws JSONException {
        String questionId = question.getString("id");
        questionIds.add(questionId);

        LinearLayout card = new LinearLayout(context);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(12), dp(12), dp(12), dp(8));

        card.addView(text(
            question.optString("header", "Question"),
            14,
            FOREGROUND,
            true
        ));

        TextView questionText = text(
            question.optString("question", ""),
            13,
            MUTED,
            false
        );
        QuestionLinks.apply(questionText);
        questionText.setLineSpacing(0, 1.15f);
        card.addView(questionText, layoutMatch(0, 4, 0, 10));

        List<CompoundButton> controls = new ArrayList<>();
        JSONArray options = question.optJSONArray("options");
        boolean hasOptions = options != null && options.length() > 0;
        if (hasOptions) {
            if (question.optBoolean("multiSelect", false)) {
                for (int index = 0; index < options.length(); index++) {
                    CheckBox checkBox = new CheckBox(context);
                    configureOption(checkBox, options.getJSONObject(index));
                    card.addView(checkBox, layoutMatch(0, 3, 0, 3));
                    controls.add(checkBox);
                }
            } else {
                RadioGroup group = new RadioGroup(context);
                group.setOrientation(RadioGroup.VERTICAL);
                for (int index = 0; index < options.length(); index++) {
                    RadioButton radioButton = new RadioButton(context);
                    configureOption(radioButton, options.getJSONObject(index));
                    RadioGroup.LayoutParams params = new RadioGroup.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
                    );
                    params.setMargins(0, dp(3), 0, dp(3));
                    group.addView(radioButton, params);
                    controls.add(radioButton);
                }
                card.addView(group);
                Button clear = button("Clear selection", Color.TRANSPARENT, MUTED);
                clear.setVisibility(View.GONE);
                clear.setOnClickListener(view -> group.clearCheck());
                group.setOnCheckedChangeListener((radioGroup, checkedId) ->
                    clear.setVisibility(checkedId == View.NO_ID ? View.GONE : View.VISIBLE));
                card.addView(clear, layout(LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT, 0, 0, 0, 0));
            }
        }
        optionInputs.put(questionId, controls);

        if (question.optBoolean("allowFreeformInput", true)) {
            EditText freeText = new EditText(context);
            freeText.setHint(hasOptions ? "Or write your own answer…" : "Type your answer…");
            freeText.setHintTextColor(MUTED);
            freeText.setTextColor(FOREGROUND);
            freeText.setTextSize(14);
            freeText.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
            freeText.setHorizontallyScrolling(false);
            freeText.setMinLines(2);
            freeText.setMaxLines(4);
            freeText.setImeOptions(EditorInfo.IME_ACTION_SEND);
            freeText.setOnEditorActionListener((view, actionId, event) -> {
                if (event != null) {
                    int keyCode = event.getKeyCode();
                    if (keyCode != KeyEvent.KEYCODE_ENTER && keyCode != KeyEvent.KEYCODE_NUMPAD_ENTER) {
                        return false;
                    }
                    if (event.getAction() != KeyEvent.ACTION_UP || event.isCanceled()) return true;
                } else if (actionId != EditorInfo.IME_ACTION_SEND) {
                    return false;
                }
                dispatch(false);
                return true;
            });
            freeText.setGravity(Gravity.TOP | Gravity.START);
            freeText.setPadding(dp(11), dp(9), dp(11), dp(9));
            freeText.setBackground(rounded(INPUT, 8, BORDER));
            if (hasOptions) {
                freeText.setVisibility(View.GONE);
                Button write = button("Write another answer", Color.TRANSPARENT, MUTED);
                write.setOnClickListener(view -> {
                    freeText.setVisibility(View.VISIBLE);
                    write.setVisibility(View.GONE);
                    if (freeText.requestFocus()) {
                        InputMethodManager keyboard = (InputMethodManager) context.getSystemService(Context.INPUT_METHOD_SERVICE);
                        if (keyboard != null) {
                            freeText.post(() -> keyboard.showSoftInput(freeText, InputMethodManager.SHOW_IMPLICIT));
                        }
                    }
                });
                card.addView(write, layout(LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT, 0, 0, 0, 0));
            }
            card.addView(freeText, layoutMatch(0, 6, 0, 4));
            freeTextInputs.put(questionId, freeText);
        }

        return card;
    }

    private void configureOption(CompoundButton control, JSONObject option) {
        String label = option.optString("label", "");
        String description = option.optString("description", "");
        String badge = option.optBoolean("recommended", false) ? "  Recommended  " : "";
        String heading = badge.isEmpty() ? label : label + "   " + badge;
        SpannableString visibleText = new SpannableString(description.isEmpty() ? heading : heading + "\n" + description);
        if (!badge.isEmpty()) {
            int start = heading.length() - badge.length();
            visibleText.setSpan(new BackgroundColorSpan(BADGE), start, heading.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            visibleText.setSpan(new RelativeSizeSpan(0.82f), start, heading.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        }
        if (!description.isEmpty()) {
            visibleText.setSpan(new ForegroundColorSpan(MUTED), heading.length() + 1, visibleText.length(),
                Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        }
        control.setText(visibleText);
        control.setTag(label);
        QuestionLinks.apply(control);
        control.setTextColor(FOREGROUND);
        control.setTextSize(13);
        control.setMinHeight(dp(44));
        control.setGravity(Gravity.CENTER_VERTICAL | Gravity.START);
        control.setPaddingRelative(dp(12), dp(6), dp(12), dp(6));
        control.setCompoundDrawablePadding(dp(8));
        control.setButtonTintList(new ColorStateList(
            new int[][] { { android.R.attr.state_checked }, {} }, new int[] { PRIMARY, MUTED }
        ));
        control.setBackground(touchFeedback(optionBackground(), 8));
    }

    private void addDivider(LinearLayout parent) {
        View divider = new View(context);
        divider.setBackgroundColor(DIVIDER);
        parent.addView(divider, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(1)));
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
        button.setTextSize(13);
        button.setAllCaps(false);
        button.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        button.setMinimumWidth(0);
        button.setMinWidth(0);
        button.setMinimumHeight(dp(44));
        button.setMinHeight(dp(44));
        button.setPaddingRelative(dp(12), dp(6), dp(12), dp(6));
        button.setBackground(touchFeedback(rounded(backgroundColor, 8, Color.TRANSPARENT), 8));
        return button;
    }

    private GradientDrawable rounded(int color, int radiusDp, int strokeColor) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(radiusDp));
        if (strokeColor != Color.TRANSPARENT) drawable.setStroke(dp(1), strokeColor);
        return drawable;
    }

    private RippleDrawable touchFeedback(Drawable background, int radiusDp) {
        return new RippleDrawable(ColorStateList.valueOf(0x20ffffff), background,
            rounded(Color.WHITE, radiusDp, Color.TRANSPARENT));
    }

    private StateListDrawable optionBackground() {
        StateListDrawable drawable = new StateListDrawable();
        drawable.addState(
            new int[] { android.R.attr.state_checked },
            rounded(0xff1a2537, 8, 0xff4b6d9e)
        );
        drawable.addState(
            new int[] {},
            rounded(INPUT, 8, BORDER)
        );
        return drawable;
    }

    private LinearLayout.LayoutParams layout(
        int width,
        int height,
        int marginStart,
        int marginTop,
        int marginEnd,
        int marginBottom
    ) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(width, height);
        params.setMargins(dp(marginStart), dp(marginTop), dp(marginEnd), dp(marginBottom));
        return params;
    }

    private LinearLayout.LayoutParams layoutMatch(
        int marginStart,
        int marginTop,
        int marginEnd,
        int marginBottom
    ) {
        return layout(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
            marginStart,
            marginTop,
            marginEnd,
            marginBottom
        );
    }

    private int dp(int value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }
}
