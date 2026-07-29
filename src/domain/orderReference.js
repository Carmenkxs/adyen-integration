import crypto from 'node:crypto';

// crypto.randomUUID() gives 122 bits of randomness — unguessable, since the
// session-fetch endpoint trusts possession of this reference alone.
export function generateOrderReference() {
  return crypto.randomUUID();
}
