package com.alice.phonekb;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.view.MotionEvent;
import android.view.View;

import java.util.HashMap;
import java.util.Map;

/**
 * 整屏布局（横竖都一样）：
 * 最上一条状态栏；上半区左边数字键、右边触控板；下半区整块键盘。
 * 触控板放上面，是为了打字时手掌不会蹭到它。
 */
public final class KeyboardView extends View implements Touchpad.Sink {

    public interface Listener {
        void onReport(byte[] report);
        void onMouse(byte[] report);
        void onKeyTap();
        void onStatusBarTap();
    }

    private static final int BG = 0xFF14171F;
    private static final int KEY = 0xFF2A2F3B;
    private static final int KEY_MOD = 0xFF3A4152;
    private static final int KEY_DOWN = 0xFF5B8DEF;
    private static final int KEY_LATCHED = 0xFF3F5E9E;
    private static final int PAD = 0xFF1E2230;
    private static final int PAD_ACTIVE = 0xFF252B3B;
    private static final int TEXT = 0xFFE8ECF4;
    private static final int TEXT_DIM = 0xFF8A93A6;
    private static final int OK = 0xFF4CC38A;
    private static final int WARN = 0xFFF0A04B;

    /** 上半区（数字键 + 触控板）占可用高度的比例。 */
    static final float TOP_SHARE = 0.42f;
    /** 数字键占上半区宽度的比例。 */
    static final float NUMPAD_SHARE = 0.34f;

    private final KeyState state = new KeyState();
    private final Touchpad pad;
    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF rect = new RectF();
    private final RectF mainArea = new RectF(), numArea = new RectF(), padArea = new RectF();
    private final float density;
    /** 每根手指归谁：true = 触控板，false = 键。 */
    private final Map<Integer, Boolean> owner = new HashMap<>();

    private Listener listener;
    private String status = "正在启动蓝牙…";
    private boolean connected = false;
    private float barH, gap;

    public KeyboardView(Context ctx) {
        super(ctx);
        density = ctx.getResources().getDisplayMetrics().density;
        pad = new Touchpad(density, this);
        text.setTextAlign(Paint.Align.CENTER);
        setBackgroundColor(BG);
    }

    public void setListener(Listener l) { listener = l; }

    public void setStatus(String s, boolean ok) {
        status = s;
        connected = ok;
        invalidate();
    }

    /** 失焦、断连时把所有键和鼠标键松开，免得 iPad 那边一直认为按着。 */
    public void releaseAll() {
        state.clear();
        owner.clear();
        pad.cancel();
        emit();
        invalidate();
    }

    @Override
    protected void onSizeChanged(int w, int h, int ow, int oh) {
        barH = 34 * density;
        gap = 4 * density;
        float m = 6 * density;
        float avail = h - barH - m;
        float topH = avail * TOP_SHARE;
        float split = m + (w - 2 * m) * NUMPAD_SHARE;
        numArea.set(m, barH, split, barH + topH);
        padArea.set(split + gap, barH + gap / 2, w - m, barH + topH - gap / 2);
        mainArea.set(m, barH + topH + gap, w - m, h - m);
    }

    @Override
    protected void onDraw(Canvas c) {
        // 状态栏
        fill.setColor(connected ? OK : WARN);
        c.drawCircle(6 * density + 10 * density, barH / 2, 5 * density, fill);
        text.setTextAlign(Paint.Align.LEFT);
        text.setColor(TEXT);
        text.setTextSize(14 * density);
        c.drawText(status, 28 * density, barH / 2 + 5 * density, text);
        text.setTextAlign(Paint.Align.RIGHT);
        text.setColor(TEXT_DIM);
        text.setTextSize(12 * density);
        c.drawText("点这里：配对 / 连接", getWidth() - 6 * density, barH / 2 + 4 * density, text);
        text.setTextAlign(Paint.Align.CENTER);

        // 触控板
        boolean padTouched = owner.containsValue(Boolean.TRUE);
        fill.setColor(pad.dragging() ? KEY_LATCHED : padTouched ? PAD_ACTIVE : PAD);
        float r = 14 * density;
        c.drawRoundRect(padArea, r, r, fill);
        text.setColor(TEXT_DIM);
        text.setTextSize(Math.min(12 * density, padArea.width() / 22));
        float cy = padArea.centerY();
        float lh = text.getTextSize() * 1.5f;
        c.drawText("触控板", padArea.centerX(), cy - lh, text);
        c.drawText("单指移动 · 轻点=左键 · 双指轻点=右键", padArea.centerX(), cy, text);
        c.drawText("双指滑=滚动 · 轻点后按住拖=拖动 · 三指上滑=回主屏", padArea.centerX(), cy + lh, text);

        drawBoard(c, Layout.NUMPAD, numArea);
        drawBoard(c, Layout.MAIN, mainArea);
    }

