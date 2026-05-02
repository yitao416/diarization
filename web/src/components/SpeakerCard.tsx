import { useState } from "react";
import type { Identification, Segment } from "../types";
import { colorFor } from "../lib/colors";
import { longestTurn } from "../lib/longestTurn";
import { enrollSpeaker, ApiError } from "../api";

type Props = {
  speaker: string;
  display: string;
  segments: Segment[];
  identification: Identification | null;
  identifyOn: boolean;
  galleryEmpty: boolean;
  audioFile: File;
  onRename: (to: string) => void;
  onEnrolled: () => void;
};

export function SpeakerCard(p: Props) {
  const [mode, setMode] = useState<"idle" | "rename" | "enroll">("idle");
  const [draft, setDraft] = useState(p.display);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const color = colorFor(p.speaker);
  const turn = longestTurn(p.segments, p.speaker);

  function startRename() { setDraft(p.display); setErr(null); setMode("rename"); }
  function startEnroll() { setDraft(p.display); setErr(null); setMode("enroll"); }
  function cancel() { setMode("idle"); setErr(null); }

  function commitRename() {
    const t = draft.trim();
    if (!t) { setErr("name must not be empty"); return; }
    p.onRename(t);
    setMode("idle");
  }

  async function commitEnroll() {
    const t = draft.trim();
    if (!t) { setErr("name must not be empty"); return; }
    if (!turn) { setErr("no segments for this speaker"); return; }
    setBusy(true);
    try {
      await enrollSpeaker(t, p.audioFile, { start: turn.start, end: turn.end });
      p.onRename(t);
      p.onEnrolled();
      setMode("idle");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  let matchLine: React.ReactNode;
  if (!p.identifyOn) matchLine = <span className="dim">match: <i>off</i></span>;
  else if (p.galleryEmpty) matchLine = <span className="dim">match: <i>gallery empty</i></span>;
  else if (p.identification) {
    matchLine = (
      <span>
        match: <strong>{p.identification.name}</strong>
        <span className="mono dim" style={{ marginLeft: 6 }}>cos {p.identification.score.toFixed(2)}</span>
      </span>
    );
  } else matchLine = <span className="dim">match: <i>none</i></span>;

  return (
    <div style={{
      background: "var(--bg)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius)",
      padding: 10,
      display: "flex",
      flexDirection: "column",
      gap: 6,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 10, height: 10, background: color, borderRadius: "50%", display: "inline-block" }} />
        <strong style={{ fontSize: 26 }}>{p.display}</strong>
        {p.display !== p.speaker && (
          <span className="dim mono" style={{ fontSize: 22 }}>{p.speaker}</span>
        )}
      </div>
      <div style={{ fontSize: 24 }}>{matchLine}</div>
      {mode === "idle" && (
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={startRename} style={{ fontSize: 24 }}>✎ rename</button>
          <button onClick={startEnroll} style={{ fontSize: 24 }}>⤓ enroll</button>
        </div>
      )}
      {(mode === "rename" || mode === "enroll") && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={mode === "enroll" ? "save to gallery as…" : "rename"}
            disabled={busy}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") (mode === "rename" ? commitRename : commitEnroll)();
              if (e.key === "Escape") cancel();
            }}
          />
          {mode === "enroll" && turn && (
            <div className="dim mono" style={{ fontSize: 22 }}>
              window: {turn.start.toFixed(2)}–{turn.end.toFixed(2)}s ({(turn.end - turn.start).toFixed(2)}s)
            </div>
          )}
          {err && <div style={{ color: "var(--error)", fontSize: 24 }}>{err}</div>}
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={mode === "rename" ? commitRename : commitEnroll} disabled={busy}>
              {busy ? "…" : "save"}
            </button>
            <button onClick={cancel} disabled={busy}>cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
