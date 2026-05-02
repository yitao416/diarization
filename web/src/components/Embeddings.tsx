import React from "react";
import type { DiarizeResponse } from "../types";
import { colorFor } from "../lib/colors";
import { pca2D } from "../lib/pca";

type Props = {
  result: DiarizeResponse;
  renames: Record<string, string>;
};

function dot(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

function heatColor(v: number): string {
  // v in [0, 1]; dark blue → cyan → white
  const r = Math.round(lerp(20, 240, v));
  const g = Math.round(lerp(40, 250, v));
  const b = Math.round(lerp(80, 250, v));
  return `rgb(${r}, ${g}, ${b})`;
}

export function Embeddings({ result, renames }: Props) {
  const emb = result.speaker_embeddings;
  if (!emb) return null;
  const speakers = result.speakers.filter((s) => emb[s]);
  if (speakers.length <= 1) return null;
  const labels = speakers.map((s) => renames[s] ?? s);

  if (speakers.length === 2) {
    // Heatmap (2x2). Cosine of unit-norm vectors.
    const m: number[][] = speakers.map((a) => speakers.map((b) => dot(emb[a], emb[b])));
    return (
      <div>
        <div className="label">Embeddings — cosine</div>
        <div style={{ display: "grid", gridTemplateColumns: `auto repeat(${speakers.length}, 1fr)`, gap: 2, marginTop: 6 }}>
          <div />
          {labels.map((l, j) => (<div key={j} className="mono dim" style={{ fontSize: 11, textAlign: "center" }}>{l}</div>))}
          {labels.map((l, i) => (
            <React.Fragment key={i}>
              <div className="mono dim" style={{ fontSize: 11 }}>{l}</div>
              {speakers.map((_, j) => {
                const v = (m[i][j] + 1) / 2; // [-1, 1] → [0, 1]
                return (
                  <div
                    key={`c${i}${j}`}
                    title={m[i][j].toFixed(3)}
                    style={{
                      background: heatColor(v),
                      color: v > 0.6 ? "#0e1014" : "#e6e8ee",
                      textAlign: "center",
                      padding: "4px 0",
                      fontFamily: "var(--mono)",
                      fontSize: 11,
                    }}
                  >
                    {m[i][j].toFixed(2)}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  }

  // 3+: PCA scatter
  const points = pca2D(speakers.map((s) => emb[s]));
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const w = 280, h = 180, pad = 16;
  const sx = (x: number) => pad + ((x - xMin) / (xMax - xMin || 1)) * (w - 2 * pad);
  const sy = (y: number) => h - pad - ((y - yMin) / (yMax - yMin || 1)) * (h - 2 * pad);

  return (
    <div>
      <div className="label">Embeddings — PCA</div>
      <svg width={w} height={h} style={{ marginTop: 6, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={sx(p.x)} cy={sy(p.y)} r={5} fill={colorFor(speakers[i])} />
            <text x={sx(p.x) + 8} y={sy(p.y) + 4} fontSize="11" fontFamily="var(--mono)" fill="var(--fg)">{labels[i]}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}
