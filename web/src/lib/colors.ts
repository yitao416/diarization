export const PALETTE = [
  "#5cc8ff", // cyan
  "#ffb74d", // amber
  "#e879f9", // magenta
  "#a3e635", // lime
  "#c084fc", // violet
  "#fb7185", // rose
] as const;

export function speakerIndex(label: string): number {
  const m = /(\d+)$/.exec(label);
  if (m) return parseInt(m[1], 10);
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function colorFor(label: string): string {
  return PALETTE[speakerIndex(label) % PALETTE.length];
}
