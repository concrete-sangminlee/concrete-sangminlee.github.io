// Keyboard, touch and gamepad input.
// Keyboard: player 1 WASD + Space, player 2 arrow keys + Enter.
// Gamepads (standard mapping): first pad player 1, second pad player 2.
//   stick or d-pad: move · A or d-pad up: jump · B / X: hit · Start: pause
// Against the CPU, every keyboard key set, the touch buttons and any pad control player 1.

const KEYS = [
    { KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down', Space: 'hit' },
    { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Enter: 'hit', NumpadEnter: 'hit' },
];
const GAME_KEYS = new Set(KEYS.flatMap(k => Object.keys(k)));
const blank = () => ({ left: false, right: false, up: false, down: false, hit: false });
const STICK = 0.45;

function padState(pad) {
    const b = i => !!pad.buttons[i]?.pressed;
    const [ax = 0, ay = 0] = pad.axes;
    return {
        left: ax < -STICK || b(14),
        right: ax > STICK || b(15),
        up: b(0) || b(12) || ay < -0.75,
        down: ay > STICK || b(13),
        hit: b(1) || b(2) || b(5) || b(7),
        start: b(9),
    };
}

export function createInput({ isActive, onPadChange }) {
    const keys = [blank(), blank()];
    const touch = blank();
    let lastStart = false;
    let touchUsed = false;

    function setKey(code, down) {
        KEYS.forEach((map, i) => {
            if (map[code]) keys[i][map[code]] = down;
        });
    }
    addEventListener('keydown', e => {
        if (!GAME_KEYS.has(e.code)) return;
        if (isActive() && !e.target.closest?.('button, input, select, a')) e.preventDefault();
        if (!e.repeat) setKey(e.code, true);
    });
    addEventListener('keyup', e => setKey(e.code, false));
    addEventListener('blur', () => keys.forEach(k => Object.keys(k).forEach(n => { k[n] = false; })));
    addEventListener('gamepadconnected', e => onPadChange?.(e.gamepad, true));
    addEventListener('gamepaddisconnected', e => onPadChange?.(e.gamepad, false));

    function bindTouch(root) {
        root.querySelectorAll('[data-key]').forEach(btn => {
            const name = btn.dataset.key;
            const on = e => { e.preventDefault(); touch[name] = true; touchUsed = true; btn.classList.add('is-down'); btn.setPointerCapture?.(e.pointerId); };
            const off = e => { e.preventDefault(); touch[name] = false; btn.classList.remove('is-down'); };
            btn.addEventListener('pointerdown', on);
            btn.addEventListener('pointerup', off);
            btn.addEventListener('pointercancel', off);
            btn.addEventListener('lostpointercapture', off);
            btn.addEventListener('contextmenu', e => e.preventDefault());
        });
    }

    const pads = () => [...(navigator.getGamepads?.() || [])].filter(p => p && p.connected).map(padState);

    /** Inputs for [player 1, player 2]. `merged`: one human using every control. */
    function read(merged) {
        const any = (...src) => {
            const o = blank();
            for (const s of src) for (const k in o) o[k] = o[k] || !!s?.[k];
            return o;
        };
        const p = pads();
        return merged
            ? [any(keys[0], keys[1], touch, ...p), blank()]
            : [any(keys[0], touch, p[0]), any(keys[1], p[1])];
    }

    /** True once per press of Start on any pad. */
    function startPressed() {
        const now = pads().some(p => p.start);
        const edge = now && !lastStart;
        lastStart = now;
        return edge;
    }

    return {
        read,
        bindTouch,
        startPressed,
        get touchUsed() { return touchUsed; },
        get padCount() { return pads().length; },
    };
}
