"""Fetch a windowed clip from a YouTube URL and convert it to 16 kHz mono WAV.

The audio format matches what `whisperx.load_audio` and the ECAPA-TDNN verifier
expect, so the output is ready to drop into `/diarize` or `/speakers/enroll`.

Usage:
    uv run python -m scripts.yt_clip "https://www.youtube.com/watch?v=..." \\
        --start 1:30 --end 1:50 --out examples/yt/elon_lex.wav

Prerequisites: `yt-dlp` and `ffmpeg` on PATH. (`brew install yt-dlp ffmpeg`).
The window is downloaded directly via `yt-dlp --download-sections`, so a 2-hour
podcast does not need to be fully fetched to grab a 20-second clip.

Note: the `examples/yt/` subdirectory is gitignored — copyrighted audio should
not be committed to the repo.
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


def _require(cmd: str) -> None:
    if shutil.which(cmd) is None:
        sys.exit(f"required tool not found on PATH: {cmd} (brew install {cmd})")


def fetch_window(url: str, start: str, end: str, dst: Path) -> None:
    _require("yt-dlp")
    _require("ffmpeg")

    dst.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="yt-clip-") as tmpdir:
        tmp_template = str(Path(tmpdir) / "audio.%(ext)s")
        ydl_cmd = [
            "yt-dlp",
            "--download-sections", f"*{start}-{end}",
            "--force-keyframes-at-cuts",
            "-f", "bestaudio",
            "-o", tmp_template,
            url,
        ]
        print(f"$ {' '.join(ydl_cmd)}", flush=True)
        subprocess.run(ydl_cmd, check=True)

        produced = sorted(Path(tmpdir).iterdir())
        if not produced:
            sys.exit("yt-dlp produced no output")
        src = produced[0]

        ff_cmd = [
            "ffmpeg", "-y",
            "-i", str(src),
            "-ac", "1",
            "-ar", "16000",
            "-loglevel", "error",
            str(dst),
        ]
        print(f"$ {' '.join(ff_cmd)}", flush=True)
        subprocess.run(ff_cmd, check=True)

    size_kb = dst.stat().st_size / 1024
    print(f"wrote {dst}  ({size_kb:.1f} KB, 16 kHz mono WAV)")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fetch a windowed YouTube clip as 16 kHz mono WAV.",
    )
    parser.add_argument("url", help="YouTube video URL")
    parser.add_argument("--start", required=True, help="window start (seconds or HH:MM:SS)")
    parser.add_argument("--end", required=True, help="window end (seconds or HH:MM:SS)")
    parser.add_argument("--out", required=True, type=Path, help="output WAV path")
    args = parser.parse_args()

    fetch_window(args.url, args.start, args.end, args.out)


if __name__ == "__main__":
    main()
