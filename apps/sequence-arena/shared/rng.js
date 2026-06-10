// Deterministic pseudo-random number generator.
// Mulberry32 picked because it is small, famous, and passes BigCrush-adjacent smoke suites.

export function createSeededRng(seed) {
  let state = (typeof seed === "number" ? seed : hashStringToSeed(String(seed ?? ""))) >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStringToSeed(value) {
  // Variation of FNV-1a 32-bit. Deterministic, dependency-free, collision resistance is enough for seeding.
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
