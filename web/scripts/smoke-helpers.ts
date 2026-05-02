import { longestTurn } from "../src/lib/longestTurn";
import { pca2D } from "../src/lib/pca";

const segs = [
  { start: 0, end: 1, speaker: "SPEAKER_00" },
  { start: 1.1, end: 2, speaker: "SPEAKER_00" },
  { start: 2.5, end: 3, speaker: "SPEAKER_01" },
  { start: 3.1, end: 8, speaker: "SPEAKER_00" }, // longest single
];
console.log("longestTurn S_00:", longestTurn(segs, "SPEAKER_00"));
// expected: { start: 3.1, end: 8 }  — duration 4.9 > 2.0 from the merged 0..2 turn

console.log("longestTurn S_01:", longestTurn(segs, "SPEAKER_01"));
// expected: { start: 2.5, end: 3 }

const points = pca2D([
  [1, 2, 3],
  [1.1, 2.1, 3.1],
  [10, 20, 30],
]);
console.log("pca2D first two points should be close, third far:", points);
