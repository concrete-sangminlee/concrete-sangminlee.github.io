// Pure input validation helpers shared between server and tests.
// Keep this module dependency-free so it can be unit-tested without the WebSocket server.

export const MAX_PLAYER_NAME_LENGTH = 40;
export const MAX_ROOM_CODE_LENGTH = 6;
export const MIN_SESSION_ID_LENGTH = 8;
export const MAX_SESSION_ID_LENGTH = 128;
export const ROOM_CODE_PATTERN = /^[A-Z0-9]{4,6}$/;
const SESSION_ID_PATTERN = /^[A-Za-z0-9._\-]+$/;
const CONTROL_CHARS_PATTERN = /[\u0000-\u001f\u007f]/g;
// Bidi-control and directional-isolate codepoints (U+202A..202E, U+2066..2069). These do not
// render as glyphs but flip the direction of surrounding characters, enabling spoofed names
// that read backwards in the UI. Strip them — no legitimate player name needs them.
const BIDI_CONTROL_PATTERN = /[\u202a-\u202e\u2066-\u2069]/g;

// Zero-width and invisible-formatting codepoints (ZWSP, ZWNJ, ZWJ, LRM, RLM, ALM, Word
// Joiner, BOM). Two visually identical names can hide one of these and still pass the eye's
// equality check, enabling impersonation in seat lists. A display name does not need
// invisible formatting to function, so strip them on input.
const INVISIBLE_PATTERN = new RegExp(
  "[\\u061C\\u200B-\\u200F\\u2060\\uFEFF]",
  "g"
);

export function sanitizeName(raw, maxLength = MAX_PLAYER_NAME_LENGTH) {
  if (typeof raw !== "string") {
    return "";
  }
  // Unicode NFKC normalisation collapses compatibility forms onto their canonical
  // equivalents — fullwidth Latin (Ｂｏｂ) → ASCII (Bob), circled digits (①) → 1, ligatures
  // (ﬁ) → fi, half-width katakana → full-width katakana, compatibility Hangul jamo →
  // standard jamo. Without this step a malicious player can register "Ｂｏｂ" while another
  // is "Bob" and the seat list looks identical to spectators. NFKC runs before the strip
  // pass so any NFKC-produced control or bidi codepoint also gets caught.
  const cleaned = raw
    .normalize("NFKC")
    .replace(CONTROL_CHARS_PATTERN, "")
    .replace(BIDI_CONTROL_PATTERN, "")
    .replace(INVISIBLE_PATTERN, "")
    .trim();
  if (cleaned.length === 0) {
    return "";
  }
  // String#slice cuts at UTF-16 code units, which can split a surrogate pair (any non-BMP
  // codepoint such as most emoji). The result is a lone surrogate that renders as the
  // replacement glyph and breaks downstream consumers. Iterate codepoints with [...str] so
  // each emoji counts as one unit and the boundary is always between codepoints.
  const codepoints = [...cleaned];
  if (codepoints.length <= maxLength) {
    return cleaned;
  }
  return codepoints.slice(0, maxLength).join("");
}

export function sanitizeRoomCode(raw) {
  if (typeof raw !== "string") {
    return "";
  }
  const normalized = raw.toUpperCase().slice(0, MAX_ROOM_CODE_LENGTH);
  return ROOM_CODE_PATTERN.test(normalized) ? normalized : "";
}

export function sanitizeSessionId(raw) {
  if (typeof raw !== "string") {
    return "";
  }
  if (raw.length < MIN_SESSION_ID_LENGTH || raw.length > MAX_SESSION_ID_LENGTH) {
    return "";
  }
  return SESSION_ID_PATTERN.test(raw) ? raw : "";
}
