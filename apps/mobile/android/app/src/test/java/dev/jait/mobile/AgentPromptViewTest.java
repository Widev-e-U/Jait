package dev.jait.mobile;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.Intent;
import android.graphics.drawable.ColorDrawable;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class AgentPromptViewTest {
    static final String REQUEST = "{\"id\":\"test\",\"title\":\"Quick Q&A test\",\"questions\":[{"
        + "\"id\":\"math\",\"header\":\"Test\",\"question\":\"Which answer is correct: what is 2 + 2?\","
        + "\"options\":[{\"label\":\"3\"},{\"label\":\"4\",\"recommended\":true},{\"label\":\"5\"}]}]}";

    @Test public void fallbackActivityUsesTheCardAsItsOnlyFrame() {
        AgentPromptActivity activity = launchPrompt();
        Window window = activity.getWindow();
        assertTrue(window.hasFeature(Window.FEATURE_NO_TITLE));
        assertEquals(0, ((ColorDrawable) window.getDecorView().getBackground()).getColor());
        ViewGroup content = activity.findViewById(android.R.id.content);
        View card = content.getChildAt(0);
        assertTrue(card instanceof LinearLayout);
        assertEquals(ViewGroup.LayoutParams.WRAP_CONTENT, card.getLayoutParams().height);
        assertNotNull(card.getBackground());
    }

    @Test public void canClearRadioSelectionAndSubmitCustomAnswerWithIme() throws Exception {
        AtomicReference<JSONObject> result = new AtomicReference<>();
        LinearLayout root = (LinearLayout) new AgentPromptView(launchPrompt(), (answers, cancelled) -> {
            assertFalse(cancelled);
            result.set(answers);
        }).build(new JSONObject(REQUEST));
        LinearLayout body = (LinearLayout) answerScroll(root).getChildAt(0);
        LinearLayout question = (LinearLayout) body.getChildAt(0);
        RadioGroup choices = (RadioGroup) question.getChildAt(2);
        RadioButton first = (RadioButton) choices.getChildAt(0);
        RadioButton recommended = (RadioButton) choices.getChildAt(1);
        first.performClick();
        recommended.performClick();
        assertFalse(first.isChecked());
        assertTrue(recommended.isChecked());

        View clear = question.getChildAt(3);
        View write = question.getChildAt(4);
        EditText custom = (EditText) question.getChildAt(5);
        assertEquals(View.GONE, custom.getVisibility());
        write.performClick();
        assertEquals(View.VISIBLE, custom.getVisibility());
        custom.setText("Four");
        assertEquals(View.VISIBLE, clear.getVisibility());
        clear.performClick();
        assertFalse(recommended.isChecked());
        assertEquals(View.GONE, clear.getVisibility());
        assertEquals(EditorInfo.IME_ACTION_SEND, custom.getImeOptions() & EditorInfo.IME_MASK_ACTION);
        custom.onEditorAction(EditorInfo.IME_ACTION_SEND);

        JSONObject answer = result.get().getJSONObject("answers").getJSONObject("math");
        assertEquals(0, answer.getJSONArray("selected").length());
        assertEquals("Four", answer.getString("freeText"));
        assertFalse(answer.getBoolean("skipped"));
    }

    @Test public void hardwareEnterSubmitsOnceOnKeyUp() throws Exception {
        AtomicInteger submissions = new AtomicInteger();
        JSONObject request = new JSONObject(REQUEST);
        request.getJSONArray("questions").getJSONObject(0).remove("options");
        AgentPromptActivity activity = launchPrompt();
        LinearLayout root = (LinearLayout) new AgentPromptView(activity, (result, cancelled) -> {
            assertFalse(cancelled);
            submissions.incrementAndGet();
        }).build(request);
        activity.setContentView(root);
        LinearLayout body = (LinearLayout) answerScroll(root).getChildAt(0);
        LinearLayout question = (LinearLayout) body.getChildAt(0);
        EditText custom = (EditText) question.getChildAt(2);
        custom.requestFocus();
        custom.setText("Four");
        custom.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ENTER));
        assertEquals(0, submissions.get());
        custom.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_ENTER));
        assertEquals(1, submissions.get());
        assertEquals("Four", custom.getText().toString());
    }

    @Test public void longAnswersScrollInsideFixedHeightCard() throws Exception {
        AgentPromptActivity activity = launchPrompt();
        AgentPromptView prompt = new AgentPromptView(activity, (answers, cancelled) -> {});
        JSONObject request = new JSONObject(REQUEST);
        LinearLayout shortCard = (LinearLayout) prompt.build(request);
        request.getJSONArray("questions").getJSONObject(0).getJSONArray("options").getJSONObject(2)
            .put("description", "A line of answer text.\n".repeat(50));
        LinearLayout longCard = (LinearLayout) prompt.build(request);

        measureAndLayout(shortCard, dp(activity, 700));
        measureAndLayout(longCard, dp(activity, 700));
        assertEquals(dp(activity, 440), shortCard.getHeight());
        assertEquals(shortCard.getHeight(), longCard.getHeight());

        ScrollView scroll = answerScroll(longCard);
        View header = longCard.getChildAt(0);
        ViewGroup actions = (ViewGroup) longCard.getChildAt(longCard.getChildCount() - 1);
        int headerTop = header.getTop();
        int actionsTop = actions.getTop();
        assertTrue(scroll.canScrollVertically(1));
        scroll.scrollTo(0, scroll.getChildAt(0).getHeight());
        assertTrue(scroll.getScrollY() > 0);
        assertFalse(scroll.canScrollVertically(1));
        assertEquals(headerTop, header.getTop());
        assertEquals(actionsTop, actions.getTop());
        assertTrue(scroll.getBottom() <= actionsTop);
        assertTrue(actions.getBottom() <= longCard.getHeight());
        assertEquals("Cancel", ((TextView) actions.getChildAt(0)).getText().toString());
        assertEquals("Submit ↵", ((TextView) actions.getChildAt(1)).getText().toString());

        measureAndLayout(longCard, dp(activity, 250));
        assertEquals(dp(activity, 250), longCard.getHeight());
        assertTrue(scroll.getHeight() > 0);
        assertTrue(actions.getBottom() <= longCard.getHeight());
    }

    private static ScrollView answerScroll(LinearLayout card) {
        return (ScrollView) card.getChildAt(2);
    }

    private static void measureAndLayout(View card, int availableHeight) {
        int width = dp(card.getContext(), 320);
        card.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(availableHeight, View.MeasureSpec.AT_MOST));
        card.layout(0, 0, card.getMeasuredWidth(), card.getMeasuredHeight());
    }

    private static int dp(Context context, int value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }

    static AgentPromptActivity launchPrompt() {
        return Robolectric.buildActivity(AgentPromptActivity.class,
            new Intent().putExtra(AgentPromptActivity.EXTRA_REQUEST, REQUEST)).setup().get();
    }
}
