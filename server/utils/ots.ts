/**
 * OpenTimestamps client wrapper.
 *
 * Commits a SHA-256 digest to the Bitcoin blockchain through the public
 * OpenTimestamps calendar servers. Stamping is instant and returns a
 * "pending" proof; the calendars batch thousands of digests into one Bitcoin
 * transaction, and an hour or more later the proof can be upgraded to a
 * complete one that names the Bitcoin block. Free, no wallet involved.
 *
 * Wrapped behind an interface so the anchor sweep can be tested offline.
 */

export interface OtsProofInfo {
  complete: boolean;
  /** Bitcoin block height of the attestation, once complete. */
  height: number | null;
  /** Calendar URIs still pending. */
  pendingCalendars: string[];
}

export interface OtsClient {
  /** Stamp a 32-byte hex digest. Returns the serialized (pending) .ots proof. */
  stamp(digestHex: string): Promise<Buffer>;
  /** Ask the calendars whether the proof can be completed. */
  upgrade(proof: Buffer): Promise<{ proof: Buffer; changed: boolean }>;
  inspect(proof: Buffer): Promise<OtsProofInfo>;
}

// The library has no type declarations.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let libPromise: Promise<any> | null = null;
function lib() {
  if (!libPromise) {
    // @ts-ignore untyped CommonJS module
    libPromise = import('opentimestamps').then((m) => m.default ?? m);
  }
  return libPromise;
}

/** The library narrates every calendar round-trip on console.log; keep it out of the service log. */
async function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const orig = console.log;
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.log = orig;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const t = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

function deserialize(OTS: any, proof: Buffer) {
  return OTS.DetachedTimestampFile.deserialize(new Uint8Array(proof));
}

function describe(detached: any): OtsProofInfo {
  let height: number | null = null;
  const pendingCalendars: string[] = [];
  detached.timestamp.allAttestations().forEach((att: any) => {
    const kind = att?.constructor?.name;
    if (kind === 'BitcoinBlockHeaderAttestation' && typeof att.height === 'number') {
      height = height === null ? att.height : Math.min(height, att.height);
    } else if (kind === 'PendingAttestation' && typeof att.uri === 'string') {
      pendingCalendars.push(att.uri);
    }
  });
  return { complete: Boolean(detached.timestamp.isTimestampComplete()), height, pendingCalendars };
}

export const realOtsClient: OtsClient = {
  async stamp(digestHex) {
    if (!/^[0-9a-f]{64}$/i.test(digestHex)) throw new Error('stamp: digest must be 32 bytes hex');
    const OTS = await lib();
    const detached = OTS.DetachedTimestampFile.fromHash(new OTS.Ops.OpSHA256(), Buffer.from(digestHex, 'hex'));
    await withTimeout(quiet(() => OTS.stamp(detached)), 60_000, 'OpenTimestamps stamp');
    return Buffer.from(detached.serializeToBytes());
  },

  async upgrade(proof) {
    const OTS = await lib();
    const detached = deserialize(OTS, proof);
    const changed: boolean = await withTimeout(quiet(() => OTS.upgrade(detached)), 60_000, 'OpenTimestamps upgrade');
    return { proof: changed ? Buffer.from(detached.serializeToBytes()) : proof, changed };
  },

  async inspect(proof) {
    const OTS = await lib();
    return describe(deserialize(OTS, proof));
  },
};
