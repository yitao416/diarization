"""Render a diarization visualization from a saved JSON + the original audio file.

Usage:
    uv run python -m scripts.visualize \
        outputs/pyannote_sample.diarized.json \
        --audio examples/pyannote_sample.wav \
        --out outputs/pyannote_sample.png
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import whisperx

from app.visualize import render


def main() -> None:
    parser = argparse.ArgumentParser(description="Visualize a diarization result.")
    parser.add_argument("json_file", type=Path, help="diarization JSON produced by scripts.diarize")
    parser.add_argument("--audio", type=Path, required=True, help="original audio file")
    parser.add_argument("--out", type=Path, default=None, help="output PNG path")
    args = parser.parse_args()

    if not args.json_file.is_file():
        raise SystemExit(f"json not found: {args.json_file}")
    if not args.audio.is_file():
        raise SystemExit(f"audio not found: {args.audio}")

    result = json.loads(args.json_file.read_text())
    audio = whisperx.load_audio(str(args.audio))
    png = render(audio, result, title=args.audio.name)

    out = args.out or args.json_file.with_suffix(".png")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(png)
    print(f"wrote {out}  ({len(png) / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
