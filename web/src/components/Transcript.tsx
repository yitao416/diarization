import { useEffect, useRef } from "react";
import type { Segment } from "../types";
import { colorFor } from "../lib/colors";

type Props = {
  segments: Segment[];
  renames: Record<string, string>;
  currentTime: number;
  onSeek: (t: number) => void;
};

function fmtTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const SCROLL_GRACE_MS = 3000;

export function Transcript({ segments, renames, currentTime, onSeek }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const lastUserScroll = useRef(0);

  const activeIdx = segments.findIndex((s) => currentTime >= s.start && currentTime < s.end);

  useEffect(() => {
    if (activeIdx < 0) return;
    if (Date.now() - lastUserScroll.current < SCROLL_GRACE_MS) return;
    rowRefs.current[activeIdx]?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIdx]);

  if (segments.length === 0 || segments.every((s) => !s.speaker)) {
    return (
      <div className="dim" style={{ padding: 24, textAlign: "center", fontSize: 26 }}>
        no speech detected
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onWheel={() => { lastUserScroll.current = Date.now(); }}
      onTouchMove={() => { lastUserScroll.current = Date.now(); }}
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        background: "var(--bg-elev)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: 8,
      }}
    >
      {segments.map((s, i) => {
        if (!s.speaker) return null;
        const isActive = i === activeIdx;
        const color = colorFor(s.speaker);
        const label = renames[s.speaker] ?? s.speaker;
        return (
          <div
            key={i}
            ref={(el) => { rowRefs.current[i] = el; }}
            onClick={() => onSeek(s.start)}
            style={{
              display: "grid",
              gridTemplateColumns: "auto auto 1fr",
              gap: 10,
              padding: "6px 10px",
              borderRadius: 4,
              borderLeft: `3px solid ${isActive ? color : "transparent"}`,
              background: isActive ? "var(--bg-elev-2)" : "transparent",
              cursor: "pointer",
              alignItems: "baseline",
            }}
          >
            <span style={{ color, fontWeight: 600, fontSize: 24 }}>{label}</span>
            <span className="mono dim" style={{ fontSize: 24 }}>{fmtTime(s.start)}</span>
            <span style={{ fontSize: 28 }}>{(s.text as string | undefined)?.trim() ?? ""}</span>
          </div>
        );
      })}
    </div>
  );
}
