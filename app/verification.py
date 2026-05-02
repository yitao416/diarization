"""Speaker verification: ECAPA-TDNN embeddings + a JSON-backed gallery."""
from __future__ import annotations

import json
import logging
import os
import tempfile
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import torch

logger = logging.getLogger(__name__)

SAMPLE_RATE = 16000
_MIN_SPEECH_SECONDS = 0.5


@dataclass
class IdentificationMatch:
    name: str
    score: float


class SpeakerVerifier:
    """SpeechBrain ECAPA-TDNN wrapper. Returns unit-norm float64 embeddings."""

    def __init__(self, source: str, savedir: str | None = None, device: str = "cpu") -> None:
        self.source = source
        self.savedir = savedir
        self.device = device
        self._model: Any = None

    @property
    def loaded(self) -> bool:
        return self._model is not None

    def load(self) -> None:
        from speechbrain.inference.speaker import EncoderClassifier

        logger.info("loading verification model source=%s device=%s", self.source, self.device)
        self._model = EncoderClassifier.from_hparams(
            source=self.source,
            savedir=self.savedir,
            run_opts={"device": self.device},
        )

    def embed(self, audio: np.ndarray) -> np.ndarray:
        if not self.loaded:
            raise RuntimeError("verifier not loaded")
        min_samples = int(_MIN_SPEECH_SECONDS * SAMPLE_RATE)
        if audio.size < min_samples:
            audio = np.pad(audio, (0, min_samples - audio.size))
        wav = torch.from_numpy(audio.astype(np.float32)).unsqueeze(0)
        with torch.no_grad():
            emb = self._model.encode_batch(wav)
        vec = emb.squeeze().detach().cpu().numpy().astype(np.float64)
        norm = float(np.linalg.norm(vec))
        if norm < 1e-12:
            return vec
        return vec / norm

    def embed_per_speaker(
        self,
        audio: np.ndarray,
        segments: list[dict[str, Any]],
    ) -> dict[str, np.ndarray]:
        """Concatenate each speaker's diarized turns and embed once per speaker."""
        per_speaker: dict[str, list[np.ndarray]] = {}
        for seg in segments:
            sp = seg.get("speaker")
            if not sp:
                continue
            start = max(0, int(round(float(seg["start"]) * SAMPLE_RATE)))
            end = min(audio.size, int(round(float(seg["end"]) * SAMPLE_RATE)))
            if end <= start:
                continue
            per_speaker.setdefault(sp, []).append(audio[start:end])
        return {sp: self.embed(np.concatenate(chunks)) for sp, chunks in per_speaker.items()}


class SpeakerGallery:
    """JSON-backed {name: unit-norm embedding} store. Atomic writes, single-process lock."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self._lock = threading.Lock()
        self._entries: dict[str, np.ndarray] = {}
        self._load_from_disk()

    def _load_from_disk(self) -> None:
        if not self.path.is_file():
            return
        try:
            data = json.loads(self.path.read_text())
        except json.JSONDecodeError:
            logger.warning("gallery %s is not valid json; starting empty", self.path)
            return
        for name, vec in data.items():
            self._entries[name] = np.asarray(vec, dtype=np.float64)
        logger.info("loaded %d enrolled speakers from %s", len(self._entries), self.path)

    def _flush_to_disk(self) -> None:
        parent = self.path.parent if str(self.path.parent) else Path(".")
        parent.mkdir(parents=True, exist_ok=True)
        serializable = {name: vec.tolist() for name, vec in self._entries.items()}
        fd, tmp = tempfile.mkstemp(prefix=".gallery-", dir=str(parent))
        os.close(fd)
        Path(tmp).write_text(json.dumps(serializable, indent=2))
        os.replace(tmp, self.path)

    def enroll(self, name: str, embedding: np.ndarray) -> None:
        with self._lock:
            self._entries[name] = embedding
            self._flush_to_disk()

    def remove(self, name: str) -> bool:
        with self._lock:
            if name not in self._entries:
                return False
            del self._entries[name]
            self._flush_to_disk()
            return True

    def names(self) -> list[str]:
        with self._lock:
            return sorted(self._entries.keys())

    def is_empty(self) -> bool:
        with self._lock:
            return not self._entries

    def identify(self, embedding: np.ndarray, threshold: float) -> IdentificationMatch | None:
        with self._lock:
            if not self._entries:
                return None
            names = list(self._entries.keys())
            matrix = np.stack([self._entries[n] for n in names])
        sims = matrix @ embedding
        idx = int(np.argmax(sims))
        score = float(sims[idx])
        if score < threshold:
            return None
        return IdentificationMatch(name=names[idx], score=score)
