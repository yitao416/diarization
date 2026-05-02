import type {
  DiarizeOptions,
  DiarizeResponse,
  EnrollOptions,
  HealthResponse,
} from "./types";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function asJsonOrThrow<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      const body = await resp.json();
      if (body && typeof body.detail === "string") detail = body.detail;
    } catch {
      /* not JSON */
    }
    throw new ApiError(resp.status, detail);
  }
  return resp.json() as Promise<T>;
}

export async function getHealth(): Promise<HealthResponse> {
  const resp = await fetch("/health");
  return asJsonOrThrow<HealthResponse>(resp);
}

export async function listSpeakers(): Promise<string[]> {
  const resp = await fetch("/speakers");
  const body = await asJsonOrThrow<{ speakers: string[] }>(resp);
  return body.speakers;
}

export async function deleteSpeaker(name: string): Promise<void> {
  const resp = await fetch(`/speakers/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
  await asJsonOrThrow<unknown>(resp);
}

export async function enrollSpeaker(
  name: string,
  file: File,
  opts: EnrollOptions = {},
): Promise<void> {
  const form = new FormData();
  form.append("name", name);
  form.append("file", file);
  if (opts.start !== undefined) form.append("start", String(opts.start));
  if (opts.end !== undefined) form.append("end", String(opts.end));
  const resp = await fetch("/speakers/enroll", { method: "POST", body: form });
  await asJsonOrThrow<unknown>(resp);
}

export type DiarizeProgress = (loaded: number, total: number) => void;

export function diarize(
  file: File,
  opts: DiarizeOptions,
  onUploadProgress?: DiarizeProgress,
): { promise: Promise<DiarizeResponse>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<DiarizeResponse>((resolve, reject) => {
    xhr.open("POST", "/diarize");
    xhr.responseType = "json";
    if (onUploadProgress) {
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) onUploadProgress(ev.loaded, ev.total);
      };
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response as DiarizeResponse);
      } else {
        const detail =
          (xhr.response && (xhr.response as { detail?: string }).detail) ||
          xhr.statusText ||
          `HTTP ${xhr.status}`;
        reject(new ApiError(xhr.status, detail));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, "network error"));
    xhr.onabort = () => reject(new ApiError(0, "aborted"));

    const form = new FormData();
    form.append("file", file);
    form.append("identify", String(opts.identify));
    form.append("return_embeddings", String(opts.returnEmbeddings));
    if (opts.minSpeakers != null) form.append("min_speakers", String(opts.minSpeakers));
    if (opts.maxSpeakers != null) form.append("max_speakers", String(opts.maxSpeakers));
    if (opts.language) form.append("language", opts.language);
    xhr.send(form);
  });
  return { promise, abort: () => xhr.abort() };
}
