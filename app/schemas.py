from pydantic import BaseModel, ConfigDict, Field


class WordSegment(BaseModel):
    word: str
    start: float | None = None
    end: float | None = None
    score: float | None = None
    speaker: str | None = None


class Segment(BaseModel):
    model_config = ConfigDict(extra="allow")

    start: float
    end: float
    text: str
    speaker: str | None = None
    words: list[WordSegment] = Field(default_factory=list)


class DiarizeOptions(BaseModel):
    language: str | None = None
    min_speakers: int | None = None
    max_speakers: int | None = None


_EXAMPLE_RESPONSE: dict = {
    "language": "en",
    "duration": 30.0,
    "num_speakers": 2,
    "segments": [
        {
            "start": 6.73,
            "end": 7.07,
            "text": " Hello?",
            "speaker": "SPEAKER_01",
            "words": [
                {"word": "Hello?", "start": 6.73, "end": 7.07, "score": 0.67, "speaker": "SPEAKER_01"}
            ],
        },
        {
            "start": 8.43,
            "end": 9.79,
            "text": " Oh, hello. I didn't know you were there.",
            "speaker": "SPEAKER_00",
            "words": [],
        },
        {
            "start": 12.52,
            "end": 14.22,
            "text": " This is Diane in New Jersey.",
            "speaker": "SPEAKER_00",
            "words": [],
        },
        {
            "start": 14.42,
            "end": 17.74,
            "text": " And I'm Sheila in Texas, originally from Chicago.",
            "speaker": "SPEAKER_01",
            "words": [],
        },
    ],
}


class IdentificationResult(BaseModel):
    name: str
    score: float = Field(description="Cosine similarity against the matched gallery entry.")


class DiarizeResponse(BaseModel):
    model_config = ConfigDict(json_schema_extra={"example": _EXAMPLE_RESPONSE})

    language: str
    duration: float
    num_speakers: int
    segments: list[Segment]
    embedding_dim: int | None = Field(
        default=None,
        description="Dimensionality of each speaker embedding (only set when return_embeddings=true).",
    )
    speaker_embeddings: dict[str, list[float]] | None = Field(
        default=None,
        description=(
            "Per-speaker unit-norm embedding vectors keyed by SPEAKER_XX label. "
            "Returned only when return_embeddings=true. Vectors come from the "
            "ECAPA-TDNN verification model run on each speaker's diarized turns."
        ),
    )
    identifications: dict[str, IdentificationResult | None] | None = Field(
        default=None,
        description=(
            "Per-speaker match against the enrolled speaker gallery, keyed by "
            "SPEAKER_XX label. Returned only when identify=true. Value is null "
            "when no enrolled speaker exceeds the identification threshold."
        ),
    )


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    whisper_model: str
    device: str
    compute_type: str
