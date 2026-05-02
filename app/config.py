from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    hf_token: str

    host: str = "0.0.0.0"
    port: int = 8000

    whisper_model: str = "large-v3-turbo"
    compute_type: str = "int8"
    device: str = "cpu"
    batch_size: int = 16

    align_model: str | None = None
    diarize_model: str = "pyannote/speaker-diarization-3.1"

    verify_model: str = "speechbrain/spkrec-ecapa-voxceleb"
    verify_model_savedir: str | None = None
    speaker_gallery_path: str = "gallery.json"
    identify_threshold: float = 0.45

    max_upload_mb: int = 200


settings = Settings()  # type: ignore[call-arg]
