from __future__ import annotations

import logging
import os
import shutil
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
import whisperx
from fastapi import Body, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, HttpUrl

from app.config import settings
from app.pipeline import pipeline
from app.schemas import DiarizeResponse, HealthResponse
from app.visualize import render as render_diarization

EXAMPLES_DIR = Path(__file__).resolve().parent.parent / "examples"
EXAMPLE_FILE = "pyannote_sample.wav"
EXAMPLE_DESCRIPTION = (
    "30s English phone-call sample (Diane × Sheila, 2 speakers) bundled with the repo. "
    f"Download via `GET /examples/{EXAMPLE_FILE}`."
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    logger.info("starting up; loading models")
    pipeline.load()
    logger.info("ready")
    yield
    pipeline.unload()


app = FastAPI(
    title="diarization",
    version="0.1.0",
    lifespan=lifespan,
    description=(
        "Speaker diarization + transcription via WhisperX.\n\n"
        f"A bundled multi-speaker example is available at `GET /examples/{EXAMPLE_FILE}` "
        "and is referenced as the default example body for `POST /diarize/url`."
    ),
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok" if pipeline.loaded else "loading",
        model_loaded=pipeline.loaded,
        whisper_model=settings.whisper_model,
        device=settings.device,
        compute_type=settings.compute_type,
    )


@app.get("/examples", tags=["examples"])
def list_examples() -> dict:
    """List bundled example audio files."""
    if not EXAMPLES_DIR.is_dir():
        return {"examples": []}
    files = []
    for p in sorted(EXAMPLES_DIR.iterdir()):
        if p.is_file() and p.suffix.lower() in {".wav", ".flac", ".mp3", ".m4a"}:
            files.append(
                {
                    "name": p.name,
                    "size_bytes": p.stat().st_size,
                    "url": f"/examples/{p.name}",
                }
            )
    return {"examples": files}


@app.get("/examples/{name}", tags=["examples"])
def get_example(name: str) -> FileResponse:
    """Download a bundled example audio file."""
    candidate = (EXAMPLES_DIR / name).resolve()
    if EXAMPLES_DIR.resolve() not in candidate.parents or not candidate.is_file():
        raise HTTPException(status_code=404, detail="example not found")
    return FileResponse(candidate, media_type="application/octet-stream", filename=name)


def _save_upload_to_tempfile(file: UploadFile) -> Path:
    suffix = Path(file.filename or "audio").suffix or ".wav"
    fd, path = tempfile.mkstemp(suffix=suffix, prefix="diarize-")
    os.close(fd)
    target = Path(path)
    size = 0
    limit = settings.max_upload_mb * 1024 * 1024
    with target.open("wb") as out:
        while chunk := file.file.read(1024 * 1024):
            size += len(chunk)
            if size > limit:
                target.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=413,
                    detail=f"file exceeds {settings.max_upload_mb} MB",
                )
            out.write(chunk)
    return target


@app.post(
    "/diarize",
    response_model=DiarizeResponse,
    summary="Diarize an uploaded audio file",
    description=(
        "Upload an audio file (any ffmpeg-readable format) as multipart/form-data.\n\n"
        f"**Try it:** download the bundled example from `/examples/{EXAMPLE_FILE}` "
        "and re-upload it here, or use the `curl` snippet below.\n\n"
        "```bash\n"
        f"curl -F \"file=@examples/{EXAMPLE_FILE}\" http://localhost:8000/diarize\n"
        "```"
    ),
)
async def diarize(
    file: UploadFile = File(
        ...,
        description=(
            "Audio file. Bundled multi-speaker example: "
            f"`examples/{EXAMPLE_FILE}` (30s, 2 speakers, English)."
        ),
    ),
    language: str | None = Form(default=None, description="ISO code, e.g. 'en'. Auto-detect if omitted."),
    min_speakers: int | None = Form(default=None),
    max_speakers: int | None = Form(default=None),
    return_embeddings: bool = Form(
        default=False,
        description="If true, response includes a per-speaker ECAPA-TDNN embedding vector.",
    ),
    identify: bool = Form(
        default=False,
        description="If true, match each speaker against the enrolled gallery and attach identifications.",
    ),
) -> DiarizeResponse:
    if not pipeline.loaded:
        raise HTTPException(status_code=503, detail="pipeline still loading")
    audio_path = _save_upload_to_tempfile(file)
    try:
        result = pipeline.run(
            str(audio_path),
            language=language,
            min_speakers=min_speakers,
            max_speakers=max_speakers,
            return_embeddings=return_embeddings,
            identify=identify,
        )
    finally:
        audio_path.unlink(missing_ok=True)
    return DiarizeResponse(**result)


