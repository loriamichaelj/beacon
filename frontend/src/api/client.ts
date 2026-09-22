export interface FieldError {
  loc: (string | number)[];
  msg: string;
}

export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  errors?: FieldError[];
}

export class ApiError extends Error {
  readonly status: number;
  readonly problem: ProblemDetail;

  constructor(problem: ProblemDetail) {
    super(problem.detail || problem.title || "Request failed.");
    this.name = "ApiError";
    this.status = problem.status;
    this.problem = problem;
  }
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

export type QueryValue = string | number | boolean | undefined | null;
export type QueryParams = object;

function buildQuery(params?: QueryParams): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params as Record<string, QueryValue | QueryValue[]>)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null) search.append(key, String(item));
      }
    } else {
      search.append(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  params?: QueryParams;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, params } = options;

  const response = await fetch(`${BASE_URL}${path}${buildQuery(params)}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      "X-Request-ID": crypto.randomUUID(),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const data: unknown = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new ApiError(data as ProblemDetail);
  }

  return data as T;
}
