type Props = {
  identify: boolean;
  onIdentifyChange: (v: boolean) => void;
  minSpeakers: number | null;
  maxSpeakers: number | null;
  onMinChange: (v: number | null) => void;
  onMaxChange: (v: number | null) => void;
  status: "idle" | "uploading" | "diarizing" | "ready" | "error";
  uploadProgress: number;
  canRun: boolean;
  onRun: () => void;
};

function parseN(v: string): number | null {
  if (v.trim() === "") return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function Toolbar(p: Props) {
  const running = p.status === "uploading" || p.status === "diarizing";
  return (
    <div style={{
      display: "flex",
      gap: 16,
      alignItems: "center",
      padding: "12px 16px",
      background: "var(--bg-elev)",
      border: "1px solid var(--accent)",
      borderRadius: "var(--radius)",
      boxShadow: "0 0 0 3px rgba(92, 200, 255, 0.12)",
    }}>
      <label style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontSize: 26,
        color: p.identify ? "var(--accent)" : "var(--fg)",
        fontWeight: p.identify ? 600 : 400,
      }}>
        <input
          type="checkbox"
          checked={p.identify}
          onChange={(e) => p.onIdentifyChange(e.target.checked)}
          disabled={running}
          style={{ width: 20, height: 20, accentColor: "var(--accent)" }}
        />
        identify
      </label>
      <span style={{ width: 1, height: 28, background: "var(--border)" }} />
      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 26 }}>
        <span className="dim">min</span>
        <input
          type="text"
          value={p.minSpeakers ?? ""}
          onChange={(e) => p.onMinChange(parseN(e.target.value))}
          style={{ width: 56, textAlign: "center" }}
          disabled={running}
          placeholder="auto"
        />
      </label>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 26 }}>
        <span className="dim">max</span>
        <input
          type="text"
          value={p.maxSpeakers ?? ""}
          onChange={(e) => p.onMaxChange(parseN(e.target.value))}
          style={{ width: 56, textAlign: "center" }}
          disabled={running}
          placeholder="auto"
        />
      </label>
      <span style={{ flex: 1 }} />
      {p.status === "uploading" && (
        <div style={{ width: 160, height: 4, background: "var(--bg-elev-2)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: `${p.uploadProgress * 100}%`, height: "100%", background: "var(--accent)", transition: "width 0.1s" }} />
        </div>
      )}
      {p.status === "diarizing" && (
        <span className="dim mono" style={{ fontSize: 24 }}>diarizing…</span>
      )}
      <button onClick={p.onRun} disabled={!p.canRun}>
        {running ? "running…" : "run ▶"}
      </button>
    </div>
  );
}
