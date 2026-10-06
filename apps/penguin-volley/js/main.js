// Penguin Volley: game flow, menus and the main loop.
import { createWorld, stepWorld, resetRally, NO_INPUT, GROUND } from './physics.js';
import { createAI, aiInput } from './ai.js';
import { createRenderer } from './render.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { STRINGS, detectLang } from './i18n.js';

const STEP = 1000 / 60;
const STORE = 'penguin-volley';
const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const touchOnly = matchMedia('(hover: none) and (pointer: coarse)').matches;

// ------------------------------------------------------------------ settings
const settings = Object.assign({ level: 'normal', points: 15, sound: true, lang: null }, load());
function load() {
    try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; }
}
function save() {
    try { localStorage.setItem(STORE, JSON.stringify(settings)); } catch { /* private mode */ }
}
let lang = detectLang(settings.lang);
const t = () => STRINGS[lang];

// ------------------------------------------------------------------ state
const canvas = $('#court');
const renderer = createRenderer(canvas);
const audio = createAudio();
audio.enabled = settings.sound;
const input = createInput({ isActive: () => game.phase === 'play' || game.phase === 'ready' });

const game = {
    mode: 'demo',     // demo (attract, behind the menu) | cpu | 2p
    phase: 'menu',    // menu | ready | play | point | over | paused
    resumePhase: null,
    world: createWorld(Date.now() & 0xffff, 0),
    ais: [],
    scores: [0, 0],
    server: 0,
    timer: 0,
    message: null,
    messageAge: 0,
    particles: [],
    shake: 0,
    tick: 0,
    poses: null,
    winner: -1,
};

function startDemo() {
    game.mode = 'demo';
    game.world = createWorld((Math.random() * 1e9) | 0, 0);
    game.ais = [createAI(0, 'normal', 3), createAI(1, 'normal', 9)];
    game.scores = [0, 0];
    game.phase = 'menu';
    game.message = null;
    game.poses = null;
}

function startMatch(mode) {
    game.mode = mode;
    game.world = createWorld((Math.random() * 1e9) | 0, 0);
    game.ais = mode === 'cpu' ? [null, createAI(1, settings.level, (Math.random() * 1e9) | 0)] : [];
    game.scores = [0, 0];
    game.server = 0;
    game.winner = -1;
    game.poses = null;
    game.particles = [];
    resetRally(game.world, 0);
    setPhase('ready', 70, t().ready);
    showOverlay(null);
    document.body.classList.add('is-playing');
    document.activeElement?.blur?.();
    if (mode === '2p' && touchOnly) toast(t().keyboardOnly);
    announce();
}

function setPhase(phase, timer = 0, message = null) {
    game.phase = phase;
    game.timer = timer;
    game.message = message;
    game.messageAge = 0;
}

const labels = () => (game.mode === 'cpu' ? [t().p1, t().cpu] : [t().p1, t().p2]);

// ------------------------------------------------------------------ simulation
function inputs() {
    const w = game.world;
    if (game.mode === 'demo') return [aiInput(game.ais[0], w), aiInput(game.ais[1], w)];
    const human = input.read(game.mode === 'cpu');
    if (game.mode === 'cpu') human[1] = aiInput(game.ais[1], w);
    return human;
}

function step() {
    game.tick++;
    game.messageAge++;
    if (game.shake > 0) game.shake *= 0.85;
    if (game.shake < 0.3) game.shake = 0;
    updateParticles();

    switch (game.phase) {
    case 'menu': {
        const res = stepWorld(game.world, inputs());
        if (res.scorer >= 0) resetRally(game.world, res.scorer);
        break;
    }
    case 'ready':
        // Everyone waits for the referee.
        if (--game.timer <= 0) setPhase('play');
        break;
    case 'play': {
        const res = stepWorld(game.world, inputs());
        res.events.forEach(onEvent);
        if (res.scorer >= 0) onPoint(res.scorer);
        break;
    }
    case 'point':
        // The ball stays where it landed; airborne penguins come down.
        stepPlayersOnly([NO_INPUT, NO_INPUT]);
        if (--game.timer <= 0) {
            if (game.winner >= 0) {
                setPhase('over');
                showOverlay('over');
            } else {
                resetRally(game.world, game.server);
                setPhase('ready', 50, t().ready);
            }
        }
        break;
    case 'over':
        break;
    }
}

