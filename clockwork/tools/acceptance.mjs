// Shared acceptance rules for the two Node browser scripts.
export const SHOT_SECONDS = 48;
export const SHOT_SPEED = 60;

export function shotRequest(view, width, height) {
    if (!['wide', 'close', 'phone'].includes(view)) throw Error(`Unknown view: ${view}`);
    const scale = Math.max(1, height / width);
    return { seconds: SHOT_SECONDS, speed: SHOT_SPEED,
        camera: view === 'close' ? [-10, 4, 27] : [-14 * scale, 1 + 3 * scale, 48 * scale],
        target: view === 'close' ? [-1, -3, 0] : [0, 1, 0] };
}

export function assertFrozen(state, request, errors = []) {
    if (errors.length) throw Error(`Page errors: ${errors.join('; ')}`);
    const near = (a, b) => Number.isFinite(a) && Math.abs(a - b) < 1e-9;
    const center = -2 * Math.PI / 3600 * request.seconds;
    const expected = { center, great: -center / 12, third: -center * 8, escape: center * 60,
        minute: -center / 3, hour: center / 12,
        balance: Math.sin(request.seconds / request.speed * Math.min(28, 3.5 * Math.sqrt(request.speed))) * .45 };
    if (!state?.paused || !near(state.simulationSeconds, request.seconds) || state.speed !== request.speed || state.pendingStep !== 0)
        throw Error(`Freeze time/speed mismatch: ${JSON.stringify(state)}`);
    for (const [key, value] of Object.entries(expected))
        if (!near(state.angles?.[key], value)) throw Error(`Freeze shaft mismatch: ${key}=${state.angles?.[key]}, expected ${value}`);
    for (const key of ['camera', 'target'])
        if (state[key]?.length !== 3 || !state[key].every((v, i) => near(v, request[key][i])))
            throw Error(`Freeze ${key} mismatch: ${JSON.stringify(state[key])}`);
    const length = Math.hypot(...request.target.map((v, i) => v - request.camera[i]));
    if (state.direction?.length !== 3 || !state.direction.every((v, i) => near(v, (request.target[i] - request.camera[i]) / length)))
        throw Error(`Freeze camera direction mismatch: ${JSON.stringify(state.direction)}`);
}

// Initial limits for the current brass/steel studio setup, pending GPU
// calibration. Both live negative controls MUST fail these same limits.
// Calibrated in Chrome on Apple Metal, wide view frozen at 48 s, 2026-11-11 — luma range (p95 − p05) per gear:
//   metal as shipped  great 87.8, centre 58.8 | flat MeshBasicMaterial 0, 0 | environment removed 19.0, 43.4.
// Nothing in the shipped frame reaches luma 190, so the highlight share cannot tell the versions apart and is not required.
export const MATERIAL_LIMITS = { samples: 500, range: 50, highlightFraction: 0 };
export function materialFailures(stats) {
    return ['samples', 'range', 'highlightFraction'].filter(key =>
        !Number.isFinite(stats?.[key]) || stats[key] < MATERIAL_LIMITS[key]);
}
