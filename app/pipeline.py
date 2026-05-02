from __future__ import annotations

import gc
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import torch
import whisperx
from whisperx.diarize import DiarizationPipeline

from app.config import settings
from app.verification import SpeakerGallery, SpeakerVerifier

logger = logging.getLogger(__name__)


@dataclass
class _AlignBundle:
    model: Any
    metadata: Any


@dataclass
class DiarizationPipelineWrapper:
    """Loads ASR, alignment, diarization, and speaker verification once and reuses them per request.

    Alignment models are language-specific, so they are cached lazily per language code.
    The verification model (ECAPA-TDNN) is used for both response embeddings and
    cross-file speaker identification against the gallery.
    """

    asr_model: Any = None
    diarize_model: DiarizationPipeline | None = None
    verifier: SpeakerVerifier | None = None
    gallery: SpeakerGallery | None = None
    _align_cache: dict[str, _AlignBundle] = field(default_factory=dict)

    @property
    def loaded(self) -> bool:
        return (
            self.asr_model is not None
            and self.diarize_model is not None
            and self.verifier is not None
            and self.verifier.loaded
        )

    def load(self) -> None:
        logger.info(
            "loading asr model=%s device=%s compute_type=%s",
            settings.whisper_model,
            settings.device,
            settings.compute_type,
        )
        self.asr_model = whisperx.load_model(
            settings.whisper_model,
            settings.device,
            compute_type=settings.compute_type,
        )

        logger.info("loading diarization pipeline model=%s", settings.diarize_model)
        self.diarize_model = DiarizationPipeline(
            model_name=settings.diarize_model,
            token=settings.hf_token,
            device=torch.device(settings.device),
        )

        self.verifier = SpeakerVerifier(
            source=settings.verify_model,
            savedir=settings.verify_model_savedir,
            device=settings.device,
        )
        self.verifier.load()

        self.gallery = SpeakerGallery(Path(settings.speaker_gallery_path))

    def _get_align(self, language_code: str) -> _AlignBundle:
        bundle = self._align_cache.get(language_code)
        if bundle is None:
            logger.info("loading align model for language=%s", language_code)
            model, metadata = whisperx.load_align_model(
                language_code=language_code,
                device=settings.device,
                model_name=settings.align_model,
            )
            bundle = _AlignBundle(model=model, metadata=metadata)
            self._align_cache[language_code] = bundle
        return bundle

    def run(
        self,
        audio_path: str,
        *,
        language: str | None = None,
        min_speakers: int | None = None,
        max_speakers: int | None = None,
        return_embeddings: bool = False,
        identify: bool = False,
    ) -> dict[str, Any]:
        if not self.loaded:
            raise RuntimeError("pipeline not loaded")
        assert self.verifier is not None and self.gallery is not None

        audio: np.ndarray = whisperx.load_audio(audio_path)
        duration = float(len(audio) / 16000.0)

        # 1. ASR
        asr_result = self.asr_model.transcribe(
            audio, batch_size=settings.batch_size, language=language
        )
        detected_language = asr_result["language"]
        logger.info("asr done language=%s segments=%d", detected_language, len(asr_result["segments"]))

        # 2. Alignment
        align = self._get_align(detected_language)
        aligned = whisperx.align(
            asr_result["segments"],
            align.model,
            align.metadata,
            audio,
            settings.device,
            return_char_alignments=False,
        )

        # 3. Diarization
        diarize_segments = self.diarize_model(  # type: ignore[misc]
            audio,
            min_speakers=min_speakers,
            max_speakers=max_speakers,
        )

        result = whisperx.assign_word_speakers(diarize_segments, aligned)
        speakers = sorted({seg.get("speaker") for seg in result["segments"] if seg.get("speaker")})

        out: dict[str, Any] = {
            "language": detected_language,
            "duration": duration,
            "num_speakers": len(speakers),
            "segments": result["segments"],
        }

        # 4. Speaker embeddings + identification (ECAPA-TDNN)
        speaker_embeddings: dict[str, np.ndarray] = {}
        if return_embeddings or identify:
            speaker_embeddings = self.verifier.embed_per_speaker(audio, result["segments"])

        if return_embeddings:
            out["speaker_embeddings"] = {sp: emb.tolist() for sp, emb in speaker_embeddings.items()}
            out["embedding_dim"] = (
                int(next(iter(speaker_embeddings.values())).size) if speaker_embeddings else 0
            )

        if identify:
            identifications: dict[str, dict[str, Any] | None] = {}
            for sp in speakers:
                emb = speaker_embeddings.get(sp)
                if emb is None:
                    identifications[sp] = None
                    continue
                match = self.gallery.identify(emb, settings.identify_threshold)
                identifications[sp] = (
                    {"name": match.name, "score": match.score} if match else None
                )
            out["identifications"] = identifications

        return out

    def embed_audio(
        self,
        audio_path: str,
        *,
        start: float | None = None,
        end: float | None = None,
    ) -> np.ndarray:
        """Embed an audio file (optionally a sub-window) for enrollment."""
        if not self.loaded:
            raise RuntimeError("pipeline not loaded")
        assert self.verifier is not None

        audio: np.ndarray = whisperx.load_audio(audio_path)
        if start is not None or end is not None:
            s = max(0, int(round((start or 0.0) * 16000)))
            e = min(audio.size, int(round((end if end is not None else audio.size / 16000) * 16000)))
            if e <= s:
                raise ValueError("invalid start/end window")
            audio = audio[s:e]
        return self.verifier.embed(audio)

    def unload(self) -> None:
        self.asr_model = None
        self.diarize_model = None
        self.verifier = None
        self.gallery = None
        self._align_cache.clear()
        gc.collect()


pipeline = DiarizationPipelineWrapper()