function stepPlayersOnly(playerInputs) {
    const b = game.world.ball;
    const keep = { ...b };
    stepWorld(game.world, playerInputs);
    Object.assign(b, keep);
}

function onEvent(e) {
    switch (e.type) {
    case 'hit':
        audio.play('hit');
        burst(e.x, e.y, 6, '#ffffff', 2.2);
        break;
    case 'spike':
        audio.play('spike');
        game.shake = 7;
        burst(e.x, e.y, 14, '#ffe27a', 4);
        break;
    case 'jump':
        audio.play('jump');
        break;
    case 'dive':
        audio.play('dive');
        burst(e.x, GROUND - 4, 12, '#ffffff', 3);
        break;
    case 'land':
        burst(e.x, GROUND - 2, 5, '#ffffff', 1.6);
        break;
    case 'net':
        audio.play('net');
        break;
    case 'wall':
        audio.play('wall');
        break;
    }
}

function onPoint(scorer) {
    const b = game.world.ball;
    audio.play('ground');
    burst(b.x, GROUND - 4, 18, '#ffffff', 4);
    game.shake = 4;
    game.scores[scorer]++;
    game.server = scorer;
    announce();
    if (game.scores[scorer] >= settings.points) {
        game.winner = scorer;
        game.poses = scorer === 0 ? ['win', 'lose'] : ['lose', 'win'];
        audio.play('win');
        setPhase('point', 110, game.mode === 'cpu' ? (scorer === 0 ? t().youWin : t().youLose) : t().wins(labels()[scorer]));
    } else {
        setTimeout(() => audio.play('whistle'), 250);
        setPhase('point', 90, t().point(labels()[scorer]));
    }
}

// ------------------------------------------------------------------ particles
function burst(x, y, n, color, speed) {
    if (reducedMotion) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = speed * (0.4 + Math.random() * 0.8);
        game.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.5, life: 30, max: 30, size: 2 + Math.random() * 2.5, color });
    }
    if (game.particles.length > 220) game.particles.splice(0, game.particles.length - 220);
}

function updateParticles() {
    for (const q of game.particles) {
        q.vy += 0.15;
        q.x += q.vx;
        q.y = Math.min(GROUND, q.y + q.vy);
        q.life--;
    }
    game.particles = game.particles.filter(q => q.life > 0);
}

// ------------------------------------------------------------------ loop
let last = performance.now();
let acc = 0;
function frame(now) {
    acc += Math.min(250, now - last);
    last = now;
    let n = 0;
    while (acc >= STEP && n < 5) {
        if (game.phase !== 'paused') step();
        acc -= STEP;
        n++;
    }
    const inMatch = game.mode !== 'demo';
    renderer.draw({
        world: game.world,
        t: game.tick,
        particles: game.particles,
        shake: game.shake,
        reducedMotion,
        scores: inMatch ? game.scores : null,
        labels: labels(),
        server: inMatch && game.phase !== 'over' ? game.server : -1,
        message: game.phase === 'paused' ? null : game.message,
        messageAge: game.messageAge,
        poses: game.poses,
        hideBall: false,
    });
    requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ UI
function showOverlay(name) {
    $$('.overlay').forEach(o => { o.hidden = o.id !== name; });
    document.body.classList.toggle('is-playing', !name || name === 'pause');
    if (name === 'over') {
        const w = game.winner;
        $('#over-title').textContent = game.mode === 'cpu' ? (w === 0 ? t().youWin : t().youLose) : t().wins(labels()[w]);
        $('#over-score').textContent = `${game.scores[0]} : ${game.scores[1]}`;
        setTimeout(() => $('#over [data-action="rematch"]').focus(), 600); // not on the same key press
    }
    if (name === 'pause') $('#pause [data-action="resume"]').focus();
}

function pause() {
    if (game.phase === 'paused' || game.mode === 'demo' || game.phase === 'over') return;
    game.resumePhase = game.phase;
    game.phase = 'paused';
    showOverlay('pause');
}

function resume() {
    if (game.phase !== 'paused') return;
    game.phase = game.resumePhase;
    showOverlay(null);
    document.activeElement?.blur?.();
}

function toMenu() {
    startDemo();
    showOverlay('menu');
    document.body.classList.remove('is-playing');
    $('#menu [data-mode="cpu"]').focus();
}

function toast(text) {
    const el = $('#toast');
    el.textContent = text;
    el.classList.add('is-on');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('is-on'), 2600);
}

