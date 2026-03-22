const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function getAuthHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("chiroflow_access_token") : null;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

/**
 * Attempt to refresh the access token using the refresh token.
 * Returns true if a new access token was stored, false otherwise.
 */
async function tryRefreshToken(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const refresh = localStorage.getItem("chiroflow_refresh_token");
  if (!refresh) return false;
  try {
    const res = await fetch(`${API_BASE}/auth/token/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { access: string };
    if (data.access) {
      localStorage.setItem("chiroflow_access_token", data.access);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Clear auth tokens and optionally redirect to sign-in.
 */
function clearAuthAndRedirect(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("chiroflow_access_token");
  localStorage.removeItem("chiroflow_refresh_token");
  window.location.href = "/auth/sign-in";
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = (await res.json()) as { detail?: string };
      throw new ApiError(data.detail || "Request failed", res.status);
    }
    const message = await res.text();
    throw new ApiError(message || "Request failed", res.status);
  }
  if (res.status === 204 || res.status === 205) {
    return undefined as T;
  }
  const text = await res.text();
  if (!text.trim()) {
    return undefined as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError("Invalid response from server", res.status);
  }
}

/** `body` may be a plain object; fetchWithAuth JSON-stringifies it before calling fetch. */
type AuthFetchOptions = Omit<RequestInit, "body"> & { body?: string | object | null };

/**
 * Fetches with auth. On 401, tries to refresh the token and retries once.
 * If refresh fails, clears tokens and redirects to sign-in.
 */
async function fetchWithAuth(
  url: string,
  options: AuthFetchOptions,
  isRetry = false
): Promise<Response> {
  const headers = { ...getAuthHeaders(), ...(options.headers as Record<string, string>) };
  const body =
    typeof options.body === "object" && options.body !== null
      ? JSON.stringify(options.body)
      : options.body;

  const res = await fetch(url, {
    ...options,
    headers,
    body,
  });

  if (res.status === 401 && !isRetry) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      return fetchWithAuth(url, { ...options, body }, true);
    }
    clearAuthAndRedirect();
  }

  return res;
}

/** Public GET (no auth). */
export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  return handleResponse<T>(res);
}

/** Public POST (no auth) — booking, kiosk, Stripe setup, etc. */
export async function apiPostPublic<T>(path: string, payload: object): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<T>(res);
}

/** Authenticated GET. */
export async function apiGetAuth<T>(path: string): Promise<T> {
  const res = await fetchWithAuth(`${API_BASE}${path}`, { method: "GET" });
  return handleResponse<T>(res);
}

export async function apiPost<T>(path: string, payload: object): Promise<T> {
  const res = await fetchWithAuth(`${API_BASE}${path}`, {
    method: "POST",
    body: payload,
  });
  return handleResponse<T>(res);
}

/** Authenticated PUT. */
export async function apiPut<T>(path: string, payload: object): Promise<T> {
  const res = await fetchWithAuth(`${API_BASE}${path}`, {
    method: "PUT",
    body: payload,
  });
  return handleResponse<T>(res);
}

/** Authenticated PATCH. */
export async function apiPatch<T>(path: string, payload: object): Promise<T> {
  const res = await fetchWithAuth(`${API_BASE}${path}`, {
    method: "PATCH",
    body: payload,
  });
  return handleResponse<T>(res);
}

/** Authenticated DELETE. */
export async function apiDelete<T = void>(path: string): Promise<T> {
  const res = await fetchWithAuth(`${API_BASE}${path}`, { method: "DELETE" });
  return handleResponse<T>(res);
}