@app.post(
    "/diarize/visualize",
    summary="Diarize an uploaded file and return a PNG visualization",
    description=(
        "Same pipeline as `/diarize`, but the response is a PNG image showing:\n\n"
        "1. **Waveform** with speaker regions highlighted by color.\n"
        "2. **Speaker timeline** (gantt-style) of the diarized turns.\n"
        "3. **Embedding view** — pairwise cosine-similarity heatmap when speakers ≤ 2, "
        "PCA → 2D scatter when speakers ≥ 3 (only included when `return_embeddings=true`).\n\n"
        "```bash\n"
        f"curl -F \"file=@examples/{EXAMPLE_FILE}\" -F \"return_embeddings=true\" \\\n"
        "  http://localhost:8000/diarize/visualize -o diarization.png\n"
        "```"
    ),
    responses={200: {"content": {"image/png": {}}, "description": "Visualization PNG"}},
)
async def diarize_visualize(
    file: UploadFile = File(...),
    language: str | None = Form(default=None),
    min_speakers: int | None = Form(default=None),
    max_speakers: int | None = Form(default=None),
    return_embeddings: bool = Form(
        default=True,
        description="Include per-speaker embeddings (used to render the third panel).",
    ),
    identify: bool = Form(
        default=False,
        description="If true, also match each speaker against the enrolled gallery (no effect on the PNG yet).",
    ),
) -> Response:
    if not pipeline.loaded:
        raise HTTPException(status_code=503, detail="pipeline still loading")
    audio_path = _save_upload_to_tempfile(file)
    try:
        result = pipeline.run(
            str(audio_path),
            language=language,
            min_speakers=min_speakers,
            max_speakers=max_speakers,
            return_embeddings=return_embeddings,
            identify=identify,
        )
        audio = whisperx.load_audio(str(audio_path))
    finally:
        audio_path.unlink(missing_ok=True)

    png = render_diarization(audio, result, title=file.filename or "diarization")
    return Response(content=png, media_type="image/png")


class DiarizeUrlRequest(BaseModel):
    url: HttpUrl
    language: str | None = None
    min_speakers: int | None = None
    max_speakers: int | None = None
    return_embeddings: bool = False
    identify: bool = False


