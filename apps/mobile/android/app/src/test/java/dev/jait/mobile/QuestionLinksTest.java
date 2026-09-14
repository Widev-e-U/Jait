package dev.jait.mobile;

import static org.junit.Assert.*;
import android.app.Activity;
import android.text.Spanned;
import android.text.style.ClickableSpan;
import android.view.MotionEvent;
import android.view.View;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.TextView;
import dev.jait.mobile.common.QuestionLinks;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
public class QuestionLinksTest {
    @Test public void formatsMarkdownAndBareLinksWithCorrectDestinations() {
        Activity activity = Robolectric.buildActivity(Activity.class).setup().get();
        TextView text = new TextView(activity);
        text.setText("Read [guide](https://example.com/guide) or https://example.com/plain");
        AtomicReference<String> opened = new AtomicReference<>();
        QuestionLinks.apply(text, opened::set);
        assertEquals("Read guide or https://example.com/plain", text.getText().toString());
        ClickableSpan[] links = ((Spanned) text.getText()).getSpans(0, text.length(), ClickableSpan.class);
        assertEquals(2, links.length);
        for (ClickableSpan link : links) {
            link.onClick(text);
            assertTrue(opened.get().startsWith("https://example.com/"));
        }
    }

    @Test public void tappingAnOptionLinkDoesNotSelectTheRadioButton() {
        Activity activity = Robolectric.buildActivity(Activity.class).setup().get();
        RadioGroup group = new RadioGroup(activity);
        RadioButton option = new RadioButton(activity);
        option.setText("Read [guide](https://example.com/guide)");
        AtomicReference<String> opened = new AtomicReference<>();
        QuestionLinks.apply(option, opened::set);
        group.addView(option);
        activity.setContentView(group);
        group.measure(View.MeasureSpec.makeMeasureSpec(500, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(200, View.MeasureSpec.EXACTLY));
        group.layout(0, 0, 500, 200);
        int offset = option.getText().toString().indexOf("guide") + 2;
        float x = option.getTotalPaddingLeft() + option.getLayout().getPrimaryHorizontal(offset);
        float y = option.getTotalPaddingTop() + option.getLayout().getLineBottom(0) / 2f;
        touch(option, x, y);
        assertEquals("https://example.com/guide", opened.get());
        assertFalse(option.isChecked());
        option.performClick();
        assertTrue(option.isChecked());
    }

    private static void touch(View view, float x, float y) {
        for (int action : new int[]{MotionEvent.ACTION_DOWN, MotionEvent.ACTION_UP}) {
            MotionEvent event = MotionEvent.obtain(0, 10, action, x, y, 0);
            view.dispatchTouchEvent(event);
            event.recycle();
        }
    }
}
