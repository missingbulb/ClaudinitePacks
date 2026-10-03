// Whether a signed file on the `vendored` branch may be carried forward or re-signed. It may when
// its own signature verifies against the roots, now ("current") or at an instant inside its
// certificate's window, the case of an expired or rotated certificate ("stale"); or, inside that
// window, against previous roots a run names for one convergence after a change of roots
// ("stale"). Anything else, a missing signature or bytes it does not cover included, throws: the
// release programs never put the signing key on bytes nothing vouches for.
import { existsSync, readFileSync } from 'node:fs';
import { decodeB64 } from '../sign/sign.mjs';
import { ReleaseError } from './branch.mjs';

function windowInstant(signed) {
  try {
    const b = JSON.parse(decodeB64(signed.certificate.payload).toString('utf8'));
    const nb = Date.parse(b.notBefore);
    const na = Date.parse(b.notAfter);
    if (Number.isFinite(nb) && Number.isFinite(na) && na > nb) return new Date(nb + (na - nb) / 2);
  } catch { /* the verifiers below say why */ }
  return null;
}

/**
 * @param {string} label the file, for the error
 * @param {Buffer} bytes the signed file's bytes
 * @param {string} sigFile the path of its signature
 * @param {(bytes: Buffer, signed: object, roots: Buffer[], now: Date) => unknown} verify
 * @returns {'current' | 'stale'}
 */
export function trustOf(label, bytes, sigFile, verify, { roots, previousRoots = null, now }) {
  if (!existsSync(sigFile)) throw new ReleaseError(`${label} has no signature on the branch; refusing to sign bytes nothing vouches for`);
  let signed;
  try { signed = JSON.parse(readFileSync(sigFile, 'utf8')); } catch (e) { throw new ReleaseError(`${label}'s signature is not JSON: ${e.message}`); }
  const ok = (r, at) => {
    try {
      verify(bytes, signed, r, at);
      return true;
    } catch {
      return false;
    }
  };
  if (ok(roots, now)) return 'current';
  const at = windowInstant(signed);
  if (at && (ok(roots, at) || (previousRoots && ok(previousRoots, at)))) return 'stale';
  throw new ReleaseError(`${label} does not verify against --roots or --previous-roots; refusing to sign bytes nothing vouches for`);
}
