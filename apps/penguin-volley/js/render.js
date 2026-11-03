// Canvas drawing: an icy beach, two penguins, a ball, particles and the score.
// Everything is drawn with paths; there are no image files.
import { W, H, GROUND, NET, BALL_R } from './physics.js';

const SCARF = ['#2f7de1', '#e2483d'];
const FONT = 'system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", "Segoe UI", Roboto, sans-serif';

export function createRenderer(canvas) {
    const ctx = canvas.getContext('2d');
    let scale = 1;
    let bg = null;

    function resize() {
        // Layout width, not the on-screen box: the game may be rotated 90° on phones.
        const cssWidth = canvas.clientWidth || canvas.getBoundingClientRect().width;
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        const w = Math.max(320, Math.round(cssWidth * dpr));
        canvas.width = w;
        canvas.height = Math.round(w * H / W);
        scale = canvas.width / W;
        bg = drawBackground(canvas.width, canvas.height, scale);
    }

    function draw(s) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (bg) ctx.drawImage(bg, 0, 0);
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        if (s.shake > 0 && !s.reducedMotion) ctx.translate((Math.random() - 0.5) * s.shake, (Math.random() - 0.5) * s.shake);
        const animT = s.reducedMotion ? 0 : s.t;
        drawClouds(ctx, animT);
        if (s.target) drawTarget(ctx, s.target, animT);
        if (s.guide) drawGuide(ctx, s.guide, animT);
        if (s.phase === 'serve') drawServeAim(ctx, s.world.ball, s.server, animT);
        drawNet(ctx);
        const b = s.world.ball;
        drawShadow(ctx, b.x, b.y);
        s.world.players.forEach(p => drawShadow(ctx, p.x, p.y - 40, 34));
        s.world.players.forEach(p => drawPenguin(ctx, p, animT, s.poses?.[p.side]));
        drawParticles(ctx, s.particles);
        if (s.trail?.length) drawTrail(ctx, s.trail);
        if (!s.hideBall) drawBall(ctx, b, s.squash);
        if (s.scores) {
            drawScore(ctx, s);
            if (s.maxTouches) drawTouches(ctx, s.world.ball, s.maxTouches);
        }
        if (s.message) drawMessage(ctx, s.message, s.messageAge, s.hint);
        if (s.flash > 0) {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.fillStyle = `rgba(255, 255, 255, ${s.flash})`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
    }

    return { resize, draw };
}

function drawBackground(w, h, scale) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.scale(scale, scale);
    // sky
    let grad = g.createLinearGradient(0, 0, 0, 300);
    grad.addColorStop(0, '#8fd3ff');
    grad.addColorStop(1, '#e8f7ff');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    // sun
    g.fillStyle = 'rgba(255, 244, 196, 0.9)';
    g.beginPath();
    g.arc(660, 70, 34, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255, 244, 196, 0.25)';
    g.beginPath();
    g.arc(660, 70, 52, 0, Math.PI * 2);
    g.fill();
    // distant icebergs
    g.fillStyle = '#d7eefb';
    poly(g, [[0, 300], [60, 230], [110, 255], [170, 205], [240, 268], [300, 300]]);
    poly(g, [[470, 300], [540, 236], [580, 258], [650, 214], [720, 262], [800, 238], [800, 300]]);
    // snow caps: follow both slopes of each peak, with a soft zigzag edge
    g.fillStyle = '#f4fbff';
    poly(g, [[170, 205], [192, 225], [182, 222], [172, 230], [162, 222], [150, 222]]);
    poly(g, [[650, 214], [671, 228], [661, 226], [651, 233], [641, 226], [631, 227]]);
    // sea
    grad = g.createLinearGradient(0, 290, 0, GROUND);
    grad.addColorStop(0, '#5ab6ea');
    grad.addColorStop(1, '#2f86c8');
    g.fillStyle = grad;
    g.fillRect(0, 290, W, GROUND - 290);
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 2;
    for (const [x, y, l] of [[60, 312, 40], [250, 330, 60], [520, 318, 50], [700, 342, 40], [380, 356, 30], [120, 370, 50], [610, 376, 44]]) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + l, y);
        g.stroke();
    }
    // ice floor
    grad = g.createLinearGradient(0, GROUND, 0, H);
    grad.addColorStop(0, '#f4fbff');
    grad.addColorStop(1, '#cbe6f6');
    g.fillStyle = grad;
    g.fillRect(0, GROUND - 6, W, H - GROUND + 6);
    g.fillStyle = 'rgba(160, 205, 230, 0.6)';
    for (let x = 14; x < W; x += 46) g.fillRect(x, GROUND + 14 + ((x * 7) % 20), 18, 2);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, GROUND - 5);
    g.lineTo(W, GROUND - 5);
    g.stroke();
    return c;
}

