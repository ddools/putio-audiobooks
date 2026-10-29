// Run with: node test/merge.test.mjs
import assert from 'node:assert/strict';
import { compare, see, stamp } from '../merge.js';

const local = {
  pos_a: { at: 5 },  // newer here: send
  pos_b: { at: 5 },  // newer on put.io: take
  pos_c: { at: 5 },  // the same: neither
  pos_d: { at: 5 },  // put.io lacks it: send
};
const remote = {
  pos_a: { at: 4 },
  pos_b: { at: 6 },
  pos_c: { at: 5 },
  pos_e: { at: 1 },  // new to this device: take
  pos_f: { s: 3 },   // no time: ignored
  pos_g: null,
};
const { take, send } = compare(local, remote);
assert.deepEqual(take.sort(), ['pos_b', 'pos_e']);
assert.deepEqual(send.sort(), ['pos_a', 'pos_d']);

// A device whose clock is an hour fast wrote last; a change made here must still win.
const ahead = Date.now() + 3600e3;
see(ahead);
const mine = stamp();
assert.ok(mine > ahead);
assert.ok(stamp() > mine);
assert.deepEqual(compare({ pos_a: { at: mine } }, { pos_a: { at: ahead } }), { take: [], send: ['pos_a'] });

console.log('merge.js ok');
