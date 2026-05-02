export type Segment = {
  start: number;
  end: number;
  text?: string;
  speaker?: string;
  // WhisperX may add more keys (words, etc.) — preserved as-is.
  [k: string]: unknown;
};

export type Identification = {
  name: string;
  cosine: number;
  margin: number;
};

export type DiarizeResponse = {
  language?: string;
  num_speakers: number;
  speakers: string[];
  segments: Segment[];
  speaker_embeddings?: Record<string, number[]>;
  identifications?: Record<string, Identification | null>;
};

export type HealthResponse = {
  status: "ok" | "loading";
  model_loaded: boolean;
  whisper_model: string;
  device: string;
  compute_type: string;
};

export type DiarizeOptions = {
  identify: boolean;
  returnEmbeddings: boolean;
  minSpeakers?: number | null;
  maxSpeakers?: number | null;
  language?: string | null;
};

export type EnrollOptions = {
  start?: number;
  end?: number;
};
