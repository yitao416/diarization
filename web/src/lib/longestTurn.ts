import type { Segment } from "../types";

export type Turn = { start: number; end: number };

export function longestTurn(
  segments: Segment[],
  speaker: string,
  gapThreshold = 0.3,
): Turn | null {
  const turns: Turn[] = [];
  let current: Turn | null = null;
  for (const seg of segments) {
    if (seg.speaker !== speaker) {
      if (current) {
        turns.push(current);
        current = null;
      }
      continue;
    }
    if (!current) {
      current = { start: seg.start, end: seg.end };
    } else if (seg.start - current.end <= gapThreshold) {
      current.end = seg.end;
    } else {
      turns.push(current);
      current = { start: seg.start, end: seg.end };
    }
  }
  if (current) turns.push(current);
  if (turns.length === 0) return null;
  return turns.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));
}
