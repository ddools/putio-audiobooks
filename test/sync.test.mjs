// Run with: node test/sync.test.mjs
import assert from 'node:assert/strict';
import { bodyRange, learn, locate, makeMap, matchChapters, timedWords, titleKey, titleScore, wordAt, wordIndex } from '../sync.js';

// Titles
const k = titleKey('Chapter Twenty-One: The Storm');
assert.equal(k.label, 'chapter');
assert.equal(k.num, 21);
assert.deepEqual([...k.words], ['storm']);
assert.equal(titleKey('CHAPTER XIV').num, 14);
assert.equal(titleKey('Kapitel 3').num, 3);
assert.equal(titleKey('I Understand').num, null); // a pronoun, not a numeral
const score = (a, b) => titleScore(titleKey(a), titleKey(b));
assert.ok(score('Chapter 3', '3') >= 1.5);
assert.ok(score('Chapter 3', 'Chapter Three: The Road') >= 1.5);
assert.ok(score('Prologue', 'Prologue') >= 1.5);
assert.equal(score('Chapter 3', 'Chapter 4'), 0);
assert.equal(score('Part 3', 'Chapter 3'), 0); // split files are not chapters
assert.equal(score('Track 3', '3'), 0);
assert.ok(score('The Boy Who Lived', '1. The Boy Who Lived') >= 1.5);

// Front and back matter
const toc = [
  { title: 'Cover', pos: 0 }, { title: 'Copyright', pos: 100 }, { title: 'Contents', pos: 300 },
  { title: 'Chapter 1', pos: 1000 }, { title: 'Chapter 2', pos: 4000 }, { title: 'Chapter 3', pos: 7000 },
  { title: 'Acknowledgements', pos: 10000 }, { title: 'About the Author', pos: 10500 },
];
assert.deepEqual(bodyRange(toc, 11000), [1000, 10000]);
assert.deepEqual(bodyRange([], 500), [0, 500]);
assert.deepEqual(bodyRange([{ title: 'Covered in Snow', pos: 0 }, { title: 'Acknowledgments', pos: 90 }], 100), [0, 90]);

// Chapters matched by title: the opening credits have no partner
const audio = [{ title: 'Opening Credits', a: 0 }, { title: 'Chapter 1', a: 0.01 }, { title: 'Chapter 2', a: 0.34 }, { title: 'Chapter 3', a: 0.66 }];
const m = matchChapters(audio, toc, 11000);
assert.deepEqual(m.anchors, [[0.01, 1000], [0.34, 4000], [0.66, 7000]]);
assert.deepEqual(m.body, [1000, 10000]);

// Files named only by number, one per chapter: matched by where they fall
const numbered = [0, 0.33, 0.67].map((a, i) => ({ title: `Part ${i + 1}`, a }));
assert.equal(matchChapters(numbered, toc, 11000).anchors.length, 3);
// Hour-long parts that don't line up with chapters: nothing to anchor
assert.equal(matchChapters([0, 0.5].map((a, i) => ({ title: `Part ${i + 1}`, a })), toc, 11000).anchors.length, 0);

// The map: interpolates between anchors, runs the ends to the story's edges, and inverts
const map = makeMap({ chapters: m.anchors, body: m.body, length: 11000 });
assert.equal(map.toText(0.01), 1000);
assert.equal(map.toText(0.5), 5500);
assert.equal(map.toText(1), 10000);
assert.equal(map.toText(0), 1000);
assert.ok(Math.abs(map.toAudio(5500) - 0.5) < 1e-9);
// A learned anchor outranks a chapter match it contradicts
const fixed = makeMap({ learned: [[0.4, 3900]], chapters: m.anchors, body: m.body, length: 11000 });
assert.equal(fixed.toText(0.4), 3900);
assert.ok(!fixed.points.some((p) => p[0] === 0.34));
// No anchors at all: the whole story, start to end
assert.equal(makeMap({ body: [1000, 10000], length: 11000 }).toText(0.5), 5500);

// Learning replaces snaps from the same moment
let learned = learn([], [0.2, 100]);
learned = learn(learned, [0.20001, 120]);
learned = learn(learned, [0.5, 900]);
assert.deepEqual(learned, [[0.20001, 120], [0.5, 900]]);

// Finding what was heard, with recognition mistakes, in a long text
const filler = Array.from({ length: 3000 }, (_, i) => `word${i % 97} lorem ipsum dolor`).join(' ');
const passage = 'The bears came home from their walk and found the door of their little house wide open, and the porridge gone';
const text = `${filler} ${passage}. ${filler}`;
const index = wordIndex(text);
const heard = timedWords([
  { text: ' the bares came home from their walk and found the door', timestamp: [0, 4] },
  { text: ' of their little house wide open and the porridge gone.', timestamp: [4, 8] },
], 100, 8);
assert.equal(heard[0].w, 'the');
assert.ok(heard[0].t >= 100 && heard.at(-1).t <= 108);
const hit = locate(index, heard, 0);
assert.ok(hit, 'found the passage');
assert.equal(index.starts[hit.start], text.indexOf(passage));
assert.equal(heard[hit.qEnd].w, 'gone');
assert.equal(text.slice(index.starts[hit.end], index.starts[hit.end] + 4), 'gone');
assert.equal(wordAt(index, text.indexOf(passage) + 2), hit.start);
// Words that aren't in the book at all
assert.equal(locate(index, timedWords([{ text: 'completely unrelated speech about quantum spaceships', timestamp: [0, 5] }], 0, 5), 0), null);

console.log('sync.js ok');
