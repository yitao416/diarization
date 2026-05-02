import { useEffect, useReducer, useState } from "react";
import type { DiarizeResponse } from "./types";
import { listSpeakers, getHealth } from "./api";
import { audioHash } from "./lib/audioHash";
import { Uploader } from "./components/Uploader";
import { Toolbar } from "./components/Toolbar";
import { Player } from "./components/Player";
import { Transcript } from "./components/Transcript";
import { SpeakerSidebar } from "./components/SpeakerSidebar";
import { Embeddings } from "./components/Embeddings";
import { Gallery } from "./components/Gallery";
import { HealthBanner } from "./components/HealthBanner";
import { ErrorToast } from "./components/ErrorToast";
import { diarize, ApiError } from "./api";

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
  const [seekTo, setSeekTo] = useState<number | null>(null);

  function refreshGallery() {
    listSpeakers().then((names) => dispatch({ type: "gallery/set", names })).catch(() => {});
  }

  // Initial gallery load + health poll
  useEffect(() => {
    refreshGallery();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Spacebar play/pause shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const audio = document.querySelector("audio");
      if (!audio) return;
      e.preventDefault();
      if (audio.paused) void audio.play();
      else audio.pause();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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

  async function run() {
    if (!state.audio) return;
    dispatch({ type: "diarize/start" });
    let lastProgress = 0;
    const { promise } = diarize(
      state.audio.file,
      {
        identify: state.identify,
        returnEmbeddings: true,
        minSpeakers: state.minSpeakers,
        maxSpeakers: state.maxSpeakers,
      },
      (loaded, total) => {
        const p = total > 0 ? loaded / total : 0;
        if (p - lastProgress >= 0.02 || p >= 1) {
          lastProgress = p;
          dispatch({ type: "diarize/progress", value: p });
          if (p >= 1) dispatch({ type: "diarize/inflight" });
        }
      },
    );
    try {
      const result = await promise;
      dispatch({ type: "diarize/success", result });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : String(err);
      dispatch({ type: "diarize/error", message });
    }
  }

  return (
    <>
    <ErrorToast
      message={state.status === "error" ? state.error : null}
      onClose={() => dispatch({ type: "error/clear" })}
    />
    <div style={{ display: "grid", gridTemplateRows: "auto auto 1fr", height: "100%" }}>
      <div style={{
        padding: "10px 16px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        gap: 12,
        alignItems: "center",
      }}>
        <strong>diarization</strong>
        <span className="dim" style={{ fontSize: 24 }}>WhisperX + ECAPA</span>
        <span style={{ flex: 1 }} />
        <span className="dim" style={{ fontSize: 24 }}>
          {state.modelLoaded ? "ready" : "loading models…"}
        </span>
      </div>
      <HealthBanner loaded={state.modelLoaded} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", minHeight: 0 }}>
        <div style={{ padding: 16, overflow: "hidden", display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
          {!state.audio && <Uploader onFile={loadFile} />}
          {state.audio && (
            <>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span className="mono" style={{ fontSize: 24 }}>
                  {state.audio.file.name} · {(state.audio.file.size / 1024 / 1024).toFixed(2)} MB
                </span>
                <button onClick={() => dispatch({ type: "audio/clear" })} disabled={state.status === "uploading" || state.status === "diarizing"}>
                  ✕ clear
                </button>
              </div>
              <Toolbar
                identify={state.identify}
                onIdentifyChange={(v) => dispatch({ type: "toolbar/identify", value: v })}
                minSpeakers={state.minSpeakers}
                maxSpeakers={state.maxSpeakers}
                onMinChange={(v) => dispatch({ type: "toolbar/minSpeakers", value: v })}
                onMaxChange={(v) => dispatch({ type: "toolbar/maxSpeakers", value: v })}
                status={state.status}
                uploadProgress={state.uploadProgress}
                canRun={state.modelLoaded && state.status !== "uploading" && state.status !== "diarizing"}
                onRun={run}
              />
              {state.result && state.audio && (
                <Player
                  audioUrl={state.audio.url}
                  segments={state.result.segments}
                  duration={state.result.duration}
                  onTimeChange={(t) => dispatch({ type: "playback/time", value: t })}
                  onPlayingChange={(p) => dispatch({ type: "playback/playing", value: p })}
                  seekTo={seekTo}
                />
              )}
              {state.result && (
                <Transcript
                  segments={state.result.segments}
                  renames={state.renames}
                  currentTime={state.playback.currentTime}
                  onSeek={(t) => { setSeekTo(null); requestAnimationFrame(() => setSeekTo(t)); }}
                />
              )}
            </>
          )}
        </div>
        <div style={{ padding: 16, borderLeft: "1px solid var(--border)", background: "var(--bg-elev)", overflow: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
          {state.result && state.audio && (
            <SpeakerSidebar
              result={state.result}
              renames={state.renames}
              identifyOn={state.identify}
              galleryEmpty={state.gallery.length === 0}
              audioFile={state.audio.file}
              onRename={(from, to) => dispatch({ type: "rename", from, to })}
              onEnrolled={refreshGallery}
            />
          )}
          {state.result && <Embeddings result={state.result} renames={state.renames} />}
          <Gallery
            names={state.gallery}
            onChange={refreshGallery}
          />
        </div>
      </div>
    </div>
    </>
  );
}
