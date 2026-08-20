/**
 * JSON codec for SDK values that contain bigints.
 *
 * Election records, encrypted ballots, keys and proofs are bigint-heavy, and
 * JSON has no bigint type. `toJsonSafe` deep-replaces every bigint with a
 * tagged object `{ "$b": "<hex>" }`; `fromJsonSafe` reverses it. Use
 * `toJsonSafe` before persisting an SDK value to a JSON/JSONB column or
 * sending it over the wire, and `fromJsonSafe` after reading it back.
 *
 * The transform is structural and recursive — it needs no per-type schema,
 * so it handles any SDK value (a `CiphertextBallot`, an `ElectionRecord`, …)
 * unchanged.
 */

/** Tag key marking an encoded bigint. */
const BIGINT_TAG = '$b';

/** Recursively replace every bigint with `{ "$b": "<hex>" }`. */
export function toJsonSafe(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return { [BIGINT_TAG]: value.toString(16) };
  }
  if (Array.isArray(value)) {
    return value.map((v) => toJsonSafe(v));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = toJsonSafe(v);
    return out;
  }
  return value;
}

/** Recursively reverse {@link toJsonSafe}, restoring bigints. */
export function fromJsonSafe(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => fromJsonSafe(v));
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 1 && keys[0] === BIGINT_TAG && typeof obj[BIGINT_TAG] === 'string') {
      return BigInt(`0x${obj[BIGINT_TAG]}`);
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = fromJsonSafe(v);
    return out;
  }
  return value;
}
