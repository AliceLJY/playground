package com.alice.phonekb;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.view.MotionEvent;
import android.view.View;

/** 满屏键盘：上面一条状态栏，下面五行键。 */
public final class KeyboardView extends View {

    public interface Listener {
        void onReport(byte[] report);
        void onKeyTap();
        void onStatusBarTap();
    }

    private static final int BG = 0xFF14171F;
    private static final int KEY = 0xFF2A2F3B;
    private static final int KEY_MOD = 0xFF3A4152;
    private static final int KEY_DOWN = 0xFF5B8DEF;
    private static final int KEY_LATCHED = 0xFF3F5E9E;
    private static final int TEXT = 0xFFE8ECF4;
    private static final int TEXT_DIM = 0xFF8A93A6;
    private static final int OK = 0xFF4CC38A;
    private static final int WARN = 0xFFF0A04B;

    private final KeyState state = new KeyState();
    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF rect = new RectF();
    private final float density;

    private Listener listener;
    private String status = "正在启动蓝牙…";
    private boolean connected = false;

    private float barH, gap, unitW, unitH, padX, top;

    public KeyboardView(Context ctx) {
        super(ctx);
        density = ctx.getResources().getDisplayMetrics().density;
        text.setTextAlign(Paint.Align.CENTER);
        setBackgroundColor(BG);
    }

    public void setListener(Listener l) { listener = l; }

    public void setStatus(String s, boolean ok) {
        status = s;
        connected = ok;
        invalidate();
    }

    /** 失焦、断连时把所有键松开，免得 iPad 那边一直认为某键按着。 */
    public void releaseAll() {
        state.clear();
        emit();
        invalidate();
    }

    @Override
    protected void onSizeChanged(int w, int h, int ow, int oh) {
        barH = 34 * density;
        gap = 4 * density;
        padX = 6 * density;
        top = barH;
        unitW = (w - 2 * padX) / Layout.WIDTH;
        unitH = (h - top - gap) / Layout.ROWS;
    }

    @Override
    protected void onDraw(Canvas c) {
        // 状态栏
        fill.setColor(connected ? OK : WARN);
        c.drawCircle(padX + 10 * density, barH / 2, 5 * density, fill);
        text.setTextAlign(Paint.Align.LEFT);
        text.setColor(TEXT);
        text.setTextSize(14 * density);
        c.drawText(status, padX + 22 * density, barH / 2 + 5 * density, text);
        text.setTextAlign(Paint.Align.RIGHT);
        text.setColor(TEXT_DIM);
        text.setTextSize(12 * density);
        c.drawText("点这里：配对 / 连接", getWidth() - padX, barH / 2 + 4 * density, text);
        text.setTextAlign(Paint.Align.CENTER);

        boolean shift = state.shiftActive();
        int latched = state.latched();
        for (Layout.Key k : Layout.keys()) {
            rect.set(padX + k.x * unitW + gap / 2, top + k.y * unitH + gap / 2,
                    padX + (k.x + k.w) * unitW - gap / 2, top + (k.y + k.h) * unitH - gap / 2);
            int color;
            if (state.isHeld(k)) color = KEY_DOWN;
            else if (k.kind == Layout.KIND_MODIFIER && (latched & k.modBit) != 0) color = KEY_LATCHED;
            else if (k.kind != Layout.KIND_NORMAL || k.label.length() > 1) color = KEY_MOD;
            else color = KEY;
            fill.setColor(color);
            float r = 7 * density;
            c.drawRoundRect(rect, r, r, fill);

            String label = shift ? k.shiftLabel : k.label;
            if (label.isEmpty()) continue;
            boolean small = label.length() > 1 && !label.equals("中/英");
            text.setColor(TEXT);
            text.setTextSize(Math.min(unitH * (small ? 0.30f : 0.42f), 26 * density));
            float ty = rect.centerY() - (text.descent() + text.ascent()) / 2;
            c.drawText(label, rect.centerX(), ty, text);
        }
    }

    private Layout.Key keyAt(float px, float py) {
        if (py < top) return null;
        return Layout.hit((px - padX) / unitW, (py - top) / unitH);
    }

    @Override
    public boolean onTouchEvent(MotionEvent e) {
        int action = e.getActionMasked();
        int idx = e.getActionIndex();
        int id = e.getPointerId(idx);
        switch (action) {
            case MotionEvent.ACTION_DOWN:
            case MotionEvent.ACTION_POINTER_DOWN: {
                float x = e.getX(idx), y = e.getY(idx);
                if (y < top) {
                    if (action == MotionEvent.ACTION_DOWN && listener != null) listener.onStatusBarTap();
                    return true;
                }
                Layout.Key k = keyAt(x, y);
                if (k != null) {
                    state.down(id, k);
                    if (listener != null) listener.onKeyTap();
                    emit();
                    invalidate();
                }
                return true;
            }
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_POINTER_UP:
                state.up(id);
                emit();
                invalidate();
                return true;
            case MotionEvent.ACTION_CANCEL:
                releaseAll();
                return true;
            default:
                return true;
        }
    }

    private void emit() {
        if (listener != null) listener.onReport(state.report());
    }
}
