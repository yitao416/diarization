export type Point2D = { x: number; y: number };

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function matVec(m: number[][], v: number[]): number[] {
  const out = new Array(m.length).fill(0);
  for (let i = 0; i < m.length; i++) {
    let s = 0;
    const row = m[i];
    for (let j = 0; j < v.length; j++) s += row[j] * v[j];
    out[i] = s;
  }
  return out;
}

function normalize(v: number[]): { v: number[]; norm: number } {
  const n = Math.sqrt(dot(v, v));
  if (n < 1e-12) return { v, norm: 0 };
  return { v: v.map((x) => x / n), norm: n };
}

function topEigen(m: number[][], iters = 200): { vec: number[]; lambda: number } {
  const n = m.length;
  let v = new Array(n).fill(0).map((_, i) => Math.sin(i + 1));
  ({ v } = normalize(v));
  for (let i = 0; i < iters; i++) {
    const w = matVec(m, v);
    const { v: vn, norm } = normalize(w);
    if (norm < 1e-12) break;
    v = vn;
  }
  const Mv = matVec(m, v);
  const lambda = dot(v, Mv);
  return { vec: v, lambda };
}

export function pca2D(vectors: number[][]): Point2D[] {
  const n = vectors.length;
  if (n === 0) return [];
  if (n === 1) return [{ x: 0, y: 0 }];
  const d = vectors[0].length;

  const mean = new Array(d).fill(0);
  for (const v of vectors) for (let i = 0; i < d; i++) mean[i] += v[i] / n;
  const centered = vectors.map((v) => v.map((x, i) => x - mean[i]));

  const gram: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const s = dot(centered[i], centered[j]);
      gram[i][j] = s;
      gram[j][i] = s;
    }
  }

  const { vec: e1, lambda: l1 } = topEigen(gram);
  const deflated = gram.map((row, i) => row.map((x, j) => x - l1 * e1[i] * e1[j]));
  const { vec: e2, lambda: l2 } = topEigen(deflated);

  const s1 = Math.sqrt(Math.max(l1, 0));
  const s2 = Math.sqrt(Math.max(l2, 0));
  return e1.map((_, i) => ({ x: e1[i] * s1, y: e2[i] * s2 }));
}
