package dev.jait.mobile.common;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.method.LinkMovementMethod;
import android.text.style.ClickableSpan;
import android.text.style.URLSpan;
import android.text.util.Linkify;
import android.view.View;
import android.text.Spannable;
import android.widget.TextView;
import android.widget.Toast;
import androidx.core.text.util.LinkifyCompat;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Link-only formatting shared by the native phone and watch question surfaces. */
public final class QuestionLinks {
    public interface Opener { void open(String url); }
    private static final Pattern MARKDOWN = Pattern.compile("\\[([^\\]]+)\\]\\((https?://[^\\s)]+)\\)");

    private QuestionLinks() {}

    public static void apply(TextView view) {
        apply(view, url -> {
            try {
                view.getContext().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))
                    .addCategory(Intent.CATEGORY_BROWSABLE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (ActivityNotFoundException error) {
                Toast.makeText(view.getContext(), "No app can open this link", Toast.LENGTH_LONG).show();
            }
        });
    }

    public static void apply(TextView view, Opener opener) {
        String source = view.getText().toString();
        SpannableStringBuilder text = new SpannableStringBuilder();
        Matcher matcher = MARKDOWN.matcher(source);
        int end = 0;
        while (matcher.find()) {
            text.append(source, end, matcher.start());
            int start = text.length();
            text.append(matcher.group(1));
            text.setSpan(new URLSpan(matcher.group(2)), start, text.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            end = matcher.end();
        }
        text.append(source, end, source.length());
        // Preserve explicit Markdown destinations while auto-linking bare web addresses.
        URLSpan[] explicit = text.getSpans(0, text.length(), URLSpan.class);
        int[] starts = new int[explicit.length];
        int[] ends = new int[explicit.length];
        for (int i = 0; i < explicit.length; i++) {
            starts[i] = text.getSpanStart(explicit[i]);
            ends[i] = text.getSpanEnd(explicit[i]);
        }
        LinkifyCompat.addLinks(text, Linkify.WEB_URLS);
        for (int i = 0; i < explicit.length; i++) {
            for (URLSpan span : text.getSpans(starts[i], ends[i], URLSpan.class)) text.removeSpan(span);
            text.setSpan(explicit[i], starts[i], ends[i], Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        }
        for (URLSpan span : text.getSpans(0, text.length(), URLSpan.class)) {
            int start = text.getSpanStart(span);
            int finish = text.getSpanEnd(span);
            text.removeSpan(span);
            text.setSpan(new ClickableSpan() {
                @Override public void onClick(View widget) { opener.open(span.getURL()); }
            }, start, finish, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        }
        view.setText(text);
        if (text.getSpans(0, text.length(), ClickableSpan.class).length > 0) {
            view.setMovementMethod(LinkMovementMethod.getInstance());
            // CompoundButton performs its click before TextView's movement handler.
            // Consume touches on links first, keeping radio/checkbox selection unchanged.
            view.setOnTouchListener((widget, event) -> {
                if (!(view.getText() instanceof Spannable) || view.getLayout() == null) return false;
                Spannable buffer = (Spannable) view.getText();
                int offset = view.getOffsetForPosition(event.getX(), event.getY());
                if (buffer.getSpans(offset, offset, ClickableSpan.class).length == 0) return false;
                return LinkMovementMethod.getInstance().onTouchEvent(view, buffer, event);
            });
        }
    }
}
