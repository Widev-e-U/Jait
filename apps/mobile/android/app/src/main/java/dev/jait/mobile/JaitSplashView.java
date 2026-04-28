package dev.jait.mobile;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.os.SystemClock;
import android.view.View;
import android.view.animation.OvershootInterpolator;

final class JaitSplashView extends View {
    private static final int BACKGROUND = Color.rgb(9, 9, 11);
    private static final int FOREGROUND = Color.WHITE;
    private static final int GLOW = Color.rgb(96, 165, 250);

    private final Paint logoPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint glowPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path chevronPath = new Path();
    private final Path stemPath = new Path();
    private ValueAnimator introAnimator;
    private float entranceProgress = 0f;

    JaitSplashView(Context context) {
        super(context);
        setBackgroundColor(BACKGROUND);
        setClickable(true);

        logoPaint.setColor(FOREGROUND);
        logoPaint.setStyle(Paint.Style.STROKE);
        logoPaint.setStrokeWidth(88f);
        logoPaint.setStrokeCap(Paint.Cap.ROUND);
        logoPaint.setStrokeJoin(Paint.Join.ROUND);

        glowPaint.setColor(GLOW);
        glowPaint.setStyle(Paint.Style.FILL);

        chevronPath.moveTo(318f, 372f);
        chevronPath.lineTo(430f, 486f);
        chevronPath.lineTo(318f, 600f);

        stemPath.moveTo(610f, 258f);
        stemPath.lineTo(610f, 642f);
        stemPath.cubicTo(610f, 734f, 549f, 796f, 455f, 796f);
        stemPath.cubicTo(393f, 796f, 338f, 766f, 299f, 715f);
    }

    void startIntro() {
        introAnimator = ValueAnimator.ofFloat(0f, 1f);
        introAnimator.setDuration(920L);
        introAnimator.setInterpolator(new OvershootInterpolator(0.9f));
        introAnimator.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() {
            @Override
            public void onAnimationUpdate(ValueAnimator animation) {
                entranceProgress = (Float) animation.getAnimatedValue();
                invalidate();
            }
        });
        introAnimator.start();
    }

    @Override
    protected void onDetachedFromWindow() {
        if (introAnimator != null) {
            introAnimator.cancel();
            introAnimator = null;
        }
        super.onDetachedFromWindow();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);

        int width = getWidth();
        int height = getHeight();
        if (width <= 0 || height <= 0) return;

        float progress = clamp(entranceProgress, 0f, 1f);
        float boxSize = Math.min(Math.min(width, height) * 0.82f, dp(360f));
        float baseScale = boxSize / 1024f;
        float pulse = (float) ((Math.sin(SystemClock.uptimeMillis() / 260.0) + 1.0) * 0.5);
        float logoScale = baseScale * (0.98f + progress * 0.02f);
        float travel = 1f - entranceProgress;

        glowPaint.setAlpha((int) (38 + pulse * 44));
        canvas.drawCircle(width / 2f, height / 2f, boxSize * (0.28f + pulse * 0.035f), glowPaint);

        int logoAlpha = (int) (255f * clamp(progress * 1.35f, 0.12f, 1f));
        drawPart(
            canvas,
            chevronPath,
            -width * 0.62f * travel,
            height * 0.18f * travel,
            -16f * travel,
            logoScale,
            logoAlpha
        );
        drawPart(
            canvas,
            stemPath,
            width * 0.58f * travel,
            -height * 0.24f * travel,
            12f * travel,
            logoScale,
            logoAlpha
        );

        if (getAlpha() > 0f) {
            postInvalidateOnAnimation();
        }
    }

    private void drawPart(Canvas canvas, Path path, float offsetX, float offsetY, float rotation, float scale, int alpha) {
        canvas.save();
        canvas.translate(getWidth() / 2f + offsetX, getHeight() / 2f + offsetY);
        canvas.scale(scale, scale);
        canvas.rotate(rotation);
        canvas.translate(-512f, -512f);
        logoPaint.setAlpha(alpha);
        canvas.drawPath(path, logoPaint);
        canvas.restore();
    }

    private float dp(float value) {
        return value * getResources().getDisplayMetrics().density;
    }

    private static float clamp(float value, float min, float max) {
        return Math.max(min, Math.min(max, value));
    }
}
