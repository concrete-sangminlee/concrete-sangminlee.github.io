// Procedural audio + haptic vocabulary for the game's feedback layer. The pattern
// tables are data; playSoundPattern() is a pure synthesis function over a caller-
// provided AudioContext. All gating (media-feedback unlock, mute toggles, volume/
// intensity preferences, test mirrors) deliberately stays in app.js — this module
// answers "how does X sound/feel", never "should it play right now".

export const SOUND_PATTERNS = {
  tap: [
    { frequency: 420, delay: 0, duration: 0.045, gain: 0.025, type: "triangle" },
    { frequency: 640, delay: 0.035, duration: 0.055, gain: 0.022, type: "triangle" },
  ],
  select: [{ frequency: 520, delay: 0, duration: 0.06, gain: 0.025, type: "sine" }],
  place: [
    { frequency: 190, delay: 0, duration: 0.075, gain: 0.04, type: "triangle" },
    { frequency: 310, delay: 0.04, duration: 0.08, gain: 0.028, type: "sine" },
  ],
  thinking: [
    { frequency: 330, delay: 0, duration: 0.05, gain: 0.02, type: "sine" },
    { frequency: 392, delay: 0.08, duration: 0.05, gain: 0.018, type: "sine" },
  ],
  sequence: [
    { frequency: 392, delay: 0, duration: 0.11, gain: 0.035, type: "triangle" },
    { frequency: 494, delay: 0.08, duration: 0.12, gain: 0.035, type: "triangle" },
    { frequency: 659, delay: 0.16, duration: 0.16, gain: 0.034, type: "triangle" },
  ],
  jackWild: [
    { frequency: 294, delay: 0, duration: 0.09, gain: 0.04, type: "triangle" },
    { frequency: 440, delay: 0.055, duration: 0.1, gain: 0.035, type: "sine" },
    { frequency: 740, delay: 0.13, duration: 0.16, gain: 0.03, type: "triangle" },
  ],
  jackCut: [
    { frequency: 196, delay: 0, duration: 0.08, gain: 0.04, type: "sawtooth" },
    { frequency: 147, delay: 0.075, duration: 0.11, gain: 0.034, type: "triangle" },
    { frequency: 392, delay: 0.16, duration: 0.1, gain: 0.025, type: "sine" },
  ],
  victory: [
    { frequency: 392, delay: 0, duration: 0.14, gain: 0.034, type: "triangle" },
    { frequency: 523, delay: 0.12, duration: 0.16, gain: 0.034, type: "triangle" },
    { frequency: 659, delay: 0.25, duration: 0.2, gain: 0.034, type: "triangle" },
    { frequency: 784, delay: 0.42, duration: 0.28, gain: 0.03, type: "sine" },
  ],
  error: [{ frequency: 130, delay: 0, duration: 0.14, gain: 0.035, type: "sawtooth" }],
  // High-frequency click attack + low sine thud body — felt-on-wood character for the
  // physics-driven chip drop. Distinct from `place` so the new drop animation has its
  // own voice and the original card-placement sound stays unchanged for other paths.
  chipDrop: [
    { frequency: 1800, delay: 0, duration: 0.018, gain: 0.024, type: "square" },
    { frequency: 150, delay: 0.012, duration: 0.07, gain: 0.044, type: "sine" },
    { frequency: 95, delay: 0.018, duration: 0.06, gain: 0.028, type: "sine" },
  ],
  // Descending minor-third for the losing side at match end — paired with `victory` so
  // both teams hear *something* at the conclusion. Without this the loser's client
  // emits only the polite announcement, which feels anticlimactic on a multi-minute match.
  defeat: [
    { frequency: 330, delay: 0, duration: 0.16, gain: 0.03, type: "sine" },
    { frequency: 277, delay: 0.13, duration: 0.18, gain: 0.028, type: "sine" },
    { frequency: 247, delay: 0.27, duration: 0.24, gain: 0.024, type: "sine" },
  ],
  // Two-tone rising chime for the "your turn" handoff. Distinct from `select` (which
  // fires on card pickup) so the player can tell at-a-glance whether the sound means
  // "your turn just started" or "you selected a card".
  turnStart: [
    { frequency: 523, delay: 0, duration: 0.07, gain: 0.028, type: "triangle" },
    { frequency: 784, delay: 0.05, duration: 0.1, gain: 0.026, type: "triangle" },
  ],
};

export function playSoundPattern(context, name, volumeScale) {
  const notes = SOUND_PATTERNS[name] || SOUND_PATTERNS.tap;
  const startAt = context.currentTime + 0.01;
  for (const note of notes) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = note.type;
    oscillator.frequency.setValueAtTime(note.frequency, startAt + note.delay);
    gain.gain.setValueAtTime(0.0001, startAt + note.delay);
    gain.gain.exponentialRampToValueAtTime(note.gain * volumeScale, startAt + note.delay + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + note.delay + note.duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt + note.delay);
    oscillator.stop(startAt + note.delay + note.duration + 0.03);
  }
}

// Named haptic patterns. Each action picks one of these instead of passing raw
// millisecond values, so the vocabulary stays consistent across the codebase and
// can be tuned in one place. Vibration API takes either a single ms number (one
// pulse) or an array alternating vibrate/pause/vibrate/pause.
export const HAPTIC = Object.freeze({
  LIGHT: 8,                          // taps, card selects — nearly subliminal
  MEDIUM: 15,                        // card plays, board commits
  HEAVY: 30,                         // chip drop (PR-2)
  SEQUENCE: [25, 50, 25],            // sequence completion (PR-3) — double-tap pattern
  VICTORY: [50, 100, 50, 100, 50],   // match win — celebratory triple-tap
});
