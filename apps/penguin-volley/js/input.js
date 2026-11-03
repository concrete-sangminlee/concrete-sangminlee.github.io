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
    const touchButtons = new Map();
    let lastStart = false;
    let touchUsed = false;

    function clear(state) {
        Object.keys(state).forEach(name => { state[name] = false; });
    }

    function syncTouch(name) {
        touch[name] = [...touchButtons.values()].some(state =>
            state.name === name && (state.pointers.size > 0 || state.pulse),
        );
    }

    function reset() {
        keys.forEach(clear);
        clear(touch);
        lastStart = false;
        touchUsed = false;
        touchButtons.forEach((state, btn) => {
            state.pointers.clear();
            state.pulse = false;
            state.suppressClick = false;
            clearTimeout(state.pulseTimer);
            clearTimeout(state.suppressTimer);
            btn.classList.remove('is-down');
        });
    }

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
    addEventListener('blur', reset);
    addEventListener('gamepadconnected', e => onPadChange?.(e.gamepad, true));
    addEventListener('gamepaddisconnected', e => onPadChange?.(e.gamepad, false));

    function bindTouch(root) {
        root.querySelectorAll('[data-key]').forEach(btn => {
            if (touchButtons.has(btn)) return;
            const state = {
                name: btn.dataset.key,
                pointers: new Set(),
                pulse: false,
                pulseTimer: 0,
                suppressClick: false,
                suppressTimer: 0,
            };
            touchButtons.set(btn, state);

            const syncButton = () => {
                const pressed = state.pointers.size > 0 || state.pulse;
                btn.classList.toggle('is-down', pressed);
                syncTouch(state.name);
            };
            const on = e => {
                e.preventDefault();
                state.pointers.add(e.pointerId);
                state.suppressClick = true;
                clearTimeout(state.suppressTimer);
                state.suppressTimer = setTimeout(() => { state.suppressClick = false; }, 1000);
                touchUsed = true;
                syncButton();
                btn.setPointerCapture?.(e.pointerId);
            };
            const off = e => {
                e.preventDefault();
                state.pointers.delete(e.pointerId);
                syncButton();
            };
            btn.addEventListener('pointerdown', on);
            btn.addEventListener('pointerup', off);
            btn.addEventListener('pointercancel', off);
            btn.addEventListener('lostpointercapture', off);
            btn.addEventListener('click', e => {
                // Pointer activation already produced held input. Keyboard and assistive
                // technology clicks have no preceding pointer and need a short pulse.
                if (state.suppressClick || e.detail > 0) {
                    state.suppressClick = false;
                    clearTimeout(state.suppressTimer);
                    return;
                }
                e.preventDefault();
                touchUsed = true;
                state.pulse = true;
                clearTimeout(state.pulseTimer);
                state.pulseTimer = setTimeout(() => {
                    state.pulse = false;
                    syncButton();
                }, 100);
                syncButton();
            });
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
        reset,
        startPressed,
        get touchUsed() { return touchUsed; },
        get padCount() { return pads().length; },
    };
}
