# YouTube source manifest

Audio files in this directory are gitignored (copyrighted), but this manifest is tracked so anyone can re-fetch them. Each file was produced by `scripts/yt_clip.py` from the URL + window listed below; output is 16 kHz mono WAV.

To regenerate everything:

```bash
uv run python -m scripts.yt_clip "<url>" --start <t> --end <t> --out <path>
```

## Speaker enrollment clips

Each is a clean window of a single speaker, used by `POST /speakers/enroll`. Picked carefully to avoid host crosstalk, applause, or background music — a contaminated enrollment window silently breaks every downstream identification, so it's worth being deliberate.

| File | Source URL | Window | Speaker |
|------|------------|--------|---------|
| `gates_alz.wav` | https://www.youtube.com/watch?v=ov5UziJuEe4 (Bill Gates channel: "The next phase of the Alzheimer's fight is here", 2025-06-17, 1:15) | 0:10–0:35 (25s) | Bill Gates |
| `sorkin_enroll.wav` | https://www.youtube.com/watch?v=5JJBOEPRB2k | 0:00–0:30 (30s) | Andrew Ross Sorkin (host) |
| `gates_enroll.wav` | https://www.youtube.com/watch?v=_15DReQKbt8 (NYT Events: "Bill Gates Talks Philanthropy, Microsoft, and Taxes \| DealBook", 2019-11-06, 38:25) | 4:00–4:40 (40s) | Bill Gates |
| `musk_enroll.wav` | https://www.youtube.com/watch?v=HchjzkQmDYU (Jack Jensen mirror: "Elon Musk interview by Andrew Ross Sorkin at DealBook Summit", 2023-11-30, 92:23) | 30:00–30:40 (40s) | Elon Musk |

⚠️ A first attempt at `musk_enroll.wav` from `4:00-4:40` of the Musk DealBook turned out to be Sorkin still in his intro, not Musk. The 30:00-30:40 window above is the corrected one. General lesson: for long-form interviews, enroll from deep into the recording, not the first few minutes. (Same window worked fine for the 38-min Gates DealBook because that interview gets to the guest faster.)

## Identification target clips

Diarized + identified against the gallery via `POST /diarize?identify=true`.

| File | Source URL | Window | Contents |
|------|------------|--------|----------|
| `dealbook_gates_test.wav` | https://www.youtube.com/watch?v=_15DReQKbt8 (Gates DealBook 2019) | 2:00–3:00 (60s) | Earlier in the interview where talk-time is more balanced between Sorkin and Gates — the 8:00 window was too Gates-dominant and collapsed into one diarizer cluster without `min/max=2`. |
| `dealbook_musk_test.wav` | https://www.youtube.com/watch?v=HchjzkQmDYU (Musk DealBook 2023) | 8:00–9:00 (60s) | Mix of Musk apologizing for the anti-Semitic-tweet incident + Sorkin's framing question. The interesting result here is **cross-file Sorkin identification**: Sorkin is enrolled from a completely different YouTube clip (`sorkin_enroll.wav`, source above) and still gets identified in this 2023 DealBook recording — different setting, different microphone, different year. |

## License / legal

YouTube's Terms of Service prohibit downloading without permission. These local copies are for personal demo / development use only and must not be redistributed. If this repository is ever published, do not include the audio files — only this manifest.
