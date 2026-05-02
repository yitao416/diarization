"""Download a small set of public-domain audio examples for testing diarization.

Run:
    uv run python -m scripts.download_examples
"""
from __future__ import annotations

import sys
import urllib.request
from pathlib import Path

EXAMPLES: list[tuple[str, str, str]] = [
    # (filename, url, description)
    (
        "pyannote_sample.wav",
        "https://github.com/pyannote/pyannote-audio/raw/main/tutorials/assets/sample.wav",
        "pyannote.audio multi-speaker tutorial sample (~30s)",
    ),
    (
        "jfk.flac",
        "https://github.com/openai/whisper/raw/main/tests/jfk.flac",
        "JFK 'ask not what your country' (~11s, single speaker, public domain)",
    ),
    (
        "ami_es2004a_subset.wav",
        "https://groups.inf.ed.ac.uk/ami/AMICorpusMirror/amicorpus/ES2004a/audio/ES2004a.Mix-Headset.wav",
        "AMI corpus ES2004a meeting (~30 min, 4 speakers) — large file",
    ),
]

OUT = Path("examples")


def download(url: str, dest: Path) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=30) as resp, dest.open("wb") as f:
            total = 0
            while chunk := resp.read(1024 * 1024):
                f.write(chunk)
                total += len(chunk)
        print(f"  ok  {dest.name}  ({total / 1024 / 1024:.1f} MB)")
        return True
    except Exception as e:
        print(f"  FAILED  {dest.name}: {e}", file=sys.stderr)
        dest.unlink(missing_ok=True)
        return False


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    skip_large = "--skip-large" in sys.argv
    for name, url, desc in EXAMPLES:
        if skip_large and "ami_" in name:
            print(f"  skip  {name}  (--skip-large)")
            continue
        dest = OUT / name
        if dest.exists() and dest.stat().st_size > 0:
            print(f"  have  {name}  ({dest.stat().st_size / 1024 / 1024:.1f} MB)")
            continue
        print(f"  get   {name}  — {desc}")
        download(url, dest)


if __name__ == "__main__":
    main()
