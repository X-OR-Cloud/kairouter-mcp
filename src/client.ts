// Thin client for the subset of the KaiRouter API this MCP server needs:
// public model listing (GET /v1/models) and the user-scoped async video
// generation API (POST /api/video/generate, GET /api/video/jobs[/{id}]).
// See internal/api/video/handler.go and internal/api/v1/models.go in the
// kai-router repo for the server-side implementation these calls hit.

const BASE_URL = (process.env.KAIROUTER_API_URL || "https://kairouter.com").replace(/\/+$/, "");
const API_KEY = process.env.KAIROUTER_API_KEY;

export class KaiRouterError extends Error {}

function requireAPIKey(): string {
  if (!API_KEY) {
    throw new KaiRouterError(
      "KAIROUTER_API_KEY is not set. Create a KaiRouter API key at https://kairouter.com/dashboard/api-keys " +
        "and set it as the KAIROUTER_API_KEY environment variable for this MCP server."
    );
  }
  return API_KEY;
}

async function request<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(init.headers as Record<string, string> | undefined) };
  if (auth) headers.Authorization = `Bearer ${requireAPIKey()}`;

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  } catch (err) {
    throw new KaiRouterError(`Failed to reach KaiRouter at ${BASE_URL}: ${(err as Error).message}`);
  }

  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const detail =
      body && typeof body === "object" && "error" in (body as Record<string, unknown>)
        ? JSON.stringify((body as Record<string, unknown>).error)
        : text || res.statusText;
    throw new KaiRouterError(`KaiRouter API returned ${res.status}: ${detail}`);
  }

  return body as T;
}

export interface VideoModel {
  id: string;
  name: string;
  category: string;
  provider_health: "healthy" | "degraded" | "down" | "unknown";
  pricing_rules?: unknown;
  cost_per_request_usd?: number;
}

interface ModelListResponse {
  object: string;
  data: VideoModel[];
}

/** GET /v1/models, filtered to category === "video". Public — no API key required. */
export async function listVideoModels(): Promise<VideoModel[]> {
  const res = await request<ModelListResponse>("/v1/models", {}, false);
  return res.data.filter((m) => m.category === "video");
}

export interface VideoJob {
  id: string;
  model: string;
  display_model: string;
  status: "queued" | "processing" | "succeeded" | "failed" | string;
  prompt: string;
  resolution: string;
  ratio: string;
  duration_secs: number;
  video_url?: string;
  last_frame_url?: string;
  cost_usd: number;
  error_message?: string;
  created_at: string;
  completed_at?: string;
}

// The raw statuses kai-router's poller ever settles a job into — see
// isTerminal in internal/api/video/poller.go. "processing"/"queued" and any
// other in-between provider status are non-terminal.
const TERMINAL_STATUSES = new Set(["succeeded", "failed", "cancelled", "expired"]);

export function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}

export interface GenerateVideoParams {
  model: string;
  prompt: string;
  negative_prompt?: string;
  resolution?: string;
  duration?: number;
  ratio?: string;
  image_url?: string;
  video_url?: string;
  input_duration_secs?: number;
  with_audio?: boolean;
}

/** POST /api/video/generate — starts an async job, returns immediately. */
export async function generateVideo(params: GenerateVideoParams): Promise<VideoJob> {
  return request<VideoJob>("/api/video/generate", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

/** GET /api/video/jobs/{id} — poll a job started by generateVideo. */
export async function getVideoJob(id: string): Promise<VideoJob> {
  return request<VideoJob>(`/api/video/jobs/${encodeURIComponent(id)}`);
}

/** GET /api/video/jobs — the caller's most recent jobs (server caps at 50). */
export async function listVideoJobs(): Promise<VideoJob[]> {
  const res = await request<{ jobs: VideoJob[] }>("/api/video/jobs");
  return res.jobs;
}
