# diarization

Speaker diarization, transcription, and **cross-file speaker identification** as a single FastAPI service. Upload an audio clip, get back a per-speaker timeline, transcript, and (optionally) named matches against a persistent gallery of enrolled speakers.

The pipeline is [WhisperX](https://github.com/m-bain/whisperX) (ASR → forced alignment → pyannote diarization) plus [SpeechBrain ECAPA-TDNN](https://huggingface.co/speechbrain/spkrec-ecapa-voxceleb) for speaker embeddings. There's a small React frontend that renders all of this interactively.

## Demo

https://github.com/user-attachments/assets/559303bc-35b2-4515-b5ca-26eb319c68bc

```bash
uv sync
HF_TOKEN=hf_xxx uv run uvicorn app.main:app
# then visit http://localhost:8000/
```

## What it does

| Endpoint | Purpose |
|---|---|
| `POST /diarize` | Upload audio → JSON of segments with `speaker`, `text`, `start`, `end`, plus per-speaker ECAPA embeddings and gallery identifications. |
| `POST /diarize/url` | Same as `/diarize` but server-side fetched (with size cap). |
| `POST /diarize/visualize` | Same pipeline → PNG (waveform + speaker timeline + embedding view). |
| `POST /speakers/enroll` | Add a named speaker to the gallery from a clean clip. |
| `GET /speakers`, `DELETE /speakers/{name}` | Manage the gallery. |
| `GET /` | The React demo UI (built into `web/dist/`). |

OpenAPI docs at `/docs`.

## Why it's interesting

Most diarization demos stop at *"who spoke when"*. This one adds the missing piece: **persistent identity across files**. You enroll Bill Gates from a 30s clip of one interview, and a different clip of him in another setting comes back tagged as `gates` — even though pyannote labels him `SPEAKER_00` in both, with no shared label between runs.

Concrete result from the bundled demo gallery: Sorkin enrolled from a 2019 NYT DealBook clip identifies in a 2023 Musk DealBook clip at **0.78 cosine** — same person, four years apart, totally different acoustic environment.

A few non-obvious things the pipeline gets right that took real iteration:

- **Identification threshold is 0.45**, not 0.7. ECAPA on unit-normalized vectors gives within-channel cross-time scores around 0.7–0.9 for the same speaker but cross-channel scores around 0.4–0.6. A "definitely the same person" cutoff would reject most cross-channel matches that are still unambiguous by margin.
- **Enrollment windows from long interviews need to be picked late, not early.** Hosts spend the first few minutes introducing the guest while the guest barely speaks. A naive 30s window from minute 4 of a 92-minute interview ends up being 100% the host's voice.
- **Pass `min_speakers=N` / `max_speakers=N` when one speaker dominates.** Without it, the diarizer collapses brief interjections into the dominant cluster and a 2-speaker interview returns `num_speakers: 1`.

## Quick start

```bash
# Backend
uv sync                                     # Python 3.12 deps
cp .env.example .env                        # set HF_TOKEN (must have accepted
                                            # pyannote/speaker-diarization-3.1
                                            # and pyannote/segmentation-3.0
                                            # license terms on HuggingFace)
uv run uvicorn app.main:app --port 8000     # ~30-60s to load models on first run

# Frontend (optional — only for hot-reload dev)
cd web
npm install
npm run dev                                 # Vite at :5173, proxies API to :8000
```

For prod-like local use, just run uvicorn — the backend serves the prebuilt `web/dist/` at `/`.

CLI for one-shot use:

```bash
uv run python -m scripts.diarize examples/pyannote_sample.wav
uv run python -m scripts.visualize outputs/pyannote_sample.diarized.json --audio examples/pyannote_sample.wav
```

Docker:

```bash
docker build -t diarization .   # multi-stage: node builds web/dist, python image runs API
docker run --rm -p 8000:8000 --env-file .env diarization
```

## Enrolling and identifying speakers

The "cross-file identification" capability is two steps: enroll once, identify forever.

**1. Enroll** a speaker by uploading a clean window of just their voice (no host crosstalk, no music). The server runs ECAPA-TDNN over the audio, gets a 192-dim unit-norm embedding, and stores it under the chosen name.

```bash
# CLI: enroll Bill Gates from a 30s clean clip
curl -F "name=gates" -F "file=@examples/yt/gates_enroll.wav" \
  http://localhost:8000/speakers/enroll

# Optional sub-window if your clip has lead-in / lead-out
curl -F "name=gates" -F "file=@long_clip.wav" \
  -F "start=10.0" -F "end=40.0" \
  http://localhost:8000/speakers/enroll
```

In the React UI: upload any multi-speaker clip → run diarize → click **⤓ enroll** on the speaker card you want to save. The UI auto-picks the speaker's longest contiguous turn (≥0.3s gaps merged) as the enrollment window, so you don't have to find clean audio manually.

```bash
# Verify
curl http://localhost:8000/speakers
# {"speakers":["gates","musk","sorkin"]}
```

**2. Identify** by running `/diarize` with `identify=true`. Each diarized speaker gets matched against the gallery and the response includes the top match plus its cosine score:

```bash
curl -F "file=@examples/yt/dealbook_gates_test.wav" \
     -F "identify=true" \
     -F "min_speakers=2" -F "max_speakers=2" \
     http://localhost:8000/diarize | jq '.identifications'
# {
#   "SPEAKER_00": {"name": "gates",  "score": 0.71},
#   "SPEAKER_01": {"name": "sorkin", "score": 0.62}
# }
```

In the UI, just toggle the **identify** checkbox and click run. Matches show on each speaker card with the cosine score next to the name.

**Sanity-checking enrollments.** If two of your gallery embeddings are getting confused, run the all-pairs cosine matrix between them — distinct speakers should score under ~0.2. Anything above ~0.5 means at least one enrollment is contaminated (typically a host's voice leaking into a guest's window). Re-clip from later in the source.

## Architecture

Single uvicorn process, four heavy models loaded once at startup:

```
app/
├── main.py          FastAPI routes; mounts web/dist at "/"
├── pipeline.py      DiarizationPipelineWrapper singleton
│                    (ASR + diarization + lazy alignment + ECAPA + gallery)
├── verification.py  SpeechBrain ECAPA wrapper + JSON-backed SpeakerGallery
├── visualize.py     PNG renderer (matplotlib, headless Agg backend)
├── schemas.py       Pydantic response models (source of truth for wire shape)
└── config.py        pydantic-settings (.env)

web/
├── src/
│   ├── App.tsx              useReducer state; split layout
│   ├── api.ts               typed fetch/XHR wrappers (XHR for upload progress)
│   ├── types.ts             mirrors schemas.py + speakersOf() helper
│   ├── lib/                 colors, audio hash, longest-turn, tiny PCA
│   └── components/          Player, Transcript, SpeakerCard, Embeddings, Gallery
└── dist/                    built artifact, served by FastAPI in prod

scripts/
├── diarize.py               CLI entry point (same pipeline as API)
├── visualize.py             render JSON → PNG
├── yt_clip.py               yt-dlp + ffmpeg helper for grabbing demo clips
└── download_examples.py     fetches the bundled audio examples
```

## Frontend demo

A single-page React UI (Vite, TypeScript, no framework dependencies beyond React) is built into `web/dist/` and served by FastAPI at `/`.

What you can do in it:

- Drop an audio file, click run, watch the colored timeline strip light up.
- Scroll-synced transcript: rows highlight in time, click any row to seek.
- Click ✎ to rename a speaker locally (persisted via `localStorage`, keyed by SHA-256 of the file).
- Click ⤓ to enroll a speaker into the gallery — the UI picks the speaker's longest contiguous turn as the enrollment window automatically.
- Toggle `identify` and rerun to see gallery matches with cosine scores.
- Embedding panel: cosine-similarity heatmap for 2 speakers, PCA scatter for ≥3.

The dark technical theme is intentional — diarization output (timestamps, embeddings, cosines) is technical content and the styling matches.

## Honest limitations

- **Single-process gallery.** `gallery.json` is mutated under a `threading.Lock` and atomic-renamed on disk. Multi-worker deployments would race. Fine for a demo, not for production.
- **Cold-start is 30–60s.** Pyannote and Whisper models load eagerly at process start; alignment models load lazily per detected language. There's no warm pool.
- **No auth.** Anyone with reach to the port can mutate the gallery. Add a reverse proxy or basic-auth in front for any non-local use.
- **No streaming / live mic.** Every request is full-pipeline-on-the-whole-file.
- **Identification surfacing only in the React UI.** The `/diarize/visualize` PNG predates identification and hasn't been backfilled.
- **No tests.** TypeScript and runtime smoke checks stand in. Refactors will be brave.

## Development notes

- Python 3.12, `uv` only (no pip/poetry). The project itself isn't installed (`tool.uv.package = false`); always run via `uv run`.
- No linter/formatter/test runner configured by design — the project is small enough that ad-hoc verification has been sufficient.
- `examples/yt/SOURCES.md` is a manifest for copyrighted YouTube clips used as demo material. The audio files themselves are gitignored; the manifest lets anyone re-fetch them via `scripts/yt_clip.py`.
- `gallery.json` is gitignored — it's runtime state.

## License

MIT. Audio examples in `examples/yt/` are not licensed for redistribution; see `examples/yt/SOURCES.md`.
