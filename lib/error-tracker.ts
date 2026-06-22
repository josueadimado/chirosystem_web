import { apiGetAuth, apiPatch, apiPost } from "@/lib/api";

const STORAGE_KEY = "chiroflow_error_tracker_token";

export type ErrorTrackerStatus = {
  configured: boolean;
  unlocked: boolean;
};

export type SystemErrorLogRow = {
  id: number;
  created_at: string;
  updated_at: string;
  level: string;
  source: string;
  message: string;
  exception_type: string;
  http_method: string;
  path: string;
  status_code: number | null;
  user_id: number | null;
  user_display: string;
  user_role: string;
  resolved_at: string | null;
  resolved_by_id: number | null;
  fingerprint: string;
};

export type SystemErrorLogDetail = SystemErrorLogRow & {
  traceback_text: string;
  query_string: string;
  request_body: string;
  extra: Record<string, unknown>;
  resolution_notes: string;
};

export type ErrorLogsResponse = {
  total: number;
  open_count: number;
  offset: number;
  limit: number;
  results: SystemErrorLogRow[];
};

function trackerHeaders(): Record<string, string> | undefined {
  if (typeof window === "undefined") return undefined;
  const token = sessionStorage.getItem(STORAGE_KEY);
  if (!token) return undefined;
  return { "X-Error-Tracker-Token": token };
}

export function saveErrorTrackerToken(token: string): void {
  sessionStorage.setItem(STORAGE_KEY, token);
}

export function clearErrorTrackerToken(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

export async function fetchErrorTrackerStatus(): Promise<ErrorTrackerStatus> {
  return apiGetAuth<ErrorTrackerStatus>("/admin/error_tracker_status/", {
    headers: trackerHeaders(),
  });
}

export async function unlockErrorTracker(password: string): Promise<{ token: string; expires_in: number }> {
  const out = await apiPost<{ token: string; expires_in: number }>("/admin/error_tracker_unlock/", {
    password,
  });
  saveErrorTrackerToken(out.token);
  return out;
}

export async function configureErrorTracker(
  password: string,
  confirm_password: string,
): Promise<{ token: string; expires_in: number; configured: boolean; detail: string }> {
  const out = await apiPost<{
    token: string;
    expires_in: number;
    configured: boolean;
    detail: string;
  }>("/admin/error_tracker_configure/", {
    password,
    confirm_password,
  });
  saveErrorTrackerToken(out.token);
  return out;
}

export async function fetchErrorLogs(params: {
  limit?: number;
  offset?: number;
  resolved?: "true" | "false" | "";
  source?: string;
  search?: string;
}): Promise<ErrorLogsResponse> {
  const q = new URLSearchParams();
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.offset != null) q.set("offset", String(params.offset));
  if (params.resolved) q.set("resolved", params.resolved);
  if (params.source) q.set("source", params.source);
  if (params.search) q.set("search", params.search);
  const qs = q.toString();
  const path = qs ? `/admin/error_logs/?${qs}` : "/admin/error_logs/";
  return apiGetAuth<ErrorLogsResponse>(path, { headers: trackerHeaders() });
}

export async function fetchErrorLogDetail(id: number): Promise<SystemErrorLogDetail> {
  return apiGetAuth<SystemErrorLogDetail>(`/admin/error_log_detail/?id=${id}`, {
    headers: trackerHeaders(),
  });
}

export async function resolveErrorLog(
  id: number,
  resolution_notes: string,
): Promise<SystemErrorLogDetail> {
  return apiPatch<SystemErrorLogDetail>(
    "/admin/error_log_resolve/",
    { id, resolution_notes },
    { headers: trackerHeaders() },
  );
}

export async function reopenErrorLog(id: number): Promise<SystemErrorLogDetail> {
  return apiPatch<SystemErrorLogDetail>(
    "/admin/error_log_resolve/",
    { id, reopen: true },
    { headers: trackerHeaders() },
  );
}
