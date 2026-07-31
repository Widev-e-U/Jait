package dev.jait.mobile;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.CompoundButton;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.ScrollView;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class AgentPromptActivity extends AppCompatActivity {
    public static final String ACTION_RESULT = "dev.jait.mobile.AGENT_PROMPT_RESULT";
    public static final String ACTION_DISMISS = "dev.jait.mobile.AGENT_PROMPT_DISMISS";
    public static final String EXTRA_REQUEST = "request";
    public static final String EXTRA_REQUEST_ID = "requestId";
    public static final String EXTRA_RESULT = "result";
    public static final String EXTRA_CANCELLED = "cancelled";
    public static final String EXTRA_DIRECT_SUBMIT = "directSubmit";

    private final Map<String, List<CompoundButton>> optionInputs = new LinkedHashMap<>();
    private final Map<String, EditText> freeTextInputs = new LinkedHashMap<>();
    private final List<String> questionIds = new ArrayList<>();
    private String requestId = "";
    private boolean directSubmit;
    private BroadcastReceiver dismissReceiver;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureWindow();
        registerDismissReceiver();
        renderRequest(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        renderRequest(intent);
    }

    private void configureWindow() {
        getWindow().addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON |
            WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
        );
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            );
        }
    }

    private void renderRequest(Intent intent) {
        directSubmit = intent.getBooleanExtra(EXTRA_DIRECT_SUBMIT, false);
        String rawRequest = intent.getStringExtra(EXTRA_REQUEST);
        if (rawRequest == null) {
            finish();
            return;
        }

        try {
            JSONObject request = new JSONObject(rawRequest);
            requestId = request.optString("id", "");
            if (requestId.isEmpty()) {
                finish();
                return;
            }
            NotificationManager notificationManager =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            notificationManager.cancel(notificationId(requestId));
            setContentView(buildContent(request));
        } catch (JSONException error) {
            finish();
        }
    }

    private View buildContent(JSONObject request) throws JSONException {
        optionInputs.clear();
        freeTextInputs.clear();
        questionIds.clear();

        ScrollView scrollView = new ScrollView(this);
        scrollView.setFillViewport(true);
        scrollView.setBackgroundColor(Color.rgb(8, 16, 29));

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(22), dp(26), dp(22), dp(24));
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        scrollView.addView(root, new ScrollView.LayoutParams(
            ScrollView.LayoutParams.MATCH_PARENT,
            ScrollView.LayoutParams.WRAP_CONTENT
        ));

        TextView badge = new TextView(this);
        badge.setText("J");
        badge.setTextColor(Color.rgb(8, 47, 73));
        badge.setTextSize(22);
        badge.setTypeface(Typeface.DEFAULT_BOLD);
        badge.setGravity(Gravity.CENTER);
        badge.setBackground(rounded(Color.rgb(103, 232, 249), 16, Color.TRANSPARENT));
        root.addView(badge, layout(dp(52), dp(52), 0, 0, 0, 14));

        TextView title = text(
            request.optString("title", "Jait needs your input"),
            22,
            Color.rgb(248, 250, 252),
            true
        );
        title.setGravity(Gravity.CENTER);
        root.addView(title, layoutMatch(0, 0, 0, 4));

        TextView subtitle = text(
            "Time-sensitive agent question",
            13,
            Color.rgb(148, 163, 184),
            false
        );
        subtitle.setGravity(Gravity.CENTER);
        root.addView(subtitle, layoutMatch(0, 0, 0, 18));

        JSONArray questions = request.optJSONArray("questions");
        if (questions == null || questions.length() == 0) {
            throw new JSONException("questions are required");
        }

        for (int index = 0; index < questions.length(); index++) {
            JSONObject question = questions.getJSONObject(index);
            root.addView(buildQuestion(question), layoutMatch(0, 0, 0, 12));
        }

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setGravity(Gravity.END);
        root.addView(actions, layoutMatch(0, 10, 0, 0));

        Button cancel = button("Cancel", Color.rgb(51, 65, 85), Color.rgb(226, 232, 240));
        cancel.setOnClickListener(view -> sendResult(true));
        actions.addView(cancel, weightedLayout(1f, 0, 0, 5, 0));

        Button submit = button("Send answer", Color.rgb(103, 232, 249), Color.rgb(8, 51, 68));
        submit.setOnClickListener(view -> sendResult(false));
        actions.addView(submit, weightedLayout(1f, 5, 0, 0, 0));

        return scrollView;
    }

    private View buildQuestion(JSONObject question) throws JSONException {
        String questionId = question.getString("id");
        questionIds.add(questionId);

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(15), dp(15), dp(15), dp(15));
        card.setBackground(rounded(Color.rgb(15, 23, 42), 14, Color.rgb(51, 65, 85)));

        card.addView(text(
            question.optString("header", "Question"),
            15,
            Color.rgb(248, 250, 252),
            true
        ));

        TextView questionText = text(
            question.optString("question", ""),
            14,
            Color.rgb(203, 213, 225),
            false
        );
        questionText.setLineSpacing(0, 1.15f);
        card.addView(questionText, layoutMatch(0, 4, 0, 10));

        List<CompoundButton> controls = new ArrayList<>();
        JSONArray options = question.optJSONArray("options");
        if (options != null && options.length() > 0) {
            if (question.optBoolean("multiSelect", false)) {
                for (int index = 0; index < options.length(); index++) {
                    CheckBox checkBox = new CheckBox(this);
                    configureOption(checkBox, options.getJSONObject(index));
                    card.addView(checkBox, layoutMatch(0, 3, 0, 3));
                    controls.add(checkBox);
                }
            } else {
                RadioGroup group = new RadioGroup(this);
                group.setOrientation(RadioGroup.VERTICAL);
                for (int index = 0; index < options.length(); index++) {
                    RadioButton radioButton = new RadioButton(this);
                    configureOption(radioButton, options.getJSONObject(index));
                    group.addView(radioButton, layoutMatch(0, 3, 0, 3));
                    controls.add(radioButton);
                }
                card.addView(group);
            }
        }
        optionInputs.put(questionId, controls);

        if (question.optBoolean("allowFreeformInput", true)) {
            EditText freeText = new EditText(this);
            freeText.setHint("Type an answer...");
            freeText.setHintTextColor(Color.rgb(100, 116, 139));
            freeText.setTextColor(Color.rgb(248, 250, 252));
            freeText.setTextSize(14);
            freeText.setMinLines(2);
            freeText.setGravity(Gravity.TOP);
            freeText.setPadding(dp(11), dp(9), dp(11), dp(9));
            freeText.setBackground(rounded(Color.rgb(8, 16, 29), 10, Color.rgb(51, 65, 85)));
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
        control.setTextColor(Color.rgb(226, 232, 240));
        control.setTextSize(14);
        control.setPadding(dp(8), dp(8), dp(8), dp(8));
        control.setButtonTintList(android.content.res.ColorStateList.valueOf(Color.rgb(34, 211, 238)));
        control.setBackground(rounded(Color.rgb(17, 28, 48), 10, Color.rgb(51, 65, 85)));
    }

    private void sendResult(boolean cancelled) {
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

            Intent response = new Intent(ACTION_RESULT);
            response.setPackage(getPackageName());
            response.putExtra(EXTRA_REQUEST_ID, requestId);
            response.putExtra(EXTRA_RESULT, result.toString());
            response.putExtra(EXTRA_CANCELLED, cancelled);
            if (directSubmit) submitDirectly(result, cancelled);
            else sendBroadcast(response);
        } catch (JSONException error) {
        }

        NotificationManager notificationManager =
            (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        notificationManager.cancel(notificationId(requestId));
        finish();
    }

    private void submitDirectly(JSONObject result, boolean cancelled) {
        new Thread(() -> {
            try {
                android.content.SharedPreferences prefs = getSharedPreferences("jait-push", MODE_PRIVATE);
                String gatewayUrl = prefs.getString("gatewayUrl", "");
                String authToken = prefs.getString("authToken", "");
                if (gatewayUrl.isEmpty() || authToken.isEmpty()) return;
                String action = cancelled ? "cancel" : "submit";
                URL url = new URL(gatewayUrl + "/api/user-questions/requests/" + requestId + "/" + action);
                HttpURLConnection connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("POST");
                connection.setRequestProperty("Authorization", "Bearer " + authToken);
                connection.setRequestProperty("Content-Type", "application/json");
                connection.setDoOutput(true);
                byte[] body = (cancelled ? "{}" : result.toString()).getBytes(StandardCharsets.UTF_8);
                try (OutputStream output = connection.getOutputStream()) { output.write(body); }
                connection.getResponseCode();
                connection.disconnect();
            } catch (Exception ignored) {
            }
        }, "jait-question-submit").start();
    }

    private void registerDismissReceiver() {
        dismissReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String dismissedRequestId = intent.getStringExtra(EXTRA_REQUEST_ID);
                if (requestId.equals(dismissedRequestId)) finish();
            }
        };
        ContextCompat.registerReceiver(
            this,
            dismissReceiver,
            new IntentFilter(ACTION_DISMISS),
            ContextCompat.RECEIVER_NOT_EXPORTED
        );
    }

    @Override
    public void onBackPressed() {
        sendResult(true);
    }

    @Override
    protected void onDestroy() {
        if (dismissReceiver != null) {
            unregisterReceiver(dismissReceiver);
            dismissReceiver = null;
        }
        super.onDestroy();
    }

    public static int notificationId(String requestId) {
        return 0x4a17 ^ requestId.hashCode();
    }

    private TextView text(String value, int size, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        if (bold) view.setTypeface(Typeface.DEFAULT_BOLD);
        return view;
    }

    private Button button(String value, int backgroundColor, int textColor) {
        Button button = new Button(this);
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

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