function announce() {
    $('#status').textContent = game.mode === 'demo' ? '' : t().score(game.scores[0], game.scores[1]);
}

function applyText() {
    const s = t();
    document.documentElement.lang = lang;
    document.title = lang === 'ko' ? '펭귄 발리 · Penguin Volley' : 'Penguin Volley';
    $$('[data-i18n]').forEach(el => { el.textContent = s[el.dataset.i18n]; });
    $$('[data-i18n-label]').forEach(el => { el.setAttribute('aria-label', s[el.dataset.i18nLabel]); el.title = s[el.dataset.i18nLabel]; });
    canvas.setAttribute('aria-label', s.courtLabel);
    $('#lang').textContent = s.langSwitch;
    $('#lang').title = s.langTitle;
    $('#lang').setAttribute('aria-label', s.langTitle);
    $('#sound').textContent = `${s.sound}: ${audio.enabled ? s.on : s.off}`;
    $('#sound').setAttribute('aria-pressed', String(audio.enabled));
    $('#howto-list').replaceChildren(...s.howToBody.map(([k, v]) => {
        const li = document.createElement('li');
        const b = document.createElement('b');
        b.textContent = k;
        li.append(b, ' ', v);
        return li;
    }));
    $$('[data-level]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.level === settings.level)));
    $$('[data-points]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.points) === settings.points)));
    announce();
}

function bindUI() {
    $$('[data-mode]').forEach(b => b.addEventListener('click', () => { audio.unlock(); audio.play('select'); startMatch(b.dataset.mode); }));
    $$('[data-level]').forEach(b => b.addEventListener('click', () => { settings.level = b.dataset.level; save(); applyText(); audio.play('select'); }));
    $$('[data-points]').forEach(b => b.addEventListener('click', () => { settings.points = Number(b.dataset.points); save(); applyText(); audio.play('select'); }));
    $('#sound').addEventListener('click', () => {
        audio.enabled = !audio.enabled;
        settings.sound = audio.enabled;
        save();
        audio.unlock();
        audio.play('select');
        applyText();
    });
    $('#lang').addEventListener('click', () => { lang = lang === 'ko' ? 'en' : 'ko'; settings.lang = lang; save(); applyText(); });
    $$('[data-action="rematch"]').forEach(b => b.addEventListener('click', () => startMatch(game.mode === 'demo' ? 'cpu' : game.mode)));
    $$('[data-action="menu"]').forEach(b => b.addEventListener('click', toMenu));
    $$('[data-action="resume"]').forEach(b => b.addEventListener('click', resume));
    $('#pause-btn').addEventListener('click', () => (game.phase === 'paused' ? resume() : pause()));
    addEventListener('keydown', e => {
        if (e.code === 'Escape' || e.code === 'KeyP') {
            if (game.phase === 'paused') resume();
            else pause();
        }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
    // The first touch or key unlocks audio (browsers require a user gesture).
    addEventListener('pointerdown', () => audio.unlock(), { once: true });
    addEventListener('keydown', () => audio.unlock(), { once: true });
    input.bindTouch($('#touch'));

    let installEvent = null;
    addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        installEvent = e;
        $('#install').hidden = false;
    });
    $('#install').addEventListener('click', async () => {
        if (!installEvent) return;
        installEvent.prompt();
        await installEvent.userChoice.catch(() => null);
        installEvent = null;
        $('#install').hidden = true;
    });
}

function registerWorker() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register('./service-worker.js').then(reg => {
        reg.addEventListener('updatefound', () => {
            const w = reg.installing;
            w?.addEventListener('statechange', () => {
                if (w.state === 'activated' && !navigator.serviceWorker.controller) toast(t().offline);
            });
        });
    }).catch(() => { /* offline support is optional */ });
}

// ------------------------------------------------------------------ start
new ResizeObserver(() => renderer.resize()).observe(canvas);
renderer.resize();
bindUI();
applyText();
startDemo();
showOverlay('menu');
requestAnimationFrame(frame);
registerWorker();

if (new URLSearchParams(location.search).has('debug')) {
    window.__penguinVolley = { game, startMatch, settings };
}
