package com.alice.phonekb;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 触控板手势，照 MacBook 触控板的习惯：
 * 单指移动 = 移指针；轻点 = 左键；双指轻点 = 右键；
 * 轻点后马上再按住拖 = 按住左键拖动；双指滑 = 滚动（自然方向）；
 * 三指上滑 = 回主屏（⌘H），三指左右滑 = 切到上一个 App（⌘Tab）。
 * 纯 Java，坐标用像素、时间用毫秒，测试直接用。
 */
public final class Touchpad {

    public interface Sink {
        /** 一份鼠标报告：按键位、相对位移、滚轮、横向滚动，都已裁到 -127..127。 */
        void mouse(int buttons, int dx, int dy, int wheel, int pan);
        /** 按一下组合键再松开。 */
        void combo(int mods, int usage);
    }

    static final long TAP_MS = 220;          // 轻点最长时长
    static final long DRAG_GAP_MS = 260;     // 轻点后多久内再按下算「拖动」
    static final float SLOP_DP = 8;          // 移动超过这么多才算「动了」
    static final float SCROLL_STEP_DP = 9;   // 每滚一格要滑的距离
    static final float SWIPE3_DP = 50;       // 三指滑多远触发
    static final float GAIN = 1.4f;          // 每 dp 对应的鼠标位移

    private static final int USAGE_H = 0x0B, USAGE_TAB = 0x2B;

    private final float dp;
    private final Sink sink;

    private final Map<Integer, float[]> fingers = new LinkedHashMap<>();
    private long gestureStart;
    private int maxFingers;
    private boolean moved, fired3;
    private boolean dragging;
    private long lastTapUp = -100000;
    private float travelX, travelY;          // 本次手势质心累计位移（像素）
    private float remX, remY, scrollX, scrollY;

    public Touchpad(float density, Sink sink) {
        this.dp = density;
        this.sink = sink;
    }

    public boolean dragging() { return dragging; }

    public void down(int id, float x, float y, long t) {
        if (fingers.isEmpty()) {
            gestureStart = t;
            maxFingers = 0;
            moved = fired3 = false;
            travelX = travelY = remX = remY = scrollX = scrollY = 0;
            if (t - lastTapUp <= DRAG_GAP_MS) {
                dragging = true;
                sink.mouse(1, 0, 0, 0, 0);
            }
        }
        fingers.put(id, new float[]{x, y});
        maxFingers = Math.max(maxFingers, fingers.size());
    }

    public void move(int id, float x, float y, long t) {
        float[] f = fingers.get(id);
        if (f == null) return;
        int n = fingers.size();
        float dx = (x - f[0]) / n, dy = (y - f[1]) / n;   // 质心位移
        f[0] = x; f[1] = y;
        travelX += dx; travelY += dy;
        if (!moved && Math.hypot(travelX, travelY) > SLOP_DP * dp) moved = true;
        if (!moved) return;

        if (n == 1) {
            remX += dx / dp * GAIN;
            remY += dy / dp * GAIN;
            int ix = (int) remX, iy = (int) remY;
            remX -= ix; remY -= iy;
            if (ix != 0 || iy != 0) emitMove(dragging ? 1 : 0, ix, iy);
        } else if (n == 2) {
            scrollY += dy; scrollX += dx;
            float step = SCROLL_STEP_DP * dp;
            int wheel = (int) (scrollY / step);   // 手指往上（dy<0）→ 往下翻
            int pan = (int) (-scrollX / step);    // 手指往左 → 往右翻
            scrollY -= wheel * step;
            scrollX += pan * step;
            if (wheel != 0 || pan != 0) sink.mouse(0, 0, 0, clamp(wheel), clamp(pan));
        } else if (!fired3) {
            float d = SWIPE3_DP * dp;
            if (-travelY > d && -travelY > Math.abs(travelX)) {
                fired3 = true;
                sink.combo(Layout.MOD_GUI, USAGE_H);
            } else if (Math.abs(travelX) > d && Math.abs(travelX) > -travelY) {
                fired3 = true;
                sink.combo(Layout.MOD_GUI, USAGE_TAB);
            }
        }
    }

    public void up(int id, long t) {
        if (fingers.remove(id) == null || !fingers.isEmpty()) return;
        boolean tap = !moved && t - gestureStart <= TAP_MS;
        if (dragging) {
            dragging = false;
            sink.mouse(0, 0, 0, 0, 0);
            lastTapUp = -100000;   // 没动的话，这一按一松本身就是双击的第二下
            return;
        }
        if (tap && maxFingers == 1) {
            sink.mouse(1, 0, 0, 0, 0);
            sink.mouse(0, 0, 0, 0, 0);
            lastTapUp = t;
        } else if (tap && maxFingers == 2) {
            sink.mouse(2, 0, 0, 0, 0);
            sink.mouse(0, 0, 0, 0, 0);
            lastTapUp = -100000;
        } else {
            lastTapUp = -100000;
        }
    }

    public void cancel() {
        fingers.clear();
        if (dragging) sink.mouse(0, 0, 0, 0, 0);
        dragging = false;
        lastTapUp = -100000;
    }

    private void emitMove(int buttons, int dx, int dy) {
        while (dx != 0 || dy != 0) {
            int sx = clamp(dx), sy = clamp(dy);
            sink.mouse(buttons, sx, sy, 0, 0);
            dx -= sx; dy -= sy;
        }
    }

    static int clamp(int v) { return Math.max(-127, Math.min(127, v)); }
}
