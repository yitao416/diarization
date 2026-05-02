"""Render a diarization result as a multi-panel matplotlib figure."""
from __future__ import annotations

import io
from typing import Any, Mapping, Sequence

import matplotlib

matplotlib.use("Agg")  # headless backend; safe in server contexts
import matplotlib.patches as mpatches
import matplotlib.pyplot as plt
import numpy as np


_SAMPLE_RATE = 16000


def _speaker_colors(speakers: Sequence[str]) -> dict[str, tuple[float, float, float]]:
    cmap = plt.get_cmap("tab10")
    return {sp: cmap(i % 10) for i, sp in enumerate(sorted(speakers))}


def _draw_waveform(ax: plt.Axes, audio: np.ndarray, segments: list[dict[str, Any]], colors: dict[str, Any]) -> None:
    n = len(audio)
    duration = n / _SAMPLE_RATE
    t = np.linspace(0, duration, n, endpoint=False)

    # Decimate for plotting if very long.
    stride = max(1, n // 8000)
    ax.plot(t[::stride], audio[::stride], color="#888888", linewidth=0.6, alpha=0.7)

    for seg in segments:
        sp = seg.get("speaker")
        if not sp:
            continue
        ax.axvspan(seg["start"], seg["end"], color=colors[sp], alpha=0.25, linewidth=0)

    ax.set_xlim(0, duration)
    ax.set_ylabel("amplitude")
    ax.set_title("Waveform with speaker regions", fontsize=11, loc="left")
    ax.set_xticks([])

    handles = [mpatches.Patch(color=c, label=sp, alpha=0.55) for sp, c in colors.items()]
    ax.legend(handles=handles, loc="upper right", fontsize=8, framealpha=0.9)


def _draw_timeline(ax: plt.Axes, segments: list[dict[str, Any]], colors: dict[str, Any], duration: float) -> None:
    speakers = sorted(colors.keys())
    y_for = {sp: i for i, sp in enumerate(speakers)}

    for seg in segments:
        sp = seg.get("speaker")
        if not sp:
            continue
        ax.barh(
            y_for[sp],
            seg["end"] - seg["start"],
            left=seg["start"],
            height=0.65,
            color=colors[sp],
            edgecolor="black",
            linewidth=0.3,
        )

    ax.set_yticks(list(y_for.values()))
    ax.set_yticklabels(speakers, fontsize=9)
    ax.set_xlim(0, duration)
    ax.set_ylim(-0.6, len(speakers) - 0.4)
    ax.invert_yaxis()
    ax.set_xlabel("time (s)")
    ax.set_title("Speaker timeline", fontsize=11, loc="left")
    ax.grid(axis="x", alpha=0.3, linestyle="--")


def _draw_embeddings(
    ax: plt.Axes,
    embeddings: Mapping[str, Sequence[float]],
    colors: dict[str, Any],
) -> None:
    speakers = sorted(embeddings.keys())
    matrix = np.array([embeddings[sp] for sp in speakers], dtype=np.float64)

    if len(speakers) <= 2:
        # Cosine-similarity heatmap.
        norms = np.linalg.norm(matrix, axis=1, keepdims=True) + 1e-12
        unit = matrix / norms
        sim = unit @ unit.T

        im = ax.imshow(sim, cmap="RdBu_r", vmin=-1, vmax=1)
        ax.set_xticks(range(len(speakers)))
        ax.set_yticks(range(len(speakers)))
        ax.set_xticklabels(speakers, fontsize=9, rotation=30, ha="right")
        ax.set_yticklabels(speakers, fontsize=9)
        for i in range(len(speakers)):
            for j in range(len(speakers)):
                ax.text(
                    j, i, f"{sim[i, j]:.2f}",
                    ha="center", va="center",
                    color="white" if abs(sim[i, j]) > 0.6 else "black",
                    fontsize=10,
                )
        ax.set_title(f"Speaker embedding similarity (cosine, dim={matrix.shape[1]})", fontsize=11, loc="left")
        plt.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
    else:
        # PCA to 2D for ≥3 speakers.
        from sklearn.decomposition import PCA

        coords = PCA(n_components=2).fit_transform(matrix)
        for sp, (x, y) in zip(speakers, coords):
            ax.scatter(x, y, color=colors[sp], s=120, edgecolor="black", linewidth=0.6, zorder=3)
            ax.annotate(sp, (x, y), xytext=(6, 4), textcoords="offset points", fontsize=9)
        ax.axhline(0, color="#cccccc", linewidth=0.5)
        ax.axvline(0, color="#cccccc", linewidth=0.5)
        ax.set_xlabel("PC1")
        ax.set_ylabel("PC2")
        ax.set_title(f"Speaker embeddings (PCA→2D, dim={matrix.shape[1]})", fontsize=11, loc="left")
        ax.grid(alpha=0.3, linestyle="--")


def render(
    audio: np.ndarray,
    result: dict[str, Any],
    *,
    title: str | None = None,
) -> bytes:
    """Return a PNG of the diarization result. `audio` is mono float32 at 16 kHz."""
    segments = result.get("segments", [])
    speakers = sorted({seg["speaker"] for seg in segments if seg.get("speaker")})
    colors = _speaker_colors(speakers)
    duration = float(result.get("duration") or len(audio) / _SAMPLE_RATE)
    embeddings = result.get("speaker_embeddings")

    if embeddings:
        fig, axes = plt.subplots(
            3, 1,
            figsize=(11, 8),
            gridspec_kw={"height_ratios": [2, 2, 3]},
        )
        ax_wave, ax_tl, ax_emb = axes
    else:
        fig, axes = plt.subplots(2, 1, figsize=(11, 5), gridspec_kw={"height_ratios": [2, 2]})
        ax_wave, ax_tl = axes
        ax_emb = None

    _draw_waveform(ax_wave, audio, segments, colors)
    _draw_timeline(ax_tl, segments, colors, duration)
    if ax_emb is not None and embeddings:
        _draw_embeddings(ax_emb, embeddings, colors)

    if title:
        fig.suptitle(title, fontsize=12, y=0.995)
    fig.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=120, bbox_inches="tight")
    plt.close(fig)
    return buf.getvalue()
