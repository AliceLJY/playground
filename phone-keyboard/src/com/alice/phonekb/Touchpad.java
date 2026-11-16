package com.alice.phonekb;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 触控板手势，照 MacBook 触控板的习惯：
 * 单指移动 = 移指针；轻点 = 左键；双指轻点 = 右键；双指滑 = 滚动（和 MacBook 同向）；
 * 轻点后马上再按住拖 = 拖一下（松手即放）；
 * 长按不动约半秒 = 进入「拖选」：左键一直按着，手指可以抬起来换位置接着拖，轻点一下才结束——
 * 选长段文字靠这个（MacBook 的三指拖移在 OPPO 上用不了：三指上滑/下滑被系统占了）。
 * 三指及以上一律不处理。
 * 纯 Java，坐标用像素、时间用毫秒；长按靠外面定时调 tick()。
 */
public final class Touchpad {

    public interface Sink {
        /** 一份鼠标报告：按键位、相对位移、滚轮、横向滚动，都已裁到 -127..127。 */
        void mouse(int buttons, int dx, int dy, int wheel, int pan);
        /** 进入拖选时给一下震动。 */
        void feedback();
    }

    static final long TAP_MS = 220;          // 轻点最长时长
    static final long DRAG_GAP_MS = 300;     // 轻点后多久内再按下算「拖一下」
    public static final long HOLD_MS = 450;  // 长按多久进入拖选
    static final float SLOP_DP = 8;          // 移动超过这么多才算「动了」
    static final float SCROLL_STEP_DP = 9;   // 每滚一格要滑的距离
    static final float GAIN = 1.4f;          // 每 dp 对应的鼠标位移

    private final float dp;
    private final Sink sink;

    private final Map<Integer, float[]> fingers = new LinkedHashMap<>();
    private long gestureStart;
    private int maxFingers;
    private boolean moved;
    private boolean dragging;   // 左键按着
    private boolean locked;     // 拖选：抬手也不放
    private long lastTapUp = -100000;
    private float travelX, travelY;
    private float remX, remY, scrollX, scrollY;

    public Touchpad(float density, Sink sink) {
        this.dp = density;
        this.sink = sink;
    }

    public boolean dragging() { return dragging; }

    public boolean locked() { return locked; }

    public void down(int id, float x, float y, long t) {
        if (fingers.isEmpty()) {
            gestureStart = t;
            maxFingers = 0;
            moved = false;
            travelX = travelY = remX = remY = scrollX = scrollY = 0;
            if (!dragging && t - lastTapUp <= DRAG_GAP_MS) {
                dragging = true;
                sink.mouse(1, 0, 0, 0, 0);
            }
        }
        fingers.put(id, new float[]{x, y});
        maxFingers = Math.max(maxFingers, fingers.size());
    }

    /** 外面在按下后约 HOLD_MS 调一次；单指一直没动就进入拖选。 */
    public void tick(long t) {
        if (fingers.size() == 1 && maxFingers == 1 && !moved && !dragging
                && t - gestureStart >= HOLD_MS) {
            dragging = true;
            locked = true;
            sink.mouse(1, 0, 0, 0, 0);
            sink.feedback();
        }
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

        int buttons = dragging ? 1 : 0;
        if (n == 1) {
            remX += dx / dp * GAIN;
            remY += dy / dp * GAIN;
            int ix = (int) remX, iy = (int) remY;
            remX -= ix; remY -= iy;
            if (ix != 0 || iy != 0) emitMove(buttons, ix, iy);
        } else if (n == 2) {
            scrollY += dy; scrollX += dx;
            float step = SCROLL_STEP_DP * dp;
            // iPad 自己会对鼠标滚轮套「自然滚动」，所以这里发传统方向：
            // 手指往上（dy<0）→ wheel>0。11-16 真机实测：反过来发正好和 MacBook 相反。
            int wheel = (int) (-scrollY / step);
            int pan = (int) (scrollX / step);
            scrollY += wheel * step;
            scrollX -= pan * step;
            if (wheel != 0 || pan != 0) sink.mouse(buttons, 0, 0, clamp(wheel), clamp(pan));
        }
        // 三指及以上：不处理（OPPO 系统手势）
    }

    public void up(int id, long t) {
        if (fingers.remove(id) == null || !fingers.isEmpty()) return;
        boolean tap = !moved && t - gestureStart <= TAP_MS;
        if (locked) {
            // 拖选中：轻点一下才结束；滑完抬手继续按着，方便换个位置接着拖
            if (tap && maxFingers == 1) release();
            return;
        }
        if (dragging) {
            release();   // 拖一下：松手即放；没动的话这一按一松就是双击的第二下
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

    private void release() {
        dragging = false;
        locked = false;
        lastTapUp = -100000;
        sink.mouse(0, 0, 0, 0, 0);
    }

    public void cancel() {
        fingers.clear();
        if (dragging) sink.mouse(0, 0, 0, 0, 0);
        dragging = false;
        locked = false;
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
