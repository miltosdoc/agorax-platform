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
    const res = await fetch(url, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: "include",
    });
    await throwIfResNotOk(res);
    const data = await res.json();
    return { data, status: res.status, headers: res.headers };
  },

  async patch<T>(url: string, body?: unknown): Promise<ApiResponse<T>> {
    const res = await fetch(url, {
      method: "PATCH",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: "include",
    });
    await throwIfResNotOk(res);
    const data = await res.json();
    return { data, status: res.status, headers: res.headers };
  },

  async put<T>(url: string, body?: unknown): Promise<ApiResponse<T>> {
    const res = await fetch(url, {
      method: "PUT",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: "include",
    });
    await throwIfResNotOk(res);
    const data = await res.json();
    return { data, status: res.status, headers: res.headers };
  },

  async delete<T>(url: string): Promise<ApiResponse<T>> {
    const res = await fetch(url, {
      method: "DELETE",
      credentials: "include",
    });
    await throwIfResNotOk(res);
    const data = await res.json();
    return { data, status: res.status, headers: res.headers };
  },
};
