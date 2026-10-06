// Penguin Volley physics. Pure and deterministic: no DOM, fixed 60 Hz steps,
// randomness only from the world's seeded generator. Units are logical pixels
// on an 800 x 450 court; y grows downwards.

export const W = 800;
export const H = 450;
export const GROUND = 400;
export const NET = { x: 400, halfW: 6, top: 252 };
export const BALL_R = 18;

const PLAYER = {
    halfW: 30,        // half body width, for walls and the net
    hitR: 38,         // contact circle radius (standing / jumping)
    hitY: 46,         // contact circle centre above the feet
    speed: 5.4,
    jumpV: -14,
    gravity: 0.7,
};
const BALL_G = 0.34;
const BALL_MAX = 19;
const NET_BOUNCE = 0.8;
const HIT_COOLDOWN = 10;   // frames a player cannot touch the ball again
const SPIKE_WINDOW = 10;   // frames after pressing hit in the air that a touch is a spike
const DIVE_FRAMES = 22;
const RECOVER_FRAMES = 16;
const DIVE_SPEED = 10.5;

export const HOME_X = [200, 600];

/** Small seeded PRNG (mulberry32). */
export function makeRng(seed = 1) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export const NO_INPUT = Object.freeze({ left: false, right: false, up: false, down: false, hit: false });

export function createPlayer(side) {
    return {
        side,
        x: HOME_X[side] - (side === 0 ? 30 : -30),
        y: GROUND,
        vx: 0,
        vy: 0,
        state: 'ground', // ground | air | dive | recover
        timer: 0,
        spike: 0,
        cooldown: 0,
        face: side === 0 ? 1 : -1,
        input: NO_INPUT,
        prev: NO_INPUT,
        squash: 0, // landing squash, decays (visual only)
    };
}

export function createBall(server) {
    return { x: server === 0 ? 170 : 630, y: 110, vx: 0, vy: 0, angle: 0, touches: 0, lastSide: -1 };
}

export function createWorld(seed = 1, server = 0) {
    return { players: [createPlayer(0), createPlayer(1)], ball: createBall(server), frame: 0, rng: makeRng(seed) };
}

/** Put players and ball back for a new rally served by `server`. */
export function resetRally(world, server) {
    world.players = [createPlayer(0), createPlayer(1)];
    world.ball = createBall(server);
}

const minX = side => (side === 0 ? PLAYER.halfW : NET.x + NET.halfW + PLAYER.halfW);
const maxX = side => (side === 0 ? NET.x - NET.halfW - PLAYER.halfW : W - PLAYER.halfW);

/** Contact circle of a player (lower and smaller while diving or getting up). */
export function hitCircle(p) {
    return p.state === 'dive' || p.state === 'recover'
        ? { cx: p.x, cy: p.y - 24, r: 32 }
        : { cx: p.x, cy: p.y - PLAYER.hitY, r: PLAYER.hitR };
}

function stepPlayer(p, input, events) {
    const pressed = k => input[k] && !p.prev[k];
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    p.input = input;
    if (p.cooldown > 0) p.cooldown--;
    if (p.spike > 0) p.spike--;
    if (p.squash > 0) p.squash *= 0.8;

    switch (p.state) {
    case 'ground':
        p.vx = dir * PLAYER.speed;
        if (dir) p.face = dir;
        if (pressed('hit') && dir !== 0) {
            p.state = 'dive';
            p.timer = DIVE_FRAMES;
            p.vx = dir * DIVE_SPEED;
            p.vy = -3.5;
            p.face = dir;
            events.push({ type: 'dive', side: p.side, x: p.x, y: p.y });
        } else if (pressed('up')) {
            p.state = 'air';
            p.vy = PLAYER.jumpV;
            events.push({ type: 'jump', side: p.side, x: p.x, y: p.y });
        }
        break;
    case 'air':
        p.vx = dir * PLAYER.speed;
        if (dir) p.face = dir;
        if (pressed('hit')) p.spike = SPIKE_WINDOW;
        break;
    case 'dive':
        p.vx *= 0.965;
        if (--p.timer <= 0 && p.y >= GROUND) {
            p.state = 'recover';
            p.timer = RECOVER_FRAMES;
            p.vx = 0;
        }
        break;
    case 'recover':
        p.vx = 0;
        if (--p.timer <= 0) p.state = 'ground';
        break;
    }

    p.vy += PLAYER.gravity;
    p.x += p.vx;
    p.y += p.vy;
    if (p.y >= GROUND) {
        if (p.state === 'air') {
            p.state = 'ground';
            p.squash = 1;
            events.push({ type: 'land', side: p.side, x: p.x, y: GROUND });
        }
        p.y = GROUND;
        p.vy = 0;
    }
    const lo = minX(p.side);
    const hi = maxX(p.side);
    if (p.x < lo) p.x = lo;
    if (p.x > hi) p.x = hi;
    // Keep facing the net while standing still.
    if (p.state === 'ground' && dir === 0) p.face = p.side === 0 ? 1 : -1;
    p.prev = input;
}

function clampSpeed(b) {
    const s = Math.hypot(b.vx, b.vy);
    if (s > BALL_MAX) {
        b.vx *= BALL_MAX / s;
        b.vy *= BALL_MAX / s;
    }
}

