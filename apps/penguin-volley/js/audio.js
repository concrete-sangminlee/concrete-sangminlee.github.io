// Sound effects synthesised with Web Audio: no sound files.

export function createAudio() {
    let ctx = null;
    let master = null;
    let enabled = true;

    function ensure() {
        if (!enabled) return null;
        if (!ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            ctx = new AC();
            master = ctx.createGain();
            master.gain.value = 0.5;
            master.connect(ctx.destination);
        }
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
    }

    function tone({ freq, to = freq, dur = 0.1, type = 'sine', gain = 0.3, delay = 0 }) {
        const c = ensure();
        if (!c) return;
        const t = c.currentTime + delay;
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, t);
        o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
        g.gain.setValueAtTime(gain, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g).connect(master);
        o.start(t);
        o.stop(t + dur + 0.02);
    }

    function noise({ dur = 0.15, gain = 0.3, filter = 1200, delay = 0 }) {
        const c = ensure();
        if (!c) return;
        const t = c.currentTime + delay;
        const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
        const src = c.createBufferSource();
        src.buffer = buf;
        const f = c.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = filter;
        const g = c.createGain();
        g.gain.value = gain;
        src.connect(f).connect(g).connect(master);
        src.start(t);
    }

    const sounds = {
        hit: () => tone({ freq: 420, to: 260, dur: 0.09, type: 'triangle', gain: 0.35 }),
        spike: () => { noise({ dur: 0.12, gain: 0.35, filter: 2600 }); tone({ freq: 180, to: 70, dur: 0.16, type: 'square', gain: 0.18 }); },
        jump: () => tone({ freq: 300, to: 620, dur: 0.12, type: 'sine', gain: 0.15 }),
        dive: () => noise({ dur: 0.18, gain: 0.25, filter: 900 }),
        net: () => tone({ freq: 160, to: 120, dur: 0.08, type: 'sawtooth', gain: 0.12 }),
        wall: () => tone({ freq: 240, to: 200, dur: 0.05, type: 'triangle', gain: 0.12 }),
        ground: () => { noise({ dur: 0.25, gain: 0.4, filter: 500 }); tone({ freq: 110, to: 50, dur: 0.25, gain: 0.3 }); },
        whistle: () => { tone({ freq: 1900, to: 2100, dur: 0.18, type: 'square', gain: 0.06 }); tone({ freq: 2100, to: 1800, dur: 0.22, type: 'square', gain: 0.06, delay: 0.2 }); },
        win: () => [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.18, type: 'triangle', gain: 0.22, delay: i * 0.12 })),
        select: () => tone({ freq: 660, to: 880, dur: 0.06, type: 'triangle', gain: 0.15 }),
    };

    return {
        play(name) { if (enabled && sounds[name]) sounds[name](); },
        unlock() { ensure(); },
        get enabled() { return enabled; },
        set enabled(v) { enabled = !!v; if (!enabled && ctx) ctx.suspend(); },
    };
}
