package dev.jait.mobile;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.ViewGroup;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    private static final long SPLASH_MIN_VISIBLE_MS = 1100L;

    private JaitSplashView splashView;
    private WebViewListener splashWebViewListener;
    private long splashShownAt;
    private boolean webViewFinishedLoading;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerSplashDismissal();
        super.onCreate(savedInstanceState);
        showAnimatedSplash();
        if (webViewFinishedLoading) {
            hideAnimatedSplash();
        }
    }

    @Override
    public void onDestroy() {
        removeSplashListener();
        super.onDestroy();
    }

    private void showAnimatedSplash() {
        splashShownAt = SystemClock.uptimeMillis();
        splashView = new JaitSplashView(this);
        getWindow().addContentView(
            splashView,
            new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );
        splashView.startIntro();
    }

    private void registerSplashDismissal() {
        splashWebViewListener = new WebViewListener() {
            @Override
            public void onPageLoaded(WebView webView) {
                webViewFinishedLoading = true;
                hideAnimatedSplash();
            }

            @Override
            public void onReceivedError(WebView webView) {
                webViewFinishedLoading = true;
                hideAnimatedSplash();
            }

            @Override
            public void onReceivedHttpError(WebView webView) {
                webViewFinishedLoading = true;
                hideAnimatedSplash();
            }
        };
        bridgeBuilder.addWebViewListener(splashWebViewListener);
    }

    private void hideAnimatedSplash() {
        removeSplashListener();

        final JaitSplashView view = splashView;
        if (view == null) return;
        splashView = null;

        long elapsed = SystemClock.uptimeMillis() - splashShownAt;
        long remaining = Math.max(0L, SPLASH_MIN_VISIBLE_MS - elapsed);
        view.postDelayed(new Runnable() {
            @Override
            public void run() {
                view.animate()
                    .alpha(0f)
                    .setDuration(220L)
                    .setListener(new AnimatorListenerAdapter() {
                        @Override
                        public void onAnimationEnd(Animator animation) {
                            ViewGroup parent = (ViewGroup) view.getParent();
                            if (parent != null) {
                                parent.removeView(view);
                            }
                        }
                    })
                    .start();
            }
        }, remaining);
    }

    private void removeSplashListener() {
        if (splashWebViewListener == null || getBridge() == null) return;
        getBridge().removeWebViewListener(splashWebViewListener);
        splashWebViewListener = null;
    }
}
