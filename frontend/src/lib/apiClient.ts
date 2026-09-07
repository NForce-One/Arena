import type { ApiErrorDetail, ApiErrorEnvelope, AuthUserDto } from '@nforce/shared';

const rawApiBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
const API_BASE = rawApiBase && rawApiBase !== 'same-origin' ? rawApiBase.replace(/\/$/, '') : '';

function apiUrl(path: string): string {
  return API_BASE ? `${API_BASE}${path}` : path;
}

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: ApiErrorDetail[] | unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  skipAuthRetry?: boolean;
}

async function toApiError(res: Response): Promise<ApiError> {
  let envelope: ApiErrorEnvelope | null = null;
  try {
    envelope = (await res.json()) as ApiErrorEnvelope;
  } catch {
  }
  return new ApiError(
    res.status,
    envelope?.error.code ?? 'UNKNOWN',
    envelope?.error.message ?? `Request failed (${res.status})`,
    envelope?.error.details,
  );
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const doFetch = () =>
    fetch(apiUrl(path), {
      method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
      headers: {
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      credentials: 'include',
    });

  let res = await doFetch();
  if (res.status === 401 && !options.skipAuthRetry) {
    const refreshed = await refreshSession();
    if (refreshed) res = await doFetch();
  }
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

interface RefreshResponse {
  user: AuthUserDto;
  accessToken: string;
}

let refreshPromise: Promise<AuthUserDto | null> | null = null;

export function refreshSession(): Promise<AuthUserDto | null> {
  refreshPromise ??= (async () => {
    try {
      const res = await fetch(apiUrl('/api/auth/refresh'), {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        setAccessToken(null);
        return null;
      }
      const data = (await res.json()) as RefreshResponse;
      setAccessToken(data.accessToken);
      return data.user;
    } catch {
      setAccessToken(null);
      return null;
    }
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}
