// Penguin Volley: game flow, menus and the main loop.
import { createWorld, stepWorld, resetRally, placeServe, launchServe, predictLanding, NO_INPUT, GROUND } from './physics.js';
import { createAI, aiInput, aiServeInput } from './ai.js';
import { createRenderer } from './render.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { STRINGS, detectLang } from './i18n.js';
import { loadStats, recordMatch, recordPractice, resetStats, LEVELS } from './stats.js';

const STORE = 'penguin-volley';
const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
let reducedMotion = motionPreference.matches;
const coarsePointer = matchMedia('(hover: none) and (pointer: coarse)');
const portrait = matchMedia('(orientation: portrait)');
const isTouch = () => coarsePointer.matches;
const SPEED = { normal: 1, slow: 0.78 };
const HINT_MATCHES = 3; // show the controls reminder in the first matches

// ------------------------------------------------------------------ settings
const oneOf = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;
const finiteInt = (value, fallback) => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : fallback;
function load() {
    let raw = {};
    try { raw = JSON.parse(localStorage.getItem(STORE)) || {}; } catch { /* use defaults */ }
    return {
        level: oneOf(raw.level, LEVELS, isTouch() ? 'easy' : 'normal'),
        points: [5, 10, 15].includes(Number(raw.points)) ? Number(raw.points) : 15,
        sound: typeof raw.sound === 'boolean' ? raw.sound : true,
        lang: oneOf(raw.lang, ['ko', 'en'], null),
        speed: oneOf(raw.speed, Object.keys(SPEED), 'normal'),
        guide: typeof raw.guide === 'boolean' ? raw.guide : isTouch(),
        vibration: typeof raw.vibration === 'boolean' ? raw.vibration : true,
        rules: oneOf(raw.rules, ['arcade', 'competitive'], 'arcade'),
        matchesStarted: finiteInt(raw.matchesStarted, 0),
    };
}
const settings = load();
function save() {
    try { localStorage.setItem(STORE, JSON.stringify(settings)); } catch { /* private mode */ }
}
let lang = detectLang(settings.lang);
const t = () => STRINGS[lang];
let stats = loadStats();

// ------------------------------------------------------------------ state
const canvas = $('#court');
const renderer = createRenderer(canvas);
const audio = createAudio();
audio.enabled = settings.sound;
const input = createInput({
    isActive: () => game.phase === 'play' || game.phase === 'ready',
    onPadChange: (pad, on) => toast(on ? t().padOn : t().padOff),
});

const game = {
    mode: 'demo',     // demo (attract, behind the menu) | cpu | 2p
    phase: 'menu',    // menu | ready | serve | play | point | over | paused
    resumePhase: null,
    world: createWorld(Date.now() & 0xffff, 0),
    ais: [],
    scores: [0, 0],
    server: 0,
    timer: 0,
    message: null,
    messageAge: 0,
    hint: null,
    particles: [],
    trail: [],
    shake: 0,
    flash: 0,
    whistle: 0,       // simulation frames until the referee whistle
    freeze: 0,        // hit-stop frames after a spike
    tick: 0,
    poses: null,
    winner: -1,
    rallyTouches: 0,
    longestRally: 0,
    spikes: 0,
    showHints: false,
    serveFrames: 0,
    pointReason: null,
    practice: null,
    target: null,
    lastEvent: 'opened',
    pausedEvent: null,
};

function resetForRally(server) {
    resetRally(game.world, server);
    placeServe(game.world, server);
    const seed = (Math.random() * 1e9) | 0;
    if (game.mode === 'demo') game.ais = [createAI(0, 'normal', seed), createAI(1, 'normal', seed ^ 0x5bd1e995)];
    else if (game.mode === 'cpu') game.ais = [null, createAI(1, settings.level, seed)];
    else game.ais = [];
}

function startDemo() {
    game.mode = 'demo';
    game.world = createWorld((Math.random() * 1e9) | 0, 0);
    resetForRally(0);
    launchServe(game.world, 0, aiServeInput(game.ais[0], game.world));
    game.scores = [0, 0];
    game.phase = 'menu';
    game.message = null;
    game.hint = null;
    game.whistle = 0;
    game.freeze = 0;
    game.practice = null;
    game.target = null;
    game.lastEvent = 'menu';
    game.poses = null;
    game.trail = [];
    announce();
}