function poly(g, pts) {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fill();
}

function drawClouds(g, t) {
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (const [x0, y, s, v] of [[80, 70, 1, 0.12], [360, 46, 0.8, 0.08], [560, 120, 0.7, 0.1]]) {
        const x = ((x0 + t * v) % (W + 160)) - 80;
        for (const [ox, oy, rx, ry] of [[0, 0, 34, 14], [24, -8, 22, 15], [-22, 2, 20, 11]]) {
            g.beginPath();
            g.ellipse(x + ox * s, y + oy * s, rx * s, ry * s, 0, 0, Math.PI * 2);
            g.fill();
        }
    }
}

function drawNet(g) {
    const x = NET.x;
    g.fillStyle = '#9fb3c4';
    g.fillRect(x - NET.halfW, NET.top, NET.halfW * 2, GROUND - NET.top);
    g.fillStyle = '#c9d8e4';
    g.fillRect(x - NET.halfW + 2, NET.top, 3, GROUND - NET.top);
    g.fillStyle = '#e2483d';
    g.beginPath();
    g.arc(x, NET.top, NET.halfW + 1, 0, Math.PI * 2);
    g.fill();
    // flag
    g.fillStyle = '#ffcc33';
    g.beginPath();
    g.moveTo(x, NET.top - 6);
    g.lineTo(x + 22, NET.top - 14);
    g.lineTo(x, NET.top - 22);
    g.closePath();
    g.fill();
    g.fillStyle = '#7d8f9e';
    g.fillRect(x - 1, NET.top - 24, 2, 20);
}

function drawShadow(g, x, y, base = BALL_R) {
    const hgt = Math.max(0, GROUND - y);
    const k = Math.max(0.25, 1 - hgt / 420);
    g.fillStyle = `rgba(40, 90, 130, ${0.22 * k})`;
    g.beginPath();
    g.ellipse(x, GROUND + 2, base * 1.1 * k, 5 * k, 0, 0, Math.PI * 2);
    g.fill();
}

