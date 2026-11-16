package com.alice.phonekb;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothHidDevice;
import android.bluetooth.BluetoothHidDeviceAppSdpSettings;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.View;
import android.view.WindowManager;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executor;

/** 把手机注册成一把蓝牙键盘（HID Device），iPad 当普通外接键盘认。 */
public final class MainActivity extends Activity implements KeyboardView.Listener {

    /** 键盘 + 鼠标组合描述符。键盘报告 ID 1：修饰位 + 保留 + 6 键，另有 LED 输出。 */
    static final byte[] DESCRIPTOR = {
            0x05, 0x01, 0x09, 0x06, (byte) 0xA1, 0x01, (byte) 0x85, 0x01,
            0x05, 0x07, 0x19, (byte) 0xE0, 0x29, (byte) 0xE7, 0x15, 0x00, 0x25, 0x01,
            0x75, 0x01, (byte) 0x95, 0x08, (byte) 0x81, 0x02,
            (byte) 0x95, 0x01, 0x75, 0x08, (byte) 0x81, 0x01,
            (byte) 0x95, 0x05, 0x75, 0x01, 0x05, 0x08, 0x19, 0x01, 0x29, 0x05, (byte) 0x91, 0x02,
            (byte) 0x95, 0x01, 0x75, 0x03, (byte) 0x91, 0x01,
            (byte) 0x95, 0x06, 0x75, 0x08, 0x15, 0x00, 0x25, 0x65,
            0x05, 0x07, 0x19, 0x00, 0x29, 0x65, (byte) 0x81, 0x00,
            (byte) 0xC0,
            // 鼠标，报告 ID 2：3 个键 + X/Y/滚轮（相对，-127..127）+ 横向滚动（AC Pan）
            0x05, 0x01, 0x09, 0x02, (byte) 0xA1, 0x01, (byte) 0x85, 0x02,
            0x09, 0x01, (byte) 0xA1, 0x00,
            0x05, 0x09, 0x19, 0x01, 0x29, 0x03, 0x15, 0x00, 0x25, 0x01,
            (byte) 0x95, 0x03, 0x75, 0x01, (byte) 0x81, 0x02,
            (byte) 0x95, 0x01, 0x75, 0x05, (byte) 0x81, 0x03,
            0x05, 0x01, 0x09, 0x30, 0x09, 0x31, 0x09, 0x38,
            0x15, (byte) 0x81, 0x25, 0x7F, 0x75, 0x08, (byte) 0x95, 0x03, (byte) 0x81, 0x06,
            0x05, 0x0C, 0x0A, 0x38, 0x02,
            (byte) 0x95, 0x01, 0x75, 0x08, (byte) 0x81, 0x06,
            (byte) 0xC0, (byte) 0xC0
    };
    static final int REPORT_ID = 1;
    static final int MOUSE_ID = 2;

    private static final int REQ_PERMS = 1;
    private static final int REQ_ENABLE = 2;
    private static final String PREF_LAST = "last_host";

    private KeyboardView view;
    private BluetoothAdapter adapter;
    private BluetoothHidDevice hid;
    private BluetoothDevice host;
    private boolean registered;
    private Vibrator vibrator;
    private SharedPreferences prefs;
    private Executor main;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        prefs = getSharedPreferences("kb", MODE_PRIVATE);
        vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        main = getMainExecutor();
        view = new KeyboardView(this);
        view.setListener(this);
        setContentView(view);
        hideSystemBars();

