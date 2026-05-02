"""CLI: diarize a single audio file and write a JSON transcript.

Usage:
    uv run python -m scripts.diarize examples/sample.wav
    uv run python -m scripts.diarize examples/sample.wav --out outputs/sample.json --max-speakers 4
"""
from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path

from app.pipeline import pipeline

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


def main() -> None:
    parser = argparse.ArgumentParser(description="Diarize an audio file with WhisperX.")
    parser.add_argument("audio", type=Path, help="path to audio file (any ffmpeg-readable format)")
    parser.add_argument("--out", type=Path, default=None, help="output JSON path")
    parser.add_argument("--language", type=str, default=None)
    parser.add_argument("--min-speakers", type=int, default=None)
    parser.add_argument("--max-speakers", type=int, default=None)
    parser.add_argument(
        "--embeddings",
        action="store_true",
        help="include per-speaker embedding vectors in the output",
    )
    args = parser.parse_args()

    if not args.audio.is_file():
        raise SystemExit(f"audio file not found: {args.audio}")

    pipeline.load()
    result = pipeline.run(
        str(args.audio),
        language=args.language,
        min_speakers=args.min_speakers,
        max_speakers=args.max_speakers,
        return_embeddings=args.embeddings,
    )

    out = args.out or Path("outputs") / f"{args.audio.stem}.diarized.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2, ensure_ascii=False, default=str))
    print(f"wrote {out}  language={result['language']}  speakers={result['num_speakers']}  duration={result['duration']:.1f}s")


if __name__ == "__main__":
    main()
