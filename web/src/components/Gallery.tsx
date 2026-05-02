import { useState } from "react";
import { ApiError, deleteSpeaker } from "../api";

type Props = {
  names: string[];
  onChange: () => void;
};

export function Gallery({ names, onChange }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function remove(name: string) {
    setBusy(name);
    setErr(null);
    try {
      await deleteSpeaker(name);
      onChange();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="label">Gallery</div>
      {names.length === 0 ? (
        <div className="dim mono" style={{ fontSize: 12, marginTop: 4 }}>empty</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
          {names.map((n) => (
            <div key={n} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
              <span className="mono" style={{ flex: 1 }}>{n}</span>
              <button
                onClick={() => remove(n)}
                disabled={busy === n}
                style={{ fontSize: 11, padding: "2px 6px" }}
                title="remove from gallery"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      {err && <div style={{ color: "var(--error)", fontSize: 12, marginTop: 4 }}>{err}</div>}
    </div>
  );
}