/** Walls and net only: shared by the game and by the AI's prediction. */
export function moveBall(b, rng, events) {
    b.vy += BALL_G;
    b.x += b.vx;
    b.y += b.vy;
    b.angle += b.vx * 0.045;
    if (b.y < -600) b.y = -600; // no ceiling, but stay within reach of gravity

    if (b.x < BALL_R) {
        b.x = BALL_R;
        b.vx = Math.abs(b.vx);
        events?.push({ type: 'wall', x: b.x, y: b.y });
    } else if (b.x > W - BALL_R) {
        b.x = W - BALL_R;
        b.vx = -Math.abs(b.vx);
        events?.push({ type: 'wall', x: b.x, y: b.y });
    }

    // Net: a post with a rounded top.
    const L = NET.x - NET.halfW;
    const R = NET.x + NET.halfW;
    if (b.y < NET.top) {
        const dx = b.x - NET.x;
        const dy = b.y - NET.top;
        const d = Math.hypot(dx, dy);
        const min = BALL_R + NET.halfW;
        if (d < min) {
            let nx = d > 0 ? dx / d : 0;
            let ny = d > 0 ? dy / d : -1;
            if (Math.abs(nx) < 0.05) { // dead centre: tip it to one side
                nx = rng() < 0.5 ? -0.3 : 0.3;
                const n = Math.hypot(nx, ny);
                nx /= n;
                ny /= n;
            }
            b.x = NET.x + nx * min;
            b.y = NET.top + ny * min;
            const vn = b.vx * nx + b.vy * ny;
            if (vn < 0) {
                b.vx -= (1 + NET_BOUNCE) * vn * nx;
                b.vy -= (1 + NET_BOUNCE) * vn * ny;
            }
            events?.push({ type: 'net', x: b.x, y: b.y });
        }
    } else if (b.x + BALL_R > L && b.x - BALL_R < R) {
        if (b.x < NET.x) {
            b.x = L - BALL_R;
            b.vx = -Math.abs(b.vx) * NET_BOUNCE;
        } else {
            b.x = R + BALL_R;
            b.vx = Math.abs(b.vx) * NET_BOUNCE;
        }
        events?.push({ type: 'net', x: b.x, y: b.y });
    }
}

/** Ball velocity after a spike by `side` with keys `inp` held (down: steep, up: lob). */
export function spikeVelocity(side, inp) {
    const toNet = side === 0 ? 1 : -1;
    let vx;
    let vy;
    if (inp.down) { vx = toNet * 11.5; vy = 12.5; }
    else if (inp.up) { vx = toNet * 8.5; vy = -9; }
    else { vx = toNet * 17.5; vy = 3; }
    const held = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (held === -toNet) vx *= 0.55; // pulling back: softer, steeper
    return { vx, vy };
}

function touchBall(p, b, events) {
    if (p.cooldown > 0) return;
    const h = hitCircle(p);
    const dx = b.x - h.cx;
    const dy = b.y - h.cy;
    const d = Math.hypot(dx, dy);
    const min = BALL_R + h.r;
    if (d >= min) return;
    const nx = d > 0 ? dx / d : 0;
    const ny = d > 0 ? dy / d : -1;
    b.x = h.cx + nx * min;
    b.y = h.cy + ny * min;
    const toNet = p.side === 0 ? 1 : -1;
    const inp = p.input;
    let type = 'hit';
    if (p.state === 'air' && p.spike > 0) {
        const v = spikeVelocity(p.side, inp);
        b.vx = v.vx;
        b.vy = v.vy;
        p.spike = 0;
        type = 'spike';
    } else if (p.state === 'dive') {
        b.vx = toNet * 3 + p.vx * 0.2;
        b.vy = -12.5;
    } else {
        const sp = Math.max(9.5, Math.hypot(b.vx, b.vy) * 0.8);
        b.vx = nx * sp + p.vx * 0.45;
        b.vy = ny * sp + Math.min(0, p.vy) * 0.4;
        if (ny < 0.6) b.vy = Math.min(b.vy, -8.5);
        // A bump carries the ball a little towards the net unless the player pulls
        // away, so a ball cannot bounce on one spot forever.
        const held = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
        if (held !== -toNet) b.vx += toNet * 2;
    }
    clampSpeed(b);
    p.cooldown = HIT_COOLDOWN;
    b.touches = b.lastSide === p.side ? b.touches + 1 : 1;
    b.lastSide = p.side;
    events.push({ type, side: p.side, x: b.x, y: b.y, power: Math.hypot(b.vx, b.vy) });
}

/**
 * Advance one frame. `inputs` is [p1, p2]. Returns { events, scorer } where
 * scorer is the side that won the point (0 or 1) when the ball hit the ground.
 */
export function stepWorld(world, inputs) {
    const events = [];
    world.frame++;
    world.players.forEach((p, i) => stepPlayer(p, inputs[i] || NO_INPUT, events));
    const b = world.ball;
    moveBall(b, world.rng, events);
    for (const p of world.players) touchBall(p, b, events);
    let scorer = -1;
    if (b.y + BALL_R >= GROUND) {
        b.y = GROUND - BALL_R;
        scorer = b.x < NET.x ? 1 : 0;
        events.push({ type: 'ground', x: b.x, y: GROUND, side: scorer === 1 ? 0 : 1 });
    }
    return { events, scorer };
}