        BluetoothManager bm = (BluetoothManager) getSystemService(BLUETOOTH_SERVICE);
        adapter = bm == null ? null : bm.getAdapter();
        if (adapter == null) {
            view.setStatus("这台手机没有蓝牙", false);
            return;
        }
        if (needPerms()) {
            requestPermissions(new String[]{
                    Manifest.permission.BLUETOOTH_CONNECT,
                    Manifest.permission.BLUETOOTH_ADVERTISE}, REQ_PERMS);
        } else {
            startBluetooth();
        }
    }

    private boolean needPerms() {
        return Build.VERSION.SDK_INT >= 31
                && (checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.BLUETOOTH_ADVERTISE) != PackageManager.PERMISSION_GRANTED);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] p, int[] r) {
        if (code != REQ_PERMS) return;
        if (needPerms()) view.setStatus("没给「附近设备」权限，连不了蓝牙", false);
        else startBluetooth();
    }

    @SuppressWarnings("MissingPermission")
    private void startBluetooth() {
        if (!adapter.isEnabled()) {
            view.setStatus("请先打开蓝牙", false);
            startActivityForResult(new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE), REQ_ENABLE);
            return;
        }
        view.setStatus("正在注册成蓝牙键盘…", false);
        boolean ok = adapter.getProfileProxy(this, new BluetoothProfile.ServiceListener() {
            @Override public void onServiceConnected(int profile, BluetoothProfile proxy) {
                hid = (BluetoothHidDevice) proxy;
                registerApp();
            }
            @Override public void onServiceDisconnected(int profile) {
                hid = null;
                registered = false;
                setHost(null);
                view.setStatus("系统蓝牙键盘服务断开了，重开 App 试试", false);
            }
        }, BluetoothProfile.HID_DEVICE);
        if (!ok) view.setStatus("系统不支持把手机当蓝牙键盘", false);
    }

    @Override
    protected void onActivityResult(int code, int result, Intent data) {
        if (code == REQ_ENABLE && adapter.isEnabled()) startBluetooth();
    }

    @SuppressWarnings("MissingPermission")
    private void registerApp() {
        BluetoothHidDeviceAppSdpSettings sdp = new BluetoothHidDeviceAppSdpSettings(
                "手机键盘", "Phone keyboard", "playground",
                BluetoothHidDevice.SUBCLASS1_COMBO, DESCRIPTOR);
        hid.registerApp(sdp, null, null, main, new BluetoothHidDevice.Callback() {
            @Override public void onAppStatusChanged(BluetoothDevice plugged, boolean reg) {
                registered = reg;
                if (!reg) {
                    setHost(null);
                    view.setStatus("键盘注册被系统收回了，重开 App 试试", false);
                    return;
                }
                if (host != null) return;
                view.setStatus("已就绪，等 iPad 连接（点这里配对）", false);
                BluetoothDevice target = plugged != null ? plugged : lastHost();
                if (target != null) {
                    view.setStatus("正在连上次的 " + nameOf(target) + "…", false);
                    hid.connect(target);
                }
            }
            @Override public void onConnectionStateChanged(BluetoothDevice d, int st) {
                if (st == BluetoothProfile.STATE_CONNECTED) {
                    setHost(d);
                    prefs.edit().putString(PREF_LAST, d.getAddress()).apply();
                } else if (st == BluetoothProfile.STATE_CONNECTING) {
                    view.setStatus("正在连接 " + nameOf(d) + "…", false);
                } else if (st == BluetoothProfile.STATE_DISCONNECTED && d.equals(host)) {
                    setHost(null);
                }
            }
            @Override public void onGetReport(BluetoothDevice d, byte type, byte id, int size) {
                hid.replyReport(d, type, id, new byte[id == MOUSE_ID ? 5 : 8]);
            }
        });
    }

    @SuppressWarnings("MissingPermission")
    private String nameOf(BluetoothDevice d) {
        String n = d.getName();
        return n == null || n.isEmpty() ? d.getAddress() : n;
    }

    private BluetoothDevice lastHost() {
        String addr = prefs.getString(PREF_LAST, null);
        if (addr == null) return null;
        try {
            return adapter.getRemoteDevice(addr);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private void setHost(BluetoothDevice d) {
        host = d;
        view.releaseAll();
        if (d != null) view.setStatus("已连接 " + nameOf(d), true);
        else if (registered) view.setStatus("已断开，点这里重新连接", false);
    }

    // ---- 键盘回调 ----

    @Override
    @SuppressWarnings("MissingPermission")
    public void onReport(byte[] report) {
        if (hid != null && host != null) hid.sendReport(host, REPORT_ID, report);
    }

    @Override
    @SuppressWarnings("MissingPermission")
    public void onMouse(byte[] report) {
        if (hid != null && host != null) hid.sendReport(host, MOUSE_ID, report);
    }

    @Override
    public void onKeyTap() {
        if (vibrator != null && vibrator.hasVibrator()) {
            vibrator.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK));
        }
    }

    @Override
    @SuppressWarnings("MissingPermission")
    public void onStatusBarTap() {
        if (hid == null || !registered) {
            if (adapter != null && !needPerms()) startBluetooth();
            return;
        }
        List<String> items = new ArrayList<>();
        final List<Runnable> actions = new ArrayList<>();
        items.add("让 iPad 搜到我（2 分钟）");
        actions.add(() -> {
            Intent i = new Intent(BluetoothAdapter.ACTION_REQUEST_DISCOVERABLE);
            i.putExtra(BluetoothAdapter.EXTRA_DISCOVERABLE_DURATION, 120);
            startActivity(i);
            view.setStatus("现在去 iPad：设置 → 蓝牙，点「" + adapter.getName() + "」", false);
        });
        for (final BluetoothDevice d : adapter.getBondedDevices()) {
            items.add("连接已配对的：" + nameOf(d));
            actions.add(() -> {
                if (host != null && !host.equals(d)) hid.disconnect(host);
                view.setStatus("正在连接 " + nameOf(d) + "…", false);
                hid.connect(d);
            });
        }
        if (host != null) {
            items.add("断开 " + nameOf(host));
            actions.add(() -> hid.disconnect(host));
        }
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle("配对 / 连接")
                .setItems(items.toArray(new String[0]), (dlg, which) -> actions.get(which).run())
                .show();
    }

    // ---- 生命周期 ----

    private void hideSystemBars() {
        view.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    @Override
    public void onWindowFocusChanged(boolean focus) {
        super.onWindowFocusChanged(focus);
        if (focus) hideSystemBars();
        else view.releaseAll();
    }

    @Override
    @SuppressWarnings("MissingPermission")
    protected void onDestroy() {
        if (hid != null) {
            try {
                if (host != null) hid.sendReport(host, REPORT_ID, new byte[8]);
                hid.unregisterApp();
            } catch (SecurityException ignored) { }
            adapter.closeProfileProxy(BluetoothProfile.HID_DEVICE, hid);
        }
        super.onDestroy();
    }
}