@app.post(
    "/diarize/url",
    response_model=DiarizeResponse,
    summary="Diarize audio fetched from a URL",
    description=(
        "Server downloads the audio from the URL, then runs the pipeline.\n\n"
        f"The example body points at this server's own bundled `{EXAMPLE_FILE}`. "
        "When running locally, that resolves to `http://localhost:8000/examples/"
        f"{EXAMPLE_FILE}` — but the request body uses the absolute URL so you can "
        "swap in any reachable audio."
    ),
)
async def diarize_url(
    req: DiarizeUrlRequest = Body(
        ...,
        openapi_examples={
            "bundled_multi_speaker": {
                "summary": "Bundled 30s multi-speaker example",
                "description": EXAMPLE_DESCRIPTION,
                "value": {
                    "url": f"http://localhost:8000/examples/{EXAMPLE_FILE}",
                    "min_speakers": 2,
                    "max_speakers": 2,
                },
            },
            "minimal": {
                "summary": "Minimal request — auto-detect everything",
                "value": {"url": f"http://localhost:8000/examples/{EXAMPLE_FILE}"},
            },
        },
    ),
) -> DiarizeResponse:
    if not pipeline.loaded:
        raise HTTPException(status_code=503, detail="pipeline still loading")

    suffix = Path(str(req.url)).suffix or ".wav"
    fd, tmp_path = tempfile.mkstemp(suffix=suffix, prefix="diarize-url-")
    os.close(fd)
    target = Path(tmp_path)
    limit = settings.max_upload_mb * 1024 * 1024

    try:
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            async with client.stream("GET", str(req.url)) as resp:
                if resp.status_code != 200:
                    raise HTTPException(
                        status_code=400,
                        detail=f"failed to download audio: HTTP {resp.status_code}",
                    )
                size = 0
                with target.open("wb") as out:
                    async for chunk in resp.aiter_bytes(1024 * 1024):
                        size += len(chunk)
                        if size > limit:
                            raise HTTPException(
                                status_code=413,
                                detail=f"file exceeds {settings.max_upload_mb} MB",
                            )
                        out.write(chunk)

        result = pipeline.run(
            str(target),
            language=req.language,
            min_speakers=req.min_speakers,
            max_speakers=req.max_speakers,
            return_embeddings=req.return_embeddings,
            identify=req.identify,
        )
    finally:
        target.unlink(missing_ok=True)

    return DiarizeResponse(**result)


@app.post(
    "/speakers/enroll",
    tags=["speakers"],
    summary="Enroll a named speaker from a clean audio sample",
    description=(
        "Uploads a short clip of a single speaker and stores their ECAPA-TDNN embedding "
        "under the given name in the persistent gallery. Use the optional `start`/`end` "
        "fields (seconds) to embed only a sub-window of the upload.\n\n"
        "Existing entries with the same name are overwritten."
    ),
)
async def enroll_speaker(
    name: str = Form(..., description="Identity label, e.g. 'alice'."),
    file: UploadFile = File(..., description="Audio of just this speaker."),
    start: float | None = Form(default=None, description="Optional start of the speech window (s)."),
    end: float | None = Form(default=None, description="Optional end of the speech window (s)."),
) -> dict:
    if not pipeline.loaded or pipeline.gallery is None:
        raise HTTPException(status_code=503, detail="pipeline still loading")
    if not name.strip():
        raise HTTPException(status_code=400, detail="name must not be empty")
    audio_path = _save_upload_to_tempfile(file)
    try:
        try:
            embedding = pipeline.embed_audio(str(audio_path), start=start, end=end)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        pipeline.gallery.enroll(name, embedding)
    finally:
        audio_path.unlink(missing_ok=True)
    return {
        "name": name,
        "embedding_dim": int(embedding.size),
        "enrolled": pipeline.gallery.names(),
    }


@app.get("/speakers", tags=["speakers"], summary="List enrolled speaker names")
def list_speakers() -> dict:
    if pipeline.gallery is None:
        raise HTTPException(status_code=503, detail="pipeline still loading")
    return {"speakers": pipeline.gallery.names()}


@app.delete(
    "/speakers/{name}",
    tags=["speakers"],
    summary="Remove an enrolled speaker from the gallery",
)
def delete_speaker(name: str) -> dict:
    if pipeline.gallery is None:
        raise HTTPException(status_code=503, detail="pipeline still loading")
    if not pipeline.gallery.remove(name):
        raise HTTPException(status_code=404, detail="speaker not found")
    return {"name": name, "removed": True, "remaining": pipeline.gallery.names()}


WEB_DIST = Path(__file__).resolve().parent.parent / "web" / "dist"
if WEB_DIST.is_dir():
    app.mount("/", StaticFiles(directory=WEB_DIST, html=True), name="web")
