export type WordSegment = {
  word: string;
  start?: number | null;
  end?: number | null;
  score?: number | null;
  speaker?: string | null;
};

export type Segment = {
  start: number;
  end: number;
  text: string;
  speaker?: string | null;
  words?: WordSegment[];
  [k: string]: unknown;
};

export type Identification = {
  name: string;
  score: number;
};

export type DiarizeResponse = {
  language: string;
  duration: number;
  num_speakers: number;
  segments: Segment[];
  embedding_dim?: number | null;
  speaker_embeddings?: Record<string, number[]> | null;
  identifications?: Record<string, Identification | null> | null;
};

export function speakersOf(result: Pick<DiarizeResponse, "segments">): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of result.segments) {
    if (s.speaker && !seen.has(s.speaker)) {
      seen.add(s.speaker);
      out.push(s.speaker);
    }
  }
  return out;
}

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
