// CPU player. It sees the same world as a person (positions and velocities),
// predicts the ball with the shared physics, and presses the same buttons.
// Difficulty changes how often it re-plans, how accurately it reads the ball,
// how often it attacks and how well it picks a spike; it never moves faster
// than a person can.
import { GROUND, NET, BALL_R, HOME_X, moveBall, hitCircle, spikeVelocity, makeRng } from './physics.js';

// react: frames before the CPU responds after the opponent touches the ball
// (a person needs roughly 150-300 ms).
const LEVELS = {
    easy: { replan: 14, noise: 40, attack: 0.3, dive: false, pick: 0, reach: 40, react: 18 },
    normal: { replan: 7, noise: 18, attack: 0.65, dive: true, pick: 0.6, reach: 52, react: 13 },
    hard: { replan: 3, noise: 5, attack: 0.95, dive: true, pick: 1, reach: 62, react: 9 },
};
export const AI_LEVELS = Object.keys(LEVELS);

const CONTACT_Y = GROUND - 80; // ball height where a standing penguin meets it
const noRng = () => 0.5;
const SPIKES = [
    { down: true }, {}, { up: true },
    { down: true, back: true }, { back: true }, { up: true, back: true },
];

export function createAI(side, level = 'normal', seed = 7) {
    return { side, cfg: LEVELS[level] || LEVELS.normal, rng: makeRng(seed), timer: 0, plan: null, jumpArmed: true, hitArmed: true, upLast: false, hitLast: false };
}

/** Where (and in how many frames) the ball reaches contact height on `side`, or null. */
function predict(ball, side) {
    const b = { ...ball };
    for (let t = 1; t <= 160; t++) {
        moveBall(b, noRng, null);
        const mine = side === 0 ? b.x < NET.x : b.x > NET.x;
        if (b.vy > 0 && b.y >= CONTACT_Y) return mine ? { x: b.x, t } : null;
    }
    return null;
}

/**
 * If the ball will pass through spike height (well above a standing penguin) on
 * this side 13-21 frames from now, within reach of a penguin at `px`, return
 * where and when.
 */
function spikeWindow(ball, side, px, reach) {
    const b = { ...ball };
    for (let t = 1; t <= 21; t++) {
        moveBall(b, noRng, null);
        if (t < 13) continue;
        const mine = side === 0 ? b.x < NET.x - 10 : b.x > NET.x + 10;
        if (mine && b.y > GROUND - 260 && b.y < GROUND - 175 && Math.abs(b.x - px) < reach + 5.4 * t * 0.5) return { x: b.x, t };
    }
    return null;
}

/** Where a ball with this velocity lands: { x, side } (side 0 = left court). */
function landing(ball) {
    const b = { ...ball };
    for (let t = 1; t <= 200; t++) {
        moveBall(b, noRng, null);
        if (b.y + BALL_R >= GROUND) return { x: b.x, side: b.x < NET.x ? 0 : 1, t };
    }
    return null;
}

/** Keys for a spike: the best of the options that land in the other court, or a random one. */
function chooseSpike(ai, world) {
    const b = world.ball;
    const toNet = ai.side === 0 ? 1 : -1;
    const opp = world.players[1 - ai.side];
    const options = SPIKES.map(s => {
        const keys = { up: !!s.up, down: !!s.down, left: s.back ? toNet > 0 : toNet < 0, right: s.back ? toNet < 0 : toNet > 0 };
        const v = spikeVelocity(ai.side, keys);
        const land = landing({ ...b, vx: v.vx, vy: v.vy });
        const good = land && land.side !== ai.side;
        // Prefer balls that land far from the opponent and arrive quickly.
        const score = good ? Math.abs(land.x - opp.x) - land.t * 1.5 : -Infinity;
        return { keys, score };
    });
    if (ai.rng() < ai.cfg.pick) {
        options.sort((a, c) => c.score - a.score);
        return options[0].keys;
    }
    return options[Math.floor(ai.rng() * 3)].keys; // one of the forward options
}

