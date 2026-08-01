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

    private final Context context;
    private final Listener listener;
    private final Map<String, List<CompoundButton>> optionInputs = new LinkedHashMap<>();
    private final Map<String, EditText> freeTextInputs = new LinkedHashMap<>();
    private final List<String> questionIds = new ArrayList<>();

    WearPromptView(Context context, Listener listener) {
        this.context = context;
        this.listener = listener;
    }

    View build(JSONObject request) throws JSONException {
        optionInputs.clear();
        freeTextInputs.clear();
        questionIds.clear();

        LinearLayout root = new LinearLayout(context);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(8), dp(8), dp(8), dp(8));

        TextView title = text(request.optString("title", "Jait needs input"), 15, Color.rgb(248, 250, 252), true);
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

        Button cancel = button("Cancel", Color.rgb(51, 65, 85), Color.rgb(226, 232, 240));
        cancel.setOnClickListener(view -> dispatch(true));
        actions.addView(cancel, weightedLayout(1f, 0, 0, 4, 0));

        Button submit = button("Send", Color.rgb(103, 232, 249), Color.rgb(8, 51, 68));
        submit.setOnClickListener(view -> dispatch(false));
        actions.addView(submit, weightedLayout(1f, 4, 0, 0, 0));

        ScrollView scrollView = new ScrollView(context);
        scrollView.setFillViewport(true);
        scrollView.setBackgroundColor(Color.rgb(8, 16, 29));
        scrollView.addView(root, new ScrollView.LayoutParams(
            ScrollView.LayoutParams.MATCH_PARENT, ScrollView.LayoutParams.WRAP_CONTENT
        ));

        BoxInsetLayout box = new BoxInsetLayout(context);
        box.setBackgroundColor(Color.rgb(8, 16, 29));
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
        card.setPadding(dp(8), dp(8), dp(8), dp(8));
        card.setBackground(rounded(Color.rgb(15, 23, 42), 10, Color.rgb(51, 65, 85)));

        TextView questionText = text(question.optString("question", ""), 12, Color.rgb(226, 232, 240), false);
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
            freeText.setHintTextColor(Color.rgb(100, 116, 139));
            freeText.setTextColor(Color.rgb(248, 250, 252));
            freeText.setTextSize(12);
            freeText.setMinLines(1);
            freeText.setPadding(dp(8), dp(6), dp(8), dp(6));
            freeText.setBackground(rounded(Color.rgb(8, 16, 29), 8, Color.rgb(51, 65, 85)));
            card.addView(freeText, layoutMatch(0, 6, 0, 0));
            freeTextInputs.put(questionId, freeText);
        }

        return card;
    }

    private void configureOption(CompoundButton control, JSONObject option) {
        String label = option.optString("label", "");
        control.setText(label);
        control.setTag(label);
        control.setTextColor(Color.rgb(226, 232, 240));
        control.setTextSize(12);
        control.setPadding(dp(4), dp(4), dp(4), dp(4));
        control.setButtonTintList(ColorStateList.valueOf(Color.rgb(34, 211, 238)));
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

    private int dp(int value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }
}
