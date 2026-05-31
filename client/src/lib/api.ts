/**
 * API client helper for AgoraX frontend.
 *
 * Wraps fetch with automatic error handling, JSON parsing,
 * and credential forwarding for session-based auth.
 */

export class ApiError extends Error {
  status: number;
  errors?: Record<string, any>;

  constructor(status: number, message: string, errors?: Record<string, any>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}

async function parseErrorResponse(res: Response): Promise<ApiError> {
  let errorMessage = res.statusText;
  let errorDetails: Record<string, any> | undefined;

  try {
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      const errorData = await res.json();
      errorMessage = errorData.message || errorMessage;
      errorDetails = errorData.errors;
    } else {
      errorMessage = await res.text();
    }
  } catch {
    errorMessage = "An error occurred. Please try again later.";
  }

  return new ApiError(res.status, errorMessage, errorDetails);
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    throw await parseErrorResponse(res);
  }
}

interface ApiResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}

// ─── CSRF double-submit ────────────────────────────────────────────────────
// Server enforces X-CSRF-Token on all state-changing /api/* requests. The
// token lives in a non-HttpOnly cookie set by GET /api/csrf (or any GET that
// touches the middleware). We bootstrap on first non-GET and echo every call.
const CSRF_COOKIE = 'agorax_csrf';
let csrfBootstrap: Promise<void> | null = null;

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  for (const part of document.cookie.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

async function ensureCsrfCookie(): Promise<void> {
  if (readCookie(CSRF_COOKIE)) return;
  if (!csrfBootstrap) {
    csrfBootstrap = fetch('/api/csrf', { credentials: 'include' })
      .then(() => undefined)
      .catch(() => undefined);
  }
  await csrfBootstrap;
  csrfBootstrap = null;
}

async function buildHeaders(body: unknown, includeCsrf: boolean): Promise<Record<string, string>> {
  const headers: Record<string, string> = body ? { "Content-Type": "application/json" } : {};
  if (includeCsrf) {
    await ensureCsrfCookie();
    const token = readCookie(CSRF_COOKIE);
    if (token) headers["X-CSRF-Token"] = token;
  }
  return headers;
}

export const api = {
  async get<T>(url: string): Promise<ApiResponse<T>> {
    const res = await fetch(url, {
      credentials: "include",
    });
    await throwIfResNotOk(res);
    const data = await res.json();
    return { data, status: res.status, headers: res.headers };
  },

  async post<T>(url: string, body?: unknown): Promise<ApiResponse<T>> {
    const headers = await buildHeaders(body, true);
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "include",
    });
    await throwIfResNotOk(res);
    const data = await res.json();
    return { data, status: res.status, headers: res.headers };
  },

  async patch<T>(url: string, body?: unknown): Promise<ApiResponse<T>> {
    const headers = await buildHeaders(body, true);
    const res = await fetch(url, {
      method: "PATCH",
      headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "include",
    });
    await throwIfResNotOk(res);
    const data = await res.json();
    return { data, status: res.status, headers: res.headers };
  },

  async put<T>(url: string, body?: unknown): Promise<ApiResponse<T>> {
    const headers = await buildHeaders(body, true);
    const res = await fetch(url, {
      method: "PUT",
      headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "include",
    });
    await throwIfResNotOk(res);
    const data = await res.json();
    return { data, status: res.status, headers: res.headers };
  },

  async delete<T>(url: string): Promise<ApiResponse<T>> {
    const headers = await buildHeaders(undefined, true);
    const res = await fetch(url, {
      method: "DELETE",
      headers,
      credentials: "include",
    });
    await throwIfResNotOk(res);
    const data = await res.json();
    return { data, status: res.status, headers: res.headers };
  },
};
