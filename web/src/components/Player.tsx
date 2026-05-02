import { useEffect, useRef } from "react";
import type { Segment } from "../types";
import { colorFor } from "../lib/colors";

type Props = {
  audioUrl: string;
  segments: Segment[];
  duration: number;
  onTimeChange: (t: number) => void;
  onPlayingChange: (p: boolean) => void;
  seekTo: number | null;
};

const TIME_DISPATCH_HZ = 10;

export function Player({ audioUrl, segments, duration, onTimeChange, onPlayingChange, seekTo }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playheadRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const playingRef = useRef(false);

  // Stable refs so the rAF effect doesn't restart on every parent re-render.
  const onTimeChangeRef = useRef(onTimeChange);
  const onPlayingChangeRef = useRef(onPlayingChange);
  useEffect(() => { onTimeChangeRef.current = onTimeChange; }, [onTimeChange]);
  useEffect(() => { onPlayingChangeRef.current = onPlayingChange; }, [onPlayingChange]);

  useEffect(() => {
    if (seekTo != null && audioRef.current) {
      audioRef.current.currentTime = seekTo;
      onTimeChangeRef.current(seekTo);
      void audioRef.current.play();
    }
  }, [seekTo]);

  useEffect(() => {
    let raf = 0;
    let lastDispatch = 0;
    const minInterval = 1000 / TIME_DISPATCH_HZ;
    const tick = () => {
      if (audioRef.current && playheadRef.current && stripRef.current && duration > 0) {
        const t = audioRef.current.currentTime;
        const w = stripRef.current.clientWidth;
        playheadRef.current.style.transform = `translateX(${(t / duration) * w}px)`;
        if (playingRef.current) {
          const now = performance.now();
          if (now - lastDispatch >= minInterval) {
            lastDispatch = now;
            onTimeChangeRef.current(t);
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [duration]);

  const handlePlay = () => { playingRef.current = true; onPlayingChangeRef.current(true); };
  const handlePause = () => { playingRef.current = false; onPlayingChangeRef.current(false); };

  const handleStripClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!stripRef.current || !audioRef.current || duration <= 0) return;
    const rect = stripRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const t = ratio * duration;
    audioRef.current.currentTime = t;
    onTimeChangeRef.current(t);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <audio
        ref={audioRef}
        src={audioUrl}
        controls
        onPlay={handlePlay}
        onPause={handlePause}
        onEnded={handlePause}
        onSeeked={() => audioRef.current && onTimeChangeRef.current(audioRef.current.currentTime)}
        style={{ width: "100%" }}
      />
      <div
        ref={stripRef}
        onClick={handleStripClick}
        style={{
          position: "relative",
          height: 28,
          background: "var(--bg-elev-2)",
          borderRadius: "var(--radius)",
          overflow: "hidden",
          cursor: "pointer",
        }}
      >
        {duration > 0 && segments.map((s, i) => {
          if (!s.speaker) return null;
          const left = (s.start / duration) * 100;
          const width = ((s.end - s.start) / duration) * 100;
          return (
            <div
              key={i}
              title={`${s.speaker} · ${s.start.toFixed(2)}–${s.end.toFixed(2)}s`}
              style={{
                position: "absolute",
                left: `${left}%`,
                width: `${width}%`,
                top: 0,
                bottom: 0,
                background: colorFor(s.speaker),
                opacity: 0.85,
              }}
            />
          );
        })}
        <div
          ref={playheadRef}
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            width: 1,
            background: "var(--fg)",
            pointerEvents: "none",
            transform: "translateX(0)",
          }}
        />
      </div>
    </div>
  );
}