/** Practice target zone. */
function drawTarget(g, target, t) {
    const pulse = 1 + Math.sin(t * 0.18) * 0.06;
    g.save();
    g.translate(target.x, GROUND + 1);
    g.scale(pulse, pulse);
    g.fillStyle = 'rgba(255, 204, 51, 0.3)';
    g.strokeStyle = '#d89a00';
    g.lineWidth = 4;
    g.beginPath();
    g.ellipse(0, 0, target.width / 2, 13, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = '#d89a00';
    g.beginPath();
    g.arc(0, 0, 5, 0, Math.PI * 2);
    g.fill();
    g.restore();
}

/** Three serve choices fan out from the held ball. */
function drawServeAim(g, ball, side, t) {
    const dir = side === 0 ? 1 : -1;
    g.save();
    g.globalAlpha = 0.55 + Math.sin(t * 0.2) * 0.12;
    g.strokeStyle = SCARF[side];
    g.fillStyle = SCARF[side];
    g.lineWidth = 3;
    g.setLineDash([7, 6]);
    for (const [dx, dy] of [[125, -52], [145, -10], [105, 32]]) {
        g.beginPath();
        g.moveTo(ball.x + dir * 23, ball.y);
        g.quadraticCurveTo(ball.x + dir * dx * 0.55, ball.y + dy - 25, ball.x + dir * dx, ball.y + dy);
        g.stroke();
    }
    g.setLineDash([]);
    g.restore();
}

/** Competitive-rule touch counter under the score of the side in possession. */
function drawTouches(g, ball, max) {
    if (ball.lastSide < 0 || ball.touches < 1) return;
    const x = ball.lastSide === 0 ? W * 0.25 : W * 0.75;
    g.save();
    g.translate(x - (max - 1) * 8, 93);
    for (let i = 0; i < max; i++) {
        g.fillStyle = i < ball.touches ? SCARF[ball.lastSide] : 'rgba(53,80,106,0.25)';
        g.beginPath();
        g.arc(i * 16, 0, 5, 0, Math.PI * 2);
        g.fill();
    }
    g.restore();
}

/** Where the ball will land: a ring on the ice in the colour of that court's player. */
function drawGuide(g, guide, t) {
    const pulse = 1 + Math.sin(t * 0.25) * 0.08;
    g.save();
    g.translate(guide.x, GROUND + 2);
    g.scale(pulse, pulse);
    g.globalAlpha = 0.85;
    g.strokeStyle = SCARF[guide.side];
    g.lineWidth = 3;
    g.setLineDash([6, 5]);
    g.beginPath();
    g.ellipse(0, 0, 24, 7, 0, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = SCARF[guide.side];
    g.beginPath();
    g.ellipse(0, 0, 5, 2, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
}

function drawTrail(g, trail) {
    trail.forEach((p, i) => {
        const k = (i + 1) / trail.length;
        g.fillStyle = `rgba(255, 255, 255, ${0.35 * k})`;
        g.beginPath();
        g.arc(p.x, p.y, BALL_R * (0.45 + 0.5 * k), 0, Math.PI * 2);
        g.fill();
    });
}

function drawBall(g, b, squash = 0) {
    g.save();
    g.translate(b.x, b.y);
    if (squash > 0) {
        g.translate(0, BALL_R * 0.3 * squash);
        g.scale(1 + 0.3 * squash, 1 - 0.3 * squash);
    }
    g.rotate(b.angle);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(0, 0, BALL_R, 0, Math.PI * 2);
    g.fill();
    g.save();
    g.clip();
    g.lineWidth = 5;
    g.strokeStyle = '#2f7de1';
    g.beginPath();
    g.arc(-BALL_R * 1.1, 0, BALL_R * 1.25, -0.9, 0.9);
    g.stroke();
    g.strokeStyle = '#ffcc33';
    g.beginPath();
    g.arc(BALL_R * 1.1, 0, BALL_R * 1.25, Math.PI - 0.9, Math.PI + 0.9);
    g.stroke();
    g.restore();
    g.lineWidth = 2;
    g.strokeStyle = '#2b3a4a';
    g.beginPath();
    g.arc(0, 0, BALL_R, 0, Math.PI * 2);
    g.stroke();
    g.restore();
}

/** A penguin with its feet at (p.x, p.y), facing p.face. pose: 'win' | 'lose'. */
function drawPenguin(g, p, t, pose) {
    g.save();
    g.translate(p.x, p.y);
    g.scale(p.face, 1);
    const moving = p.state === 'ground' && Math.abs(p.vx) > 0.1;
    let lift = 0;
    if (p.state === 'dive') {
        g.translate(0, -18);
        g.rotate(Math.PI / 2);
        g.translate(0, 18);
    } else if (p.state === 'recover') {
        const k = p.timer / 16;
        g.translate(0, -18 * k);
        g.rotate((Math.PI / 2) * k);
        g.translate(0, 18 * k);
    } else {
        if (moving) g.rotate(Math.sin(t * 0.45) * 0.1);
        if (pose === 'win') lift = Math.abs(Math.sin(t * 0.12)) * 18;
        const sq = p.squash || 0;
        const air = p.state === 'air' ? Math.min(0.08, Math.abs(p.vy) * 0.006) : 0;
        g.scale(1 + 0.12 * sq - air, 1 - 0.12 * sq + air);
        if (p.state === 'ground' && !moving && !pose) g.translate(0, Math.sin(t * 0.08) * 1.2);
    }
    g.translate(0, -lift);

    const step = moving ? Math.sin(t * 0.45) * 3 : 0;
    // feet
    g.fillStyle = '#f59f1a';
    g.beginPath();
    g.ellipse(-10, -4 - Math.max(0, step), 11, 5, 0, 0, Math.PI * 2);
    g.ellipse(13, -4 - Math.max(0, -step), 11, 5, 0, 0, Math.PI * 2);
    g.fill();

    // back flipper
    const spiking = p.state === 'air' && (p.spike > 0 || p.vy < -4);
    const flapBack = pose === 'win' ? -2.4 : spiking ? -2.2 : p.state === 'dive' ? -1.5 : pose === 'lose' ? 0.15 : 0.35;
    flipper(g, -24, -56, flapBack, '#121a26'); // far flipper, behind the body

    // body and belly
    g.fillStyle = '#1f2a3c';
    g.beginPath();
    g.ellipse(0, -46, 31, 43, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f8fbff';
    g.beginPath();
    g.ellipse(8, -40, 21, 32, 0, 0, Math.PI * 2);
    g.fill();

    // scarf
    const col = SCARF[p.side];
    g.save();
    g.beginPath();
    g.ellipse(0, -46, 31, 43, 0, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = col;
    g.fillRect(-32, -62, 64, 9);
    g.restore();
    const wave = Math.sin(t * 0.25 + p.side) * 4 + (p.state === 'air' ? 6 : 0) + Math.min(10, Math.abs(p.vx) * 1.2);
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(-26, -60);
    g.quadraticCurveTo(-42, -56 + wave * 0.3, -50, -46 + wave);
    g.lineTo(-42, -44 + wave);
    g.quadraticCurveTo(-34, -52, -24, -53);
    g.closePath();
    g.fill();

    // face
    const sad = pose === 'lose';
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(14, -74, 7, sad ? 4 : 8, 0, 0, Math.PI * 2);
    g.ellipse(-1, -75, 5.5, sad ? 3.5 : 7, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#111827';
    g.beginPath();
    g.arc(16, -73, 3.6, 0, Math.PI * 2);
    g.arc(1, -74, 3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(17, -75, 1.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255, 140, 160, 0.55)';
    g.beginPath();
    g.ellipse(20, -60, 4.5, 3, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f59f1a';
    g.beginPath();
    g.moveTo(22, -67);
    g.quadraticCurveTo(38, -64, 40, -60);
    g.quadraticCurveTo(32, -57, 22, -58);
    g.closePath();
    g.fill();

    // front flipper
    const flapFront = pose === 'win' ? -2.6 : spiking ? -2.5 : p.state === 'dive' ? -1.2 : pose === 'lose' ? 0.05 : 0.25 + (moving ? Math.sin(t * 0.45) * 0.2 : 0);
    // near flipper sits on the dark side of the body, behind the belly
    flipper(g, -15, -54, flapFront, '#2a374c');
    g.restore();
}

function flipper(g, x, y, angle, color) {
    g.save();
    g.translate(x, y);
    g.rotate(angle);
    g.fillStyle = color;
    g.beginPath();
    g.ellipse(0, 18, 7.5, 21, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
}

function drawParticles(g, list) {
    for (const q of list) {
        g.globalAlpha = Math.max(0, q.life / q.max);
        g.fillStyle = q.color;
        g.beginPath();
        g.arc(q.x, q.y, q.size, 0, Math.PI * 2);
        g.fill();
    }
    g.globalAlpha = 1;
}

function drawScore(g, s) {
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    for (const side of [0, 1]) {
        const x = side === 0 ? W * 0.25 : W * 0.75;
        g.font = `800 46px ${FONT}`;
        g.lineWidth = 6;
        g.strokeStyle = 'rgba(255,255,255,0.9)';
        g.strokeText(String(s.scores[side]), x, 58);
        g.fillStyle = SCARF[side];
        g.fillText(String(s.scores[side]), x, 58);
        g.font = `700 14px ${FONT}`;
        g.fillStyle = '#35506a';
        g.fillText(s.labels[side], x, 78);
        if (s.server === side) {
            g.fillStyle = '#ffcc33';
            g.beginPath();
            g.arc(x + (side === 0 ? -44 : 44), 42, 6, 0, Math.PI * 2);
            g.fill();
        }
    }
}

function drawMessage(g, text, age = 30, hint = null) {
    const k = Math.min(1, age / 10);
    g.save();
    g.translate(W / 2, 175);
    g.scale(0.7 + 0.3 * k, 0.7 + 0.3 * k);
    g.globalAlpha = k;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `900 52px ${FONT}`;
    g.lineWidth = 10;
    g.strokeStyle = '#1f2a3c';
    g.strokeText(text, 0, 0);
    g.fillStyle = '#ffffff';
    g.fillText(text, 0, 0);
    if (hint) {
        // Controls reminder for the first matches: one line per player.
        g.font = `700 17px ${FONT}`;
        const lines = Array.isArray(hint) ? hint : [hint];
        const w = Math.max(...lines.map(l => g.measureText(l).width)) + 32;
        const h = lines.length * 26 + 14;
        g.fillStyle = 'rgba(31, 42, 60, 0.82)';
        roundRect(g, -w / 2, 42, w, h, 12);
        g.fill();
        g.fillStyle = '#ffffff';
        lines.forEach((l, i) => g.fillText(l, 0, 42 + 20 + i * 26));
    }
    g.restore();
}

function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
}
