"use client";

import { AdminPageIntro, AdminSectionLabel } from "@/components/admin-shell";
import { HelpTip } from "@/components/help-tip";
import { Loader } from "@/components/loader";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { getRoleCookie } from "@/lib/auth";
import {
  clearErrorTrackerToken,
  configureErrorTracker,
  fetchErrorLogDetail,
  fetchErrorLogs,
  fetchErrorTrackerStatus,
  reopenErrorLog,
  resolveErrorLog,
  unlockErrorTracker,
  type SystemErrorLogDetail,
  type SystemErrorLogRow,
} from "@/lib/error-tracker";
import { formatInstantMonthDayYearTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

const PAGE_SIZE = 20;

function levelClass(level: string): string {
  if (level === "critical") return "bg-rose-100 text-rose-900 ring-rose-200";
  if (level === "warning") return "bg-amber-100 text-amber-900 ring-amber-200";
  return "bg-red-50 text-red-900 ring-red-200";
}

function sourceLabel(source: string): string {
  if (source === "api") return "API";
  if (source === "middleware") return "Server";
  if (source === "celery") return "Background job";
  if (source === "client") return "Browser";
  return source;
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  return formatInstantMonthDayYearTime(iso);
}

export default function AdminErrorsPage() {
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState("");
  const [configured, setConfigured] = useState(false);
  const [usesEnvPassword, setUsesEnvPassword] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [setupError, setSetupError] = useState("");
  const [settingUp, setSettingUp] = useState(false);
  const [unlockError, setUnlockError] = useState("");
  const [unlocking, setUnlocking] = useState(false);

  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [rows, setRows] = useState<SystemErrorLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [openCount, setOpenCount] = useState(0);
  const [page, setPage] = useState(0);
  const [filterResolved, setFilterResolved] = useState<"" | "true" | "false">("false");
  const [filterSource, setFilterSource] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const [detail, setDetail] = useState<SystemErrorLogDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [resolveNotes, setResolveNotes] = useState("");
  const [savingResolve, setSavingResolve] = useState(false);

  useEffect(() => {
    setIsOwner(getRoleCookie() === "owner_admin");
  }, []);

  const applyStatus = useCallback((status: Awaited<ReturnType<typeof fetchErrorTrackerStatus>>) => {
    const source = status.password_source ?? (status.configured ? "database" : "none");
    setConfigured(Boolean(status.configured));
    setUsesEnvPassword(source === "env");
    setUnlocked(Boolean(status.unlocked));
    if (!status.unlocked) {
      clearErrorTrackerToken();
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    const status = await fetchErrorTrackerStatus();
    applyStatus(status);
    return status;
  }, [applyStatus]);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setListError("");
    try {
      const out = await fetchErrorLogs({
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        resolved: filterResolved,
        source: filterSource,
        search: search.trim(),
      });
      setRows(out.results);
      setTotal(out.total);
      setOpenCount(out.open_count);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 403) {
          setUnlocked(false);
          clearErrorTrackerToken();
          setListError("Session expired. Enter the password again.");
        } else {
          setListError(e.message);
        }
      } else {
        setListError("Could not load errors.");
      }
    } finally {
      setLoading(false);
    }
  }, [filterResolved, filterSource, page, search]);

  useEffect(() => {
    if (isOwner !== true) return;
    setStatusLoading(true);
    setStatusError("");
    void refreshStatus()
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) {
          setIsOwner(false);
          return;
        }
        const message =
          e instanceof ApiError
            ? e.message
            : "Could not reach the error tracker on the API. Redeploy the API and run migrations.";
        setStatusError(message);
      })
      .finally(() => setStatusLoading(false));
  }, [isOwner, refreshStatus]);

  useEffect(() => {
    if (!unlocked) return;
    void loadLogs();
  }, [unlocked, loadLogs]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const summaryText = useMemo(() => {
    if (!unlocked) return "";
    return `${openCount} open · ${total} matching`;
  }, [openCount, total, unlocked]);

  const handleConfigure = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingUp(true);
    setSetupError("");
    try {
      await configureErrorTracker(password, confirmPassword);
      setPassword("");
      setConfirmPassword("");
      const status = await refreshStatus();
      applyStatus(status);
    } catch (err) {
      if (err instanceof ApiError) {
        const envMsg =
          err.message.includes("ERROR_TRACKER_PASSWORD") ||
          err.message.includes("server environment");
        if (envMsg) {
          setConfigured(true);
          setUsesEnvPassword(true);
          setSetupError("");
          setUnlockError("Use the password you set in the API server environment (ERROR_TRACKER_PASSWORD).");
          setPassword("");
          setConfirmPassword("");
          return;
        }
        setSetupError(err.message);
      } else {
        setSetupError("Could not save password. Make sure the API is updated and migrations have run.");
      }
    } finally {
      setSettingUp(false);
    }
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnlocking(true);
    setUnlockError("");
    try {
      await unlockErrorTracker(password);
      setPassword("");
      const status = await refreshStatus();
      applyStatus(status);
      if (!status.unlocked) {
        clearErrorTrackerToken();
        setUnlockError(
          "Password was accepted but the session could not start. Redeploy the API with the error tracker update, then try again.",
        );
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setUnlockError(err.message);
      } else {
        setUnlockError("Could not verify password.");
      }
    } finally {
      setUnlocking(false);
    }
  };

  const openDetail = async (row: SystemErrorLogRow) => {
    setDetailLoading(true);
    setDetail(null);
    setResolveNotes("");
    try {
      const full = await fetchErrorLogDetail(row.id);
      setDetail(full);
      setResolveNotes(full.resolution_notes || "");
    } catch (e) {
      if (e instanceof ApiError) setListError(e.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleResolve = async () => {
    if (!detail) return;
    setSavingResolve(true);
    try {
      const updated = await resolveErrorLog(detail.id, resolveNotes.trim());
      setDetail(updated);
      await loadLogs();
    } catch (e) {
      if (e instanceof ApiError) setListError(e.message);
    } finally {
      setSavingResolve(false);
    }
  };

  const handleReopen = async () => {
    if (!detail) return;
    setSavingResolve(true);
    try {
      const updated = await reopenErrorLog(detail.id);
      setDetail(updated);
      setResolveNotes("");
      await loadLogs();
    } catch (e) {
      if (e instanceof ApiError) setListError(e.message);
    } finally {
      setSavingResolve(false);
    }
  };

  const handleLock = () => {
    clearErrorTrackerToken();
    setUnlocked(false);
    setDetail(null);
    setRows([]);
  };

  if (isOwner === null || statusLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6">
        <AdminPageIntro
          title="Error tracker"
          description="Only the clinic owner can view system error logs."
        />
        <p className="text-sm text-slate-600">
          You are signed in as staff or doctor. Ask the owner if you need access to bug reports.
        </p>
        <Link href="/admin/dashboard" className={buttonVariants({ variant: "outline" })}>
          Back to dashboard
        </Link>
      </div>
    );
  }

  const needsSetup = !configured && !usesEnvPassword;
  const showUnlockGate = !unlocked && (configured || usesEnvPassword || Boolean(statusError));

  if (!unlocked && (showUnlockGate || needsSetup)) {
    return (
      <div className="mx-auto max-w-md space-y-6">
        <AdminPageIntro
          title="Error tracker"
          description={
            usesEnvPassword
              ? "Enter the password from your API server environment (ERROR_TRACKER_PASSWORD)."
              : configured
                ? "Enter your error tracker password to view bug reports."
                : "Set up or unlock the error tracker. This is separate from your login password."
          }
        />

        {statusError ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-medium">Could not verify setup with the API</p>
            <p className="mt-1">{statusError}</p>
            <p className="mt-2">
              If you already set <code>ERROR_TRACKER_PASSWORD</code> on the <strong>API</strong> server, try unlocking
              below with that password.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                setStatusLoading(true);
                setStatusError("");
                void refreshStatus()
                  .catch((e) => {
                    setStatusError(e instanceof ApiError ? e.message : "Still could not reach the API.");
                  })
                  .finally(() => setStatusLoading(false));
              }}
            >
              Retry connection
            </Button>
          </div>
        ) : null}

        {showUnlockGate ? (
          <form
            onSubmit={handleUnlock}
            className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="space-y-2">
              <Label htmlFor="error-tracker-password">Error tracker password</Label>
              <Input
                id="error-tracker-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={usesEnvPassword ? "API ERROR_TRACKER_PASSWORD value" : "Your error tracker password"}
                required
              />
              <p className="text-xs text-slate-500">
                {usesEnvPassword
                  ? "Use the exact value of ERROR_TRACKER_PASSWORD on your API server (not the booking website)."
                  : "Staff and doctors cannot open this page even if they know your login password."}
              </p>
            </div>
            {unlockError ? <p className="text-sm text-red-600">{unlockError}</p> : null}
            <Button type="submit" disabled={unlocking || !password.trim()}>
              {unlocking ? "Checking…" : "Unlock error tracker"}
            </Button>
          </form>
        ) : null}

        {needsSetup ? (
          <>
            {showUnlockGate ? (
              <p className="text-center text-xs font-medium uppercase tracking-wide text-slate-400">or create a new password</p>
            ) : null}
            <form
              onSubmit={handleConfigure}
              className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="space-y-2">
                <Label htmlFor="setup-password">Create error tracker password</Label>
                <Input
                  id="setup-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required={!showUnlockGate}
                  minLength={8}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="setup-confirm">Confirm password</Label>
                <Input
                  id="setup-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required={!showUnlockGate}
                  minLength={8}
                />
              </div>
              {setupError ? <p className="text-sm text-red-600">{setupError}</p> : null}
              <Button type="submit" disabled={settingUp || password.length < 8 || !confirmPassword}>
                {settingUp ? "Saving…" : "Save password and open error tracker"}
              </Button>
            </form>
            {!showUnlockGate ? (
              <p className="text-xs text-slate-500">
                Or set <code>ERROR_TRACKER_PASSWORD</code> on the <strong>API</strong> server and use that password
                above after redeploying the API.
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <AdminPageIntro
          title="Error tracker"
          description="Server errors captured automatically with stack traces and request details (sensitive data redacted)."
        />
        <Button type="button" variant="outline" size="sm" onClick={handleLock}>
          Lock page
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Open errors</p>
          <p className="mt-1 text-2xl font-bold text-red-700">{openCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">How it works</p>
          <p className="mt-1 text-sm text-slate-600">
            When the API crashes or returns a 500 error, a row is saved here with the full technical details.
            Mark items resolved when fixed so you can focus on what is still broken.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs text-slate-500">Status</Label>
          <select
            className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            value={filterResolved}
            onChange={(e) => {
              setPage(0);
              setFilterResolved(e.target.value as "" | "true" | "false");
            }}
          >
            <option value="false">Open only</option>
            <option value="true">Resolved only</option>
            <option value="">All</option>
          </select>
        </div>
        <div>
          <Label className="text-xs text-slate-500">Source</Label>
          <select
            className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            value={filterSource}
            onChange={(e) => {
              setPage(0);
              setFilterSource(e.target.value);
            }}
          >
            <option value="">All sources</option>
            <option value="api">API</option>
            <option value="middleware">Server</option>
            <option value="celery">Background job</option>
          </select>
        </div>
        <div className="min-w-[200px] flex-1">
          <Label className="text-xs text-slate-500">Search message or path</Label>
          <form
            className="mt-1 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setPage(0);
              setSearch(searchInput);
            }}
          >
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="e.g. checkin, book-from-desk"
            />
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>
        </div>
        <Button type="button" variant="outline" onClick={() => void loadLogs()} disabled={loading}>
          Refresh
        </Button>
      </div>

      <AdminSectionLabel>{summaryText || "Error log"}</AdminSectionLabel>

      {listError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{listError}</p>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader />
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600">
          No errors match this filter. That is good news — or try &quot;All&quot; to see history.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Level</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Message</th>
                <th className="px-4 py-3">Path</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-b border-slate-50 hover:bg-slate-50/80"
                  onClick={() => void openDetail(row)}
                >
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatWhen(row.created_at)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1",
                        levelClass(row.level),
                      )}
                    >
                      {row.level}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{sourceLabel(row.source)}</td>
                  <td className="max-w-xs truncate px-4 py-3 font-medium text-slate-900" title={row.message}>
                    {row.exception_type ? `${row.exception_type}: ` : ""}
                    {row.message}
                  </td>
                  <td className="max-w-[10rem] truncate px-4 py-3 font-mono text-xs text-slate-600" title={row.path}>
                    {row.http_method} {row.path}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.user_display || "—"}</td>
                  <td className="px-4 py-3">
                    {row.resolved_at ? (
                      <span className="text-emerald-700">Resolved</span>
                    ) : (
                      <span className="text-red-700">Open</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > PAGE_SIZE ? (
        <div className="flex items-center justify-between gap-4 text-sm">
          <span className="text-slate-600">
            Page {page + 1} of {pageCount}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page + 1 >= pageCount}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog open={detail !== null || detailLoading} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Error details</DialogTitle>
            <DialogDescription>
              Full technical record for debugging. Patient passwords and card numbers are redacted automatically.
            </DialogDescription>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex justify-center py-10">
              <Loader />
            </div>
          ) : detail ? (
            <div className="space-y-4 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">When</p>
                  <p>{formatWhen(detail.created_at)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">HTTP</p>
                  <p className="font-mono text-xs">
                    {detail.status_code ?? "—"} · {detail.http_method} {detail.path}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">User</p>
                  <p>
                    {detail.user_display || "—"}
                    {detail.user_role ? ` (${detail.user_role})` : ""}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">Fingerprint</p>
                  <p className="break-all font-mono text-xs text-slate-600">{detail.fingerprint || "—"}</p>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">Message</p>
                <p className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-mono text-xs">
                  {detail.exception_type ? `${detail.exception_type}: ` : ""}
                  {detail.message}
                </p>
              </div>

              {detail.query_string ? (
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">Query string</p>
                  <p className="mt-1 break-all font-mono text-xs text-slate-700">{detail.query_string}</p>
                </div>
              ) : null}

              {detail.request_body ? (
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">Request body (sanitized)</p>
                  <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
                    {detail.request_body}
                  </pre>
                </div>
              ) : null}

              {detail.traceback_text ? (
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">Stack trace</p>
                  <pre className="mt-1 max-h-64 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-emerald-100">
                    {detail.traceback_text}
                  </pre>
                </div>
              ) : null}

              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center gap-2">
                  <Label htmlFor="resolve-notes">Resolution notes</Label>
                  <HelpTip label="About resolution notes">
                    Optional note for yourself — e.g. fixed in commit abc, redeployed API.
                  </HelpTip>
                </div>
                <textarea
                  id="resolve-notes"
                  className="mt-2 min-h-[80px] w-full rounded-lg border border-slate-200 p-3 text-sm"
                  value={resolveNotes}
                  onChange={(e) => setResolveNotes(e.target.value)}
                  placeholder="What you did to fix this…"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  {detail.resolved_at ? (
                    <Button type="button" variant="outline" disabled={savingResolve} onClick={() => void handleReopen()}>
                      Reopen
                    </Button>
                  ) : (
                    <Button type="button" disabled={savingResolve} onClick={() => void handleResolve()}>
                      Mark resolved
                    </Button>
                  )}
                </div>
                {detail.resolved_at ? (
                  <p className="mt-2 text-xs text-emerald-700">Resolved {formatWhen(detail.resolved_at)}</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