function startMatch(mode) {
    input.reset();
    game.mode = mode;
    returnFocus = null;
    game.world = createWorld((Math.random() * 1e9) | 0, 0);
    game.ais = [];
    game.scores = [0, 0];
    game.server = 0;
    game.winner = -1;
    game.poses = null;
    game.particles = [];
    game.trail = [];
    game.rallyTouches = 0;
    game.longestRally = 0;
    game.spikes = 0;
    game.pointReason = null;
    game.practice = mode === 'practice' ? { attempts: 0, hits: 0, total: 10 } : null;
    game.target = null;
    game.lastEvent = 'ready';
    game.showHints = settings.matchesStarted < HINT_MATCHES;
    game.whistle = 0;
    game.freeze = 0;
    settings.matchesStarted++;
    save();
    resetForRally(0);
    readyPhase(80, true);
    showOverlay(null);
    document.body.classList.add('is-playing');
    document.activeElement?.blur?.();
    if (mode === '2p' && isTouch() && input.padCount < 2) toast(t().keyboardOnly);
    if (mode === 'practice') game.target = nextTarget();
    updateRotation();
    if (isTouch()) enterLandscape();
    announce();
}

function setPhase(phase, timer = 0, message = null, hint = null) {
    game.phase = phase;
    game.timer = timer;
    game.message = message;
    game.hint = hint;
    game.messageAge = 0;
}

function readyPhase(frames, opening = false) {
    const a = game.scores[0];
    const b = game.scores[1];
    const competitive = settings.rules === 'competitive' && game.mode !== 'practice';
    const deuce = competitive && a >= settings.points - 1 && b >= settings.points - 1 && a === b;
    const matchPoint = game.mode !== 'practice' && !deuce && [0, 1].some(side => game.scores[side] >= settings.points - 1 && game.scores[side] > game.scores[1 - side]);
    const hint = opening && game.showHints ? hintText() : null;
    game.lastEvent = 'ready';
    setPhase('ready', frames + (hint ? 50 : 0), deuce ? t().deuce : matchPoint ? t().matchPoint : t().ready, hint);
    announce();
}

/** Controls reminder for the devices in use. */
function hintText() {
    const s = t();
    if (game.mode === 'practice') return s.hintServe;
    if (game.mode === '2p') {
        if (input.padCount >= 2) return [`${s.p1}: ${s.hintPad}`, `${s.p2}: ${s.hintPad}`];
        return [s.hintKeys1, s.hintKeys2];
    }
    if (isTouch() || input.touchUsed) return s.hintTouch;
    if (input.padCount > 0) return s.hintPad;
    return s.hintCpuKeys;
}

const labels = () => {
    if (game.mode === 'cpu') return [t().p1, t().cpu];
    if (game.mode === 'practice') return [t().hits, t().attempts];
    return [t().p1, t().p2];
};
const maxTouches = () => settings.rules === 'competitive' && game.mode !== 'demo' && game.mode !== 'practice' ? 3 : 0;
const wonMatch = side => game.scores[side] >= settings.points
    && (settings.rules !== 'competitive' || game.scores[side] - game.scores[1 - side] >= 2);

