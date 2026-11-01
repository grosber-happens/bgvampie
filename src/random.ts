/** Shared seeded randomness for match logic and its visible effects. */
let state = 1;
let visualState = 2;

const MODULUS = 2_147_483_647;
const RANGE = MODULUS - 1;

export function setRandomSeed(seed: number) {
  // Park–Miller needs a nonzero integer in [1, 2^31 - 2].
  const normalized = Number.isFinite(seed) ? Math.trunc(Math.abs(seed)) % RANGE : 0;
  state = normalized + 1;
  visualState = ((normalized ^ 0x5f3759df) >>> 0) % RANGE + 1;
}

function next(current: number) {
  const value = (current * 16_807) % MODULUS;
  return { state: value, value: (value - 1) / RANGE };
}

export function random() {
  const result = next(state);
  state = result.state;
  return result.value;
}

/** Cosmetic randomness uses a separate stream so particles and sounds cannot affect gameplay rolls. */
export function visualRandom() {
  const result = next(visualState);
  visualState = result.state;
  return result.value;
}
