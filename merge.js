// Syncing through put.io's per-app config. Every entry carries `at`, and the newer copy wins whole.

// What to take from put.io (newer than this device's copy) and what to send up (put.io lacks it or holds an
// older copy). Both sides are { key: { at, ... } }; entries without a numeric `at` are ignored.
export function compare(local, remote) {
  const ok = (v) => typeof v?.at === 'number';
  return {
    take: Object.keys(remote).filter((k) => ok(remote[k]) && !(local[k]?.at >= remote[k].at)),
    send: Object.keys(local).filter((k) => ok(local[k]) && !(remote[k]?.at >= local[k].at)),
  };
}

// Times for new entries: the clock, but never behind a time already seen, so a change made here always beats
// the one before it, even when another device's clock runs fast.
// ponytail: a fast clock drags every device's times ahead with it; harmless, they only get compared with each other.
let seen = 0;
export const see = (at) => { if (at > seen) seen = at; };
export const stamp = () => (seen = Math.max(Date.now(), seen + 1));
