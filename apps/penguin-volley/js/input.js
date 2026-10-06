// Keyboard and touch input. Player 1: WASD + Space. Player 2: arrow keys + Enter.
// Against the CPU, both key sets (and the touch buttons) control player 1.

const KEYS = [
    { KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down', Space: 'hit' },
    { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Enter: 'hit', NumpadEnter: 'hit' },
];
const GAME_KEYS = new Set(KEYS.flatMap(k => Object.keys(k)));
const blank = () => ({ left: false, right: false, up: false, down: false, hit: false });

export function createInput({ isActive }) {
    const keys = [blank(), blank()];
    const touch = blank();

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

    function bindTouch(root) {
        root.querySelectorAll('[data-key]').forEach(btn => {
            const name = btn.dataset.key;
            const on = e => { e.preventDefault(); touch[name] = true; btn.classList.add('is-down'); btn.setPointerCapture?.(e.pointerId); };
            const off = e => { e.preventDefault(); touch[name] = false; btn.classList.remove('is-down'); };
            btn.addEventListener('pointerdown', on);
            btn.addEventListener('pointerup', off);
            btn.addEventListener('pointercancel', off);
            btn.addEventListener('lostpointercapture', off);
            btn.addEventListener('contextmenu', e => e.preventDefault());
        });
    }

    /** Inputs for [player 1, player 2]. `merged`: one human using every control. */
    function read(merged) {
        const any = (...src) => {
            const o = blank();
            for (const s of src) for (const k in o) o[k] = o[k] || s[k];
            return o;
        };
        return merged ? [any(keys[0], keys[1], touch), blank()] : [any(keys[0], touch), { ...keys[1] }];
    }

    return { read, bindTouch };
}
