import { useEffect, useReducer } from "react";
import type { DiarizeResponse } from "./types";
import { listSpeakers, getHealth } from "./api";
import { audioHash } from "./lib/audioHash";

type Status = "idle" | "uploading" | "diarizing" | "ready" | "error";

type AudioRef = { file: File; url: string; hash: string };

export type State = {
  audio: AudioRef | null;
  result: DiarizeResponse | null;
  status: Status;
  error: string | null;
  uploadProgress: number; // 0..1
  identify: boolean;
  minSpeakers: number | null;
  maxSpeakers: number | null;
  renames: Record<string, string>;
  gallery: string[];
  modelLoaded: boolean;
  playback: { currentTime: number; playing: boolean };
};

export type Action =
  | { type: "audio/load"; audio: AudioRef; renames: Record<string, string> }
  | { type: "audio/clear" }
  | { type: "diarize/start" }
  | { type: "diarize/progress"; value: number }
  | { type: "diarize/inflight" }
  | { type: "diarize/success"; result: DiarizeResponse }
  | { type: "diarize/error"; message: string }
  | { type: "error/clear" }
  | { type: "rename"; from: string; to: string }
  | { type: "gallery/set"; names: string[] }
  | { type: "toolbar/identify"; value: boolean }
  | { type: "toolbar/minSpeakers"; value: number | null }
  | { type: "toolbar/maxSpeakers"; value: number | null }
  | { type: "playback/time"; value: number }
  | { type: "playback/playing"; value: boolean }
  | { type: "health/loaded"; value: boolean };

const RENAMES_KEY = (hash: string) => `diarization:renames:${hash}`;

const initialState: State = {
  audio: null,
  result: null,
  status: "idle",
  error: null,
  uploadProgress: 0,
  identify: false,
  minSpeakers: null,
  maxSpeakers: null,
  renames: {},
  gallery: [],
  modelLoaded: false,
  playback: { currentTime: 0, playing: false },
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "audio/load":
      return { ...state, audio: action.audio, renames: action.renames, result: null, status: "idle", error: null, playback: { currentTime: 0, playing: false } };
    case "audio/clear":
      if (state.audio) URL.revokeObjectURL(state.audio.url);
      return { ...state, audio: null, result: null, status: "idle", playback: { currentTime: 0, playing: false } };
    case "diarize/start":
      return { ...state, status: "uploading", error: null, uploadProgress: 0 };
    case "diarize/progress":
      return { ...state, uploadProgress: action.value };
    case "diarize/inflight":
      return { ...state, status: "diarizing", uploadProgress: 1 };
    case "diarize/success":
      return { ...state, status: "ready", result: action.result, uploadProgress: 0 };
    case "diarize/error":
      return { ...state, status: "error", error: action.message, uploadProgress: 0 };
    case "error/clear":
      return { ...state, error: null, status: state.result ? "ready" : "idle" };
    case "rename": {
      const next = { ...state.renames, [action.from]: action.to };
      if (state.audio) localStorage.setItem(RENAMES_KEY(state.audio.hash), JSON.stringify(next));
      return { ...state, renames: next };
    }
    case "gallery/set":
      return { ...state, gallery: action.names };
    case "toolbar/identify":
      return { ...state, identify: action.value };
    case "toolbar/minSpeakers":
      return { ...state, minSpeakers: action.value };
    case "toolbar/maxSpeakers":
      return { ...state, maxSpeakers: action.value };
    case "playback/time":
      return { ...state, playback: { ...state.playback, currentTime: action.value } };
    case "playback/playing":
      return { ...state, playback: { ...state.playback, playing: action.value } };
    case "health/loaded":
      return { ...state, modelLoaded: action.value };
  }
}

export function App() {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Initial gallery load + health poll
  useEffect(() => {
    listSpeakers().then((names) => dispatch({ type: "gallery/set", names })).catch(() => {});
    let cancel = false;
    const poll = async () => {
      try {
        const h = await getHealth();
        if (cancel) return;
        dispatch({ type: "health/loaded", value: h.model_loaded });
        if (!h.model_loaded) setTimeout(poll, 2000);
      } catch {
        if (!cancel) setTimeout(poll, 2000);
      }
    };
    poll();
    return () => { cancel = true; };
  }, []);

  async function loadFile(file: File) {
    const url = URL.createObjectURL(file);
    const hash = await audioHash(file);
    let renames: Record<string, string> = {};
    try {
      const raw = localStorage.getItem(RENAMES_KEY(hash));
      if (raw) renames = JSON.parse(raw);
    } catch { /* ignore */ }
    dispatch({ type: "audio/load", audio: { file, url, hash }, renames });
  }

  return (
    <div style={{ display: "grid", gridTemplateRows: "auto 1fr", height: "100%" }}>
      <div style={{
        padding: "10px 16px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        gap: 12,
        alignItems: "center",
      }}>
        <strong>diarization</strong>
        <span className="dim" style={{ fontSize: 12 }}>WhisperX + ECAPA</span>
        <span style={{ flex: 1 }} />
        <span className="dim" style={{ fontSize: 12 }}>
          {state.modelLoaded ? "ready" : "loading models…"}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", minHeight: 0 }}>
        <div style={{ padding: 16, overflow: "auto" }}>
          {!state.audio && (
            <input type="file" accept="audio/*" onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) loadFile(f);
            }} />
          )}
          {state.audio && (
            <div className="mono dim" style={{ fontSize: 12 }}>
              {state.audio.file.name} · {(state.audio.file.size / 1024 / 1024).toFixed(2)} MB
            </div>
          )}
        </div>
        <div style={{ padding: 16, borderLeft: "1px solid var(--border)", background: "var(--bg-elev)", overflow: "auto" }}>
          <div className="label">Gallery</div>
          <div className="mono" style={{ fontSize: 12, marginTop: 4 }}>
            {state.gallery.length === 0 ? <span className="dim">empty</span> : state.gallery.join(" · ")}
          </div>
        </div>
      </div>
    </div>
  );
}