    private void drawBoard(Canvas c, Layout.Board b, RectF area) {
        float uw = area.width() / b.width, uh = area.height() / b.rows;
        boolean shift = state.shiftActive();
        int latched = state.latched();
        for (Layout.Key k : b.keys()) {
            rect.set(area.left + k.x * uw + gap / 2, area.top + k.y * uh + gap / 2,
                    area.left + (k.x + k.w) * uw - gap / 2, area.top + (k.y + k.h) * uh - gap / 2);
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
            text.setTextSize(Math.min(Math.min(uh, uw) * (small ? 0.30f : 0.42f), 26 * density));
            float ty = rect.centerY() - (text.descent() + text.ascent()) / 2;
            c.drawText(label, rect.centerX(), ty, text);
        }
    }

    private Layout.Key keyAt(float px, float py) {
        if (mainArea.contains(px, py)) return hit(Layout.MAIN, mainArea, px, py);
        if (numArea.contains(px, py)) return hit(Layout.NUMPAD, numArea, px, py);
        return null;
    }

    private static Layout.Key hit(Layout.Board b, RectF a, float px, float py) {
        return b.hit((px - a.left) / (a.width() / b.width), (py - a.top) / (a.height() / b.rows));
    }

    @Override
    public boolean onTouchEvent(MotionEvent e) {
        int action = e.getActionMasked();
        int idx = e.getActionIndex();
        int id = e.getPointerId(idx);
        long t = e.getEventTime();
        switch (action) {
            case MotionEvent.ACTION_DOWN:
            case MotionEvent.ACTION_POINTER_DOWN: {
                float x = e.getX(idx), y = e.getY(idx);
                if (y < barH) {
                    if (action == MotionEvent.ACTION_DOWN && listener != null) listener.onStatusBarTap();
                    return true;
                }
                if (padArea.contains(x, y)) {
                    owner.put(id, Boolean.TRUE);
                    pad.down(id, x, y, t);
                    invalidate();
                    return true;
                }
                Layout.Key k = keyAt(x, y);
                if (k != null) {
                    owner.put(id, Boolean.FALSE);
                    state.down(id, k);
                    if (listener != null) listener.onKeyTap();
                    emit();
                    invalidate();
                }
                return true;
            }
            case MotionEvent.ACTION_MOVE:
                for (int i = 0; i < e.getPointerCount(); i++) {
                    int pid = e.getPointerId(i);
                    if (Boolean.TRUE.equals(owner.get(pid))) pad.move(pid, e.getX(i), e.getY(i), t);
                }
                return true;
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_POINTER_UP: {
                Boolean o = owner.remove(id);
                if (Boolean.TRUE.equals(o)) {
                    pad.up(id, t);
                } else if (Boolean.FALSE.equals(o)) {
                    state.up(id);
                    emit();
                }
                invalidate();
                return true;
            }
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

    // ---- Touchpad.Sink ----

    @Override
    public void mouse(int buttons, int dx, int dy, int wheel, int pan) {
        if (listener != null) {
            listener.onMouse(new byte[]{(byte) buttons, (byte) dx, (byte) dy, (byte) wheel, (byte) pan});
        }
        invalidate();
    }

    @Override
    public void combo(int mods, int usage) {
        if (listener == null) return;
        byte[] r = new byte[8];
        r[0] = (byte) mods;
        r[2] = (byte) usage;
        listener.onReport(r);
        listener.onReport(state.report());
        listener.onKeyTap();
    }
}