export function aiInput(ai, world) {
    const p = world.players[ai.side];
    const b = world.ball;
    const cfg = ai.cfg;
    const toNet = ai.side === 0 ? 1 : -1;
    const input = { left: false, right: false, up: false, down: false, hit: false };

    // The opponent just touched the ball: keep the old plan for a moment.
    const touchId = `${b.lastSide}:${b.touches}:${world.players[1 - ai.side].cooldown > 0}`;
    if (b.lastSide === 1 - ai.side && touchId !== ai.lastTouch) ai.timer = Math.max(ai.timer, cfg.react);
    ai.lastTouch = touchId;

    if (--ai.timer <= 0) {
        ai.timer = cfg.replan;
        const land = predict(b, ai.side);
        if (land) {
            const noise = (ai.rng() - 0.5) * 2 * cfg.noise * Math.min(1, land.t / 40);
            // Stand slightly behind the ball so the touch sends it towards the net.
            ai.plan = { x: land.x - toNet * 14 + noise, t: land.t };
        } else {
            ai.plan = null;
        }
    } else if (ai.plan) {
        ai.plan.t--;
    }

    const target = ai.plan ? ai.plan.x : HOME_X[ai.side];
    const dx = target - p.x;
    if (Math.abs(dx) > 5) {
        if (dx < 0) input.left = true;
        else input.right = true;
    }

    const ballMine = ai.side === 0 ? b.x < NET.x + 20 : b.x > NET.x - 20;
    const near = Math.abs(b.x - p.x);

    // Dive for a ball that will land out of reach.
    if (cfg.dive && ai.plan && p.state === 'ground' && Math.abs(dx) > 110 && ai.plan.t < 16 && ai.hitArmed) {
        input.hit = true;
        input.left = dx < 0;
        input.right = dx > 0;
        ai.hitArmed = false;
    }

    // Jump to attack: leave the ground when the ball will be at spike height near
    // the top of the jump (the penguin rises for about 20 frames).
    if (p.state === 'ground' && ballMine && ai.jumpArmed) {
        const meet = spikeWindow(b, ai.side, p.x, cfg.reach);
        if (meet) {
            ai.jumpArmed = false;
            if (ai.rng() < cfg.attack) {
                input.up = true;
                ai.plan = { x: meet.x - toNet * 12, t: meet.t };
            }
        }
    }
    if (p.state === 'ground' && !(ballMine && b.y < GROUND - 160)) ai.jumpArmed = true;
    if (p.state === 'air') ai.plan = { x: b.x - toNet * 12, t: 0 }; // steer under the ball

    // In the air: spike when the ball is about to touch.
    if (p.state === 'air') {
        const h = hitCircle(p);
        const d = Math.hypot(b.x - h.cx, b.y - h.cy);
        if (d < h.r + BALL_R + 30 && ai.hitArmed) {
            ai.spikeKeys = chooseSpike(ai, world);
            input.hit = true;
            ai.hitArmed = false;
        }
        if (ai.spikeKeys) {
            // Up/down can be held all the way; left/right would move the penguin,
            // so they are pressed only as the ball touches.
            input.up = ai.spikeKeys.up;
            input.down = ai.spikeKeys.down;
            if (d < h.r + BALL_R + 6) {
                input.left = ai.spikeKeys.left;
                input.right = ai.spikeKeys.right;
            }
        }
    }
    if (p.state === 'ground') {
        if (!input.hit) ai.hitArmed = true;
        ai.spikeKeys = null;
    }

    // Buttons must be released between presses.
    if (input.up && ai.upLast) input.up = p.state === 'air'; // in the air "up" is a direction, not a jump
    if (input.hit && ai.hitLast) input.hit = false;
    ai.upLast = input.up;
    ai.hitLast = input.hit;
    return input;
}
