package dev.jait.mobile;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
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
import androidx.core.content.ContextCompat;
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

        ScrollView scrollView = new ScrollView(context);
        scrollView.setFillViewport(true);
        scrollView.setBackground(
            ContextCompat.getDrawable(context, R.drawable.agent_prompt_card_background)
        );

        LinearLayout root = new LinearLayout(context);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(20), dp(20), dp(18));
        root.setGravity(Gravity.START);
        scrollView.addView(root, new ScrollView.LayoutParams(
            ScrollView.LayoutParams.MATCH_PARENT,
            ScrollView.LayoutParams.WRAP_CONTENT
        ));

        LinearLayout header = new LinearLayout(context);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        root.addView(header, layoutMatch(0, 0, 0, 6));

        FrameLayout mark = new FrameLayout(context);
        mark.setBackground(rounded(Color.WHITE, 10, Color.rgb(228, 231, 235)));
        ImageView markIcon = new ImageView(context);
        markIcon.setImageResource(R.drawable.ic_jait_mark_dark);
        markIcon.setPadding(dp(8), dp(8), dp(8), dp(8));
        mark.addView(markIcon, new FrameLayout.LayoutParams(dp(40), dp(40), Gravity.CENTER));
        header.addView(mark, new LinearLayout.LayoutParams(dp(40), dp(40)));

        LinearLayout heading = new LinearLayout(context);
        heading.setOrientation(LinearLayout.VERTICAL);
        header.addView(heading, weightedLayoutWrap(1f, 12, 0, 0, 0));

        TextView brand = text("JAIT", 10, Color.rgb(96, 165, 250), true);
        brand.setLetterSpacing(0.14f);
        heading.addView(brand);

        TextView title = text(
            AgentQuestionPresentation.titleFor(request.optString("title")),
            18,
            Color.rgb(242, 244, 247),
            true
        );
        heading.addView(title, layoutMatch(0, 2, 0, 0));

        TextView subtitle = text(
            AgentQuestionPresentation.subtitleFor(request.optString("attention", "normal")),
            12,
            Color.rgb(133, 139, 149),
            false
        );
        root.addView(subtitle, layoutMatch(0, 0, 0, 16));

        JSONArray questions = request.optJSONArray("questions");
        if (questions == null || questions.length() == 0) {
            throw new JSONException("questions are required");
        }

        for (int index = 0; index < questions.length(); index++) {
            JSONObject question = questions.getJSONObject(index);
            root.addView(buildQuestion(question), layoutMatch(0, 0, 0, 12));
        }

        LinearLayout actions = new LinearLayout(context);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setGravity(Gravity.END);
        root.addView(actions, layoutMatch(0, 10, 0, 0));

        Button cancel = button("Dismiss", Color.rgb(34, 38, 44), Color.rgb(228, 231, 235));
        cancel.setOnClickListener(view -> dispatch(true));
        actions.addView(cancel, weightedLayout(1f, 0, 0, 5, 0));

        Button submit = button("Submit", Color.rgb(59, 130, 246), Color.WHITE);
        submit.setOnClickListener(view -> dispatch(false));
        actions.addView(submit, weightedLayout(1f, 5, 0, 0, 0));

        return scrollView;
    }

    public void cancel() {
        dispatch(true);
    }

    private View buildQuestion(JSONObject question) throws JSONException {
        String questionId = question.getString("id");
        questionIds.add(questionId);

        LinearLayout card = new LinearLayout(context);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(14), dp(14), dp(14), dp(14));
        card.setBackground(rounded(Color.rgb(24, 26, 31), 10, Color.rgb(52, 57, 66)));

        card.addView(text(
            question.optString("header", "Question"),
            11,
            Color.rgb(174, 180, 189),
            true
        ));

        TextView questionText = text(
            question.optString("question", ""),
            14,
            Color.rgb(242, 244, 247),
            false
        );
        questionText.setLineSpacing(0, 1.15f);
        card.addView(questionText, layoutMatch(0, 4, 0, 10));

        List<CompoundButton> controls = new ArrayList<>();
        JSONArray options = question.optJSONArray("options");
        if (options != null && options.length() > 0) {
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
                    group.addView(radioButton, layoutMatch(0, 3, 0, 3));
                    controls.add(radioButton);
                }
                card.addView(group);
            }
        }
        optionInputs.put(questionId, controls);

        if (question.optBoolean("allowFreeformInput", true)) {
            EditText freeText = new EditText(context);
            freeText.setHint("Type an answer...");
            freeText.setHintTextColor(Color.rgb(104, 111, 121));
            freeText.setTextColor(Color.rgb(242, 244, 247));
            freeText.setTextSize(14);
            freeText.setMinLines(2);
            freeText.setGravity(Gravity.TOP);
            freeText.setPadding(dp(11), dp(9), dp(11), dp(9));
            freeText.setBackground(rounded(Color.rgb(16, 18, 22), 8, Color.rgb(52, 57, 66)));
            card.addView(freeText, layoutMatch(0, 9, 0, 0));
            freeTextInputs.put(questionId, freeText);
        }

        return card;
    }

    private void configureOption(CompoundButton control, JSONObject option) {
        String label = option.optString("label", "");
        String description = option.optString("description", "");
        String recommended = option.optBoolean("recommended", false) ? "  ·  Recommended" : "";
        String visibleText = description.isEmpty()
            ? label + recommended
            : label + recommended + "\n" + description;
        control.setText(visibleText);
        control.setTag(label);
        control.setTextColor(Color.rgb(228, 231, 235));
        control.setTextSize(14);
        control.setPadding(dp(8), dp(8), dp(8), dp(8));
        control.setButtonTintList(android.content.res.ColorStateList.valueOf(Color.rgb(59, 130, 246)));
        control.setBackground(optionBackground());
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
        button.setTypeface(Typeface.DEFAULT_BOLD);
        button.setBackground(rounded(backgroundColor, 11, Color.TRANSPARENT));
        return button;
    }

    private GradientDrawable rounded(int color, int radiusDp, int strokeColor) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(radiusDp));
        if (strokeColor != Color.TRANSPARENT) drawable.setStroke(dp(1), strokeColor);
        return drawable;
    }

    private StateListDrawable optionBackground() {
        StateListDrawable drawable = new StateListDrawable();
        drawable.addState(
            new int[] { android.R.attr.state_checked },
            rounded(Color.rgb(20, 33, 58), 8, Color.rgb(59, 130, 246))
        );
        drawable.addState(
            new int[] {},
            rounded(Color.rgb(19, 21, 25), 8, Color.rgb(52, 57, 66))
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

    private LinearLayout.LayoutParams weightedLayout(
        float weight,
        int marginStart,
        int marginTop,
        int marginEnd,
        int marginBottom
    ) {
        LinearLayout.LayoutParams params = layout(0, dp(48), marginStart, marginTop, marginEnd, marginBottom);
        params.weight = weight;
        return params;
    }

    private LinearLayout.LayoutParams weightedLayoutWrap(
        float weight,
        int marginStart,
        int marginTop,
        int marginEnd,
        int marginBottom
    ) {
        LinearLayout.LayoutParams params = layout(
            0,
            LinearLayout.LayoutParams.WRAP_CONTENT,
            marginStart,
            marginTop,
            marginEnd,
            marginBottom
        );
        params.weight = weight;
        return params;
    }

    private int dp(int value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }
}