function nextTarget() {
    const centers = [480, 600, 720];
    const n = (game.practice?.attempts || 0) % centers.length;
    return { x: centers[(n + ((Math.random() * centers.length) | 0)) % centers.length], side: 1, width: 82 };
}

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
    game.flash = Math.max(0, game.flash - 0.04);
    updateParticles();
    if (game.whistle > 0 && --game.whistle === 0) audio.play('whistle');
    if (game.freeze > 0) { game.freeze--; return; }

    switch (game.phase) {
    case 'menu': {
        const res = stepWorld(game.world, inputs());
        if (res.scorer >= 0) {
            resetForRally(res.scorer);
            launchServe(game.world, res.scorer, aiServeInput(game.ais[res.scorer], game.world));
        }
        break;
    }
    case 'ready':
        // Everyone waits for the referee; then the server chooses a serve.
        if (--game.timer <= 0) beginServe();
        break;
    case 'serve':
        stepServe();
        break;
    case 'play': {
        const controls = game.mode === 'practice' ? [NO_INPUT, NO_INPUT] : inputs();
        const res = stepWorld(game.world, controls, { maxTouches: maxTouches(), allowContacts: game.mode !== 'practice' });
        res.events.forEach(onEvent);
        updateTrail();
        if (res.scorer >= 0) {
            if (game.mode === 'practice') onPracticeLanding();
            else onPoint(res.scorer, res.reason);
        }
        break;
    }
    case 'point':
        // The ball stays where it landed; airborne penguins come down.
        stepPlayersOnly([NO_INPUT, NO_INPUT]);
        if (--game.timer <= 0) {
            if (game.winner >= 0) {
                setPhase('over');
                if (game.mode === 'practice') finishPractice();
                else finishMatch();
                showOverlay('over');
            } else {
                resetForRally(game.server);
                if (game.mode === 'practice') game.target = nextTarget();
                game.trail = [];
                readyPhase(50);
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
    stepWorld(game.world, playerInputs, { allowContacts: false });
    Object.assign(b, keep);
}

function beginServe() {
    input.reset();
    game.serveFrames = 0;
    game.lastEvent = 'serve';
    setPhase('serve', 240, t().serve, t().serveHint);
    announce();
}

function stepServe() {
    game.serveFrames++;
    const aiServing = game.mode === 'demo' || (game.mode === 'cpu' && game.server === 1);
    let serve = null;
    if (aiServing && game.serveFrames >= 35) serve = aiServeInput(game.ais[game.server], game.world);
    else if (!aiServing) {
        const controls = input.read(game.mode === 'cpu' || game.mode === 'practice');
        const current = controls[game.server] || controls[0];
        if ((current.hit && game.serveFrames > 8) || game.timer <= 0) serve = current;
    }
    if (serve) {
        launchServe(game.world, game.server, serve);
        game.lastEvent = 'served';
        setPhase('play');
        audio.play('hit');
        announce();
        return;
    }
    game.timer--;
}

function onPracticeLanding() {
    const p = game.practice;
    const x = game.world.ball.x;
    const hit = Math.abs(x - game.target.x) <= game.target.width / 2;
    p.attempts++;
    if (hit) p.hits++;
    game.scores = [p.hits, p.attempts];
    game.lastEvent = hit ? 'targetHit' : 'targetMiss';
    game.winner = p.attempts >= p.total ? 0 : -1;
    setPhase('point', hit ? 65 : 55, hit ? t().targetHit : t().targetMiss);
    announce();
}

function updateTrail() {
    const b = game.world.ball;
    if (Math.hypot(b.vx, b.vy) > 12 && !reducedMotion) game.trail.push({ x: b.x, y: b.y });
    else if (game.trail.length) game.trail.shift();
    if (game.trail.length > 6) game.trail.shift();
}

function onEvent(e) {
    const mine = game.mode !== '2p' && e.side === 0;
    switch (e.type) {
    case 'hit':
        game.rallyTouches++;
        audio.play('hit');
        burst(e.x, e.y, 6, '#ffffff', 2.2);
        if (mine) buzz(12);
        break;
    case 'spike':
        game.rallyTouches++;
        if (game.mode === 'cpu' && e.side === 0) game.spikes++;
        audio.play('spike');
        game.shake = 7;
        if (!reducedMotion) {
            game.freeze = 4;
            game.flash = 0.22;
        }
        burst(e.x, e.y, 14, '#ffe27a', 4);
        if (mine) buzz(30);
        break;
    case 'jump':
        audio.play('jump');
        break;
    case 'dive':
        audio.play('dive');
        burst(e.x, GROUND - 4, 12, '#ffffff', 3);
        if (mine) buzz(18);
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
    case 'clash':
        audio.play('spike');
        game.shake = 5;
        game.flash = reducedMotion ? 0 : 0.14;
        burst(e.x, e.y, 12, '#ffffff', 3.5);
        game.lastEvent = 'clash';
        break;
    case 'touchFault':
        game.lastEvent = 'touchFault';
        break;
    case 'iceWind':
        game.message = t().iceWind;
        game.messageAge = 0;
        game.lastEvent = 'iceWind';
        audio.play('whistle');
        announce();
        break;
    }
}

function onPoint(scorer, reason = 'ground') {
    const b = game.world.ball;
    audio.play(reason === 'touchFault' ? 'whistle' : 'ground');
    burst(b.x, reason === 'touchFault' ? b.y : GROUND - 4, 18, reason === 'touchFault' ? '#ff8b80' : '#ffffff', 4);
    game.shake = 4;
    game.trail = [];
    game.scores[scorer]++;
    game.server = scorer;
    game.pointReason = reason;
    game.lastEvent = reason === 'touchFault' ? 'touchFault' : 'point';
    game.longestRally = Math.max(game.longestRally, game.rallyTouches);
    game.rallyTouches = 0;
    if (wonMatch(scorer)) {
        game.winner = scorer;
        game.poses = scorer === 0 ? ['win', 'lose'] : ['lose', 'win'];
        audio.play('win');
        buzz(game.mode === 'cpu' && scorer === 1 ? [80] : [60, 40, 90]);
        setPhase('point', 110, game.mode === 'cpu' ? (scorer === 0 ? t().youWin : t().youLose) : t().wins(labels()[scorer]));
    } else {
        game.whistle = 15;
        buzz(40);
        const pointMessage = reason === 'touchFault' ? t().touchFault(labels()[1 - scorer]) : t().point(labels()[scorer]);
        setPhase('point', 90, pointMessage);
    }
    announce();
}

function finishMatch() {
    const res = recordMatch(stats, {
        mode: game.mode,
        level: settings.level,
        rules: settings.rules,
        won: game.winner === 0,
        longestRally: game.longestRally,
        spikes: game.spikes,
    });
    stats = res.stats;
    const notes = [];
    if (res.newBest.includes('rally')) notes.push(t().newRecordRally(stats.longestRally));
    if (res.newBest.includes('streak')) notes.push(t().newRecordStreak(stats.bestStreak));
    $('#over-record').textContent = notes.join(' · ');
    renderRecords();
}

function finishPractice() {
    const res = recordPractice(stats, game.practice.hits);
    stats = res.stats;
    $('#over-record').textContent = res.improved ? t().newPracticeBest(stats.practiceBest) : '';
    renderRecords();
}

// ------------------------------------------------------------------ feedback
function buzz(pattern) {
    if (settings.vibration && isTouch() && navigator.vibrate) navigator.vibrate(pattern);
}

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
    // Slow speed: the same 60 physics steps per game second, spread over more real time.
    const stepMs = 1000 / (60 * (SPEED[settings.speed] || 1));
    acc += Math.min(250, now - last);
    last = now;
    let n = 0;
    while (acc >= stepMs && n < 5) {
        if (game.phase !== 'paused') step();
        acc -= stepMs;
        n++;
    }
    // A suspended/backgrounded tab must not replay seconds of stale simulation.
    if (n === 5) acc = Math.min(acc, stepMs);
    if (input.startPressed()) {
        if (game.phase === 'paused') resume();
        else pause();
    }
    const inMatch = game.mode !== 'demo';
    const b = game.world.ball;
    const displayScores = game.mode === 'practice' && game.practice ? [game.practice.hits, game.practice.attempts] : game.scores;
    let guide = null;
    if (settings.guide && inMatch && game.phase === 'play' && (b.vx || b.vy)) {
        const land = predictLanding(b);
        if (land) guide = land;
    }
    renderer.draw({
        world: game.world,
        t: game.tick,
        particles: game.particles,
        trail: game.trail,
        shake: game.shake,
        flash: game.flash,
        squash: game.phase === 'point' && game.messageAge < 14 ? 1 - game.messageAge / 14 : 0,
        guide,
        reducedMotion,
        scores: inMatch ? displayScores : null,
        labels: labels(),
        server: inMatch && game.phase !== 'over' ? game.server : -1,
        phase: game.phase,
        maxTouches: maxTouches(),
        target: game.mode === 'practice' ? game.target : null,
        message: game.phase === 'paused' ? null : game.message,
        hint: game.phase === 'ready' ? game.hint : null,
        messageAge: game.messageAge,
        poses: game.poses,
    });
    requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ phones: landscape
/**
 * On phones, a match goes full screen and locks to landscape where the browser
 * allows it (Android). Where it does not (iPhone, or a declined request), a
 * portrait screen shows the game rotated a quarter turn: CSS, .is-rotated.
 */
async function enterLandscape() {
    const el = document.documentElement;
    try {
        if (!document.fullscreenElement && el.requestFullscreen && document.fullscreenEnabled) await el.requestFullscreen({ navigationUI: 'hide' });
        await screen.orientation?.lock?.('landscape');
    } catch { /* not supported or not allowed: the CSS rotation covers it */ }
    updateRotation();
}

async function leaveLandscape() {
    document.documentElement.classList.remove('is-rotated');
    try { screen.orientation?.unlock?.(); } catch { /* unsupported */ }
    try { if (isTouch() && document.fullscreenElement) await document.exitFullscreen(); } catch { /* unsupported */ }
    renderer.resize();
}

function updateRotation() {
    const activeMatch = game.mode !== 'demo';
    document.documentElement.classList.toggle('is-rotated', activeMatch && isTouch() && portrait.matches);
    renderer.resize();
}

async function toggleFullscreen() {
    try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else if (isTouch()) await enterLandscape();
        else await document.documentElement.requestFullscreen();
    } catch { /* ignored */ }
    updateRotation();
}

// ------------------------------------------------------------------ UI
let activeDialog = null;
let returnFocus = null;
let installEvent = null;
let updateWorker = null;
let reloadForUpdate = false;

const dialogNames = new Set(['pause', 'over', 'install-help']);
const focusable = root => [...root.querySelectorAll('button:not([hidden]):not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]
    .filter(el => !el.closest('[hidden]'));

function setGameplayInert(on) {
    [canvas, $('#pause-btn'), $('.hud-right'), $('#touch')].forEach(el => { if (el) el.inert = on; });
}

function showOverlay(name) {
    if (dialogNames.has(name) && !activeDialog) returnFocus = document.activeElement;
    activeDialog = dialogNames.has(name) ? $(`#${name}`) : null;
    if (!activeDialog && name === 'menu') returnFocus = null;
    $$('.overlay').forEach(o => { o.hidden = o.id !== name; });
    setGameplayInert(!!activeDialog);
    document.body.classList.toggle('is-playing', !name || name === 'pause');
    if (name === 'over') {
        const w = game.winner;
        $('#over-title').textContent = game.mode === 'practice' ? t().practiceComplete
            : game.mode === 'cpu' ? (w === 0 ? t().youWin : t().youLose)
                : t().wins(labels()[w]);
        $('#over-score').textContent = game.mode === 'practice' ? `${game.practice.hits} / ${game.practice.total}` : `${game.scores[0]} : ${game.scores[1]}`;
    }
    if (activeDialog) requestAnimationFrame(() => focusable(activeDialog)[0]?.focus());
}

function pause() {
    if (game.phase === 'paused' || game.mode === 'demo' || game.phase === 'over') return;
    game.resumePhase = game.phase;
    game.pausedEvent = game.lastEvent;
    game.phase = 'paused';
    game.lastEvent = 'paused';
    input.reset();
    showOverlay('pause');
    announce();
}

function resume() {
    if (game.phase !== 'paused') return;
    game.phase = game.resumePhase;
    game.lastEvent = game.pausedEvent || (game.phase === 'serve' ? 'serve' : 'point');
    game.pausedEvent = null;
    showOverlay(null);
    input.reset();
    (returnFocus?.isConnected ? returnFocus : $('#pause-btn')).focus?.();
    returnFocus = null;
    announce();
}

function toMenu() {
    startDemo();
    game.whistle = 0;
    showOverlay('menu');
    document.body.classList.remove('is-playing');
    input.reset();
    leaveLandscape();
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
    const s = t();
    const score = game.mode === 'practice' && game.practice
        ? `${game.practice.hits} / ${game.practice.total}`
        : s.score(game.scores[0], game.scores[1]);
    const phase = s[`phase${game.phase[0].toUpperCase()}${game.phase.slice(1)}`] || game.phase;
    const server = game.mode === 'demo' || game.phase === 'menu' ? s.notSelected : labels()[game.server];
    const event = s[`event${game.lastEvent[0].toUpperCase()}${game.lastEvent.slice(1)}`] || game.lastEvent;
    $('#game-status-score').textContent = score;
    $('#game-status-phase').textContent = phase;
    $('#game-status-server').textContent = server;
    $('#game-status-last-event').textContent = event;
    if (game.mode === 'demo') $('#status').textContent = '';
    else $('#status').textContent = [score, game.message || '', game.hint ? (Array.isArray(game.hint) ? game.hint.join('. ') : game.hint) : ''].filter(Boolean).join('. ');
}

function renderRecords() {
    const s = t();
    const rows = LEVELS.map(l => {
        const tr = document.createElement('tr');
        const a = stats.cpu[l];
        const c = stats.competitive[l];
        for (const v of [s[l], `${a.w}–${a.l}`, `${c.w}–${c.l}`]) {
            const td = document.createElement(v === s[l] ? 'th' : 'td');
            td.textContent = String(v);
            tr.append(td);
        }
        return tr;
    });
    $('#rec-body').replaceChildren(...rows);
    $('#rec-extra').replaceChildren(...[
        s.recStreak(stats.bestStreak),
        s.recRally(stats.longestRally),
        s.recSpikes(stats.spikes),
        s.recPractice(stats.practiceBest),
    ].map(text => {
        const li = document.createElement('li');
        li.textContent = text;
        return li;
    }));
}

const toggleLabel = (name, on) => `${t()[name]}: ${on ? t().on : t().off}`;

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
    for (const [id, key, on] of [['#sound', 'sound', audio.enabled], ['#guide', 'guide', settings.guide], ['#vibration', 'vibration', settings.vibration]]) {
        $(id).textContent = toggleLabel(key, on);
        $(id).setAttribute('aria-pressed', String(on));
    }
    $('#howto-list').replaceChildren(...s.howToBody.map(([k, v]) => {
        const li = document.createElement('li');
        const b = document.createElement('b');
        b.textContent = k;
        li.append(b, ' ', v);
        return li;
    }));
    $$('[data-level]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.level === settings.level)));
    $$('[data-points]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.points) === settings.points)));
    $$('[data-speed]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.speed === settings.speed)));
    $$('[data-rules]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.rules === settings.rules)));
    $('#rules-help').textContent = settings.rules === 'competitive' ? s.rulesCompetitiveHelp : s.rulesArcadeHelp;
    const fs = !!document.fullscreenElement;
    $$('[data-action="fullscreen"]').forEach(b => {
        b.setAttribute('aria-label', fs ? s.exitFullscreen : s.fullscreen);
        b.title = fs ? s.exitFullscreen : s.fullscreen;
        if (b.dataset.text !== undefined) b.textContent = fs ? s.exitFullscreen : s.fullscreen;
    });
    $('#vibration').hidden = !isTouch();
    renderRecords();
    announce();
}

function bindUI() {
    const pick = (attr, key, parse = v => v) => $$(`[data-${attr}]`).forEach(b => b.addEventListener('click', () => {
        settings[key] = parse(b.dataset[attr]);
        save();
        applyText();
        audio.play('select');
    }));
    $$('[data-mode]').forEach(b => b.addEventListener('click', () => { audio.unlock(); audio.play('select'); startMatch(b.dataset.mode); }));
    pick('level', 'level');
    pick('points', 'points', Number);
    pick('speed', 'speed');
    pick('rules', 'rules');
    $('#sound').addEventListener('click', () => {
        audio.enabled = !audio.enabled;
        settings.sound = audio.enabled;
        save();
        audio.unlock();
        audio.play('select');
        applyText();
    });
    $('#guide').addEventListener('click', () => { settings.guide = !settings.guide; save(); applyText(); audio.play('select'); });
    $('#vibration').addEventListener('click', () => { settings.vibration = !settings.vibration; save(); applyText(); buzz(20); });
    $('#lang').addEventListener('click', () => { lang = lang === 'ko' ? 'en' : 'ko'; settings.lang = lang; save(); applyText(); });
    $('#rec-reset').addEventListener('click', () => {
        if (confirm(t().recResetConfirm)) { stats = resetStats(); renderRecords(); }
    });
    $$('[data-action="rematch"]').forEach(b => b.addEventListener('click', () => startMatch(game.mode === 'demo' ? 'cpu' : game.mode)));
    $$('[data-action="menu"]').forEach(b => b.addEventListener('click', toMenu));
    $$('[data-action="resume"]').forEach(b => b.addEventListener('click', resume));
    $$('[data-action="fullscreen"]').forEach(b => b.addEventListener('click', toggleFullscreen));
    if (!document.fullscreenEnabled) $$('[data-action="fullscreen"]').forEach(b => { b.hidden = true; });
    document.addEventListener('fullscreenchange', () => { applyText(); updateRotation(); });
    $('#pause-btn').addEventListener('click', () => (game.phase === 'paused' ? resume() : pause()));
    addEventListener('keydown', e => {
        if (e.key === 'Tab' && activeDialog) {
            const list = focusable(activeDialog);
            if (!list.length) return;
            const first = list[0];
            const last = list[list.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            return;
        }
        if (e.code === 'Escape' && activeDialog?.id === 'install-help') {
            e.preventDefault();
            closeInstallHelp();
            return;
        }
        if (e.code === 'Escape' || e.code === 'KeyP') {
            if (game.phase === 'paused') resume();
            else pause();
        }
    });
    document.addEventListener('visibilitychange', () => {
        input.reset();
        if (document.hidden) pause();
    });
    // The first touch or key unlocks audio (browsers require a user gesture).
    addEventListener('pointerdown', () => audio.unlock(), { once: true });
    addEventListener('keydown', () => audio.unlock(), { once: true });
    input.bindTouch($('#touch'));
    const onOrientation = () => { input.reset(); updateRotation(); };
    if (portrait.addEventListener) portrait.addEventListener('change', onOrientation);
    else portrait.addListener(onOrientation);
    if (coarsePointer.addEventListener) coarsePointer.addEventListener('change', () => { input.reset(); applyText(); updateRotation(); });
    const onMotion = e => { reducedMotion = e.matches; if (reducedMotion) { game.trail = []; game.flash = 0; game.shake = 0; game.freeze = 0; } };
    if (motionPreference.addEventListener) motionPreference.addEventListener('change', onMotion);
    else motionPreference.addListener(onMotion);
    if (!isTouch()) $('#vibration').hidden = true;

    const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (ios && !installed) $('#install').hidden = false;
    addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        installEvent = e;
        $('#install').hidden = false;
    });
    $('#install').addEventListener('click', async () => {
        if (!installEvent) {
            showOverlay('install-help');
            return;
        }
        installEvent.prompt();
        await installEvent.userChoice.catch(() => null);
        installEvent = null;
        $('#install').hidden = true;
    });
    $('#install-help-close').addEventListener('click', closeInstallHelp);
    $('#update').addEventListener('click', () => {
        if (!updateWorker) return;
        reloadForUpdate = true;
        updateWorker.postMessage({ type: 'SKIP_WAITING' });
    });
    addEventListener('appinstalled', () => {
        installEvent = null;
        $('#install').hidden = true;
        toast(t().offline);
    });
}

function closeInstallHelp() {
    const focus = returnFocus;
    showOverlay('menu');
    (focus?.isConnected ? focus : $('#install')).focus?.();
    returnFocus = null;
}

function offerUpdate(worker) {
    updateWorker = worker;
    $('#update').hidden = false;
    toast(t().updateReady);
}

function registerWorker() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloadForUpdate) location.reload();
    });
    navigator.serviceWorker.register('./service-worker.js').then(reg => {
        if (reg.waiting) offerUpdate(reg.waiting);
        reg.addEventListener('updatefound', () => {
            const w = reg.installing;
            w?.addEventListener('statechange', () => {
                if (w.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(w);
                else if (w.state === 'activated' && !navigator.serviceWorker.controller) toast(t().offline);
            });
        });
    }).catch(() => { /* offline support is optional */ });
}

// ------------------------------------------------------------------ start
new ResizeObserver(() => renderer.resize()).observe(canvas);
updateRotation();
bindUI();
applyText();
startDemo();
showOverlay('menu');
requestAnimationFrame(frame);
registerWorker();

if (new URLSearchParams(location.search).has('debug')) {
    window.__penguinVolley = { game, startMatch, settings, get stats() { return stats; } };
}
