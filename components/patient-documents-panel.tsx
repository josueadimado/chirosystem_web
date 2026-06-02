"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiDelete, apiFetchBlobAuth, apiGetAuth, apiUploadAuth } from "@/lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────

type PatientDoc = {
  id: number;
  label: string;
  doc_type: string;
  doc_type_display: string;
  original_filename: string;
  /** Preferred: authenticated API path under /api/v1 (e.g. /admin/patient_document_file/?doc_id=1). */
  file_path: string | null;
  /** Legacy direct media URL — do not use for preview/download in the browser. */
  file_url?: string | null;
  uploaded_by: string | null;
  created_at: string;
};

const DOC_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "insurance_card", label: "Insurance Card" },
  { value: "x_ray", label: "X-Ray / Imaging" },
  { value: "lab_result", label: "Lab Result" },
  { value: "referral", label: "Referral Letter" },
  { value: "intake_form", label: "Intake Form" },
  { value: "other", label: "Other" },
];

const MAX_FILE_MB = 20;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isImageFile(filename: string): boolean {
  return /\.(jpe?g|png|gif|webp|bmp|svg|heic|heif)$/i.test(filename);
}

function isPdfFile(filename: string): boolean {
  return /\.pdf$/i.test(filename);
}

function docFilePath(basePath: string, docId: number, download = false): string {
  const q = new URLSearchParams({ doc_id: String(docId) });
  if (download) q.set("download", "1");
  return `${basePath}/patient_document_file/?${q.toString()}`;
}

function patientDocHasFile(doc: PatientDoc): boolean {
  return Boolean(doc.file_path || doc.file_url);
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

// ─── Preview Modal ────────────────────────────────────────────────────────────

function PreviewModal({
  doc,
  basePath,
  onClose,
  onDownload,
}: {
  doc: PatientDoc;
  basePath: string;
  onClose: () => void;
  onDownload: () => void;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    if (!patientDocHasFile(doc)) {
      setLoadError("File is not available.");
      setLoading(false);
      return;
    }
    const path = doc.file_path ?? docFilePath(basePath, doc.id);
    setLoading(true);
    setLoadError("");
    void apiFetchBlobAuth(path)
      .then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        revoked = url;
        setBlobUrl(url);
      })
      .catch((e) => {
        if (!cancelled) {
          setLoadError(e instanceof ApiError ? e.message : "Could not load file for preview.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [doc.id, doc.file_path, basePath]);

  const isImage = isImageFile(doc.original_filename);
  const isPdf = isPdfFile(doc.original_filename);

  return (
    <div
      className="fixed inset-0 z-[600] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{doc.label}</p>
            <p className="truncate text-xs text-slate-500">{doc.original_filename}</p>
          </div>
          <div className="ml-4 flex shrink-0 items-center gap-2">
            {patientDocHasFile(doc) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDownload();
                }}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Download
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              aria-label="Close preview"
            >
              <span className="block text-2xl leading-none">×</span>
            </button>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center overflow-auto bg-slate-50 p-4">
          {loading ? (
            <p className="text-sm text-slate-500">Loading preview…</p>
          ) : loadError ? (
            <p className="text-sm text-rose-700">{loadError}</p>
          ) : !blobUrl ? (
            <p className="text-sm text-slate-500">File not available.</p>
          ) : isImage ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={blobUrl}
              alt={doc.label}
              className="max-h-[75vh] max-w-full rounded-lg object-contain shadow-md"
            />
          ) : isPdf ? (
            <iframe
              src={blobUrl}
              title={doc.label}
              className="h-[72vh] w-full rounded-lg border border-slate-200 bg-white"
            />
          ) : (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <span className="text-5xl">📄</span>
              <p className="text-sm text-slate-600">Preview not available for this file type.</p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDownload();
                }}
                className="rounded-xl bg-[#0d5c2e] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0a4d26]"
              >
                Download file
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function PatientDocumentsPanel({
  patientId,
  /** "/admin/patient_documents" or "/doctor/patient_documents" */
  basePath,
}: {
  patientId: number;
  basePath: string;
}) {
  const [docs, setDocs] = useState<PatientDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [uploadLabel, setUploadLabel] = useState("");
  const [uploadDocType, setUploadDocType] = useState("other");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");

  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState("");

  const [previewDoc, setPreviewDoc] = useState<PatientDoc | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadDocument = async (doc: PatientDoc) => {
    if (!patientDocHasFile(doc)) return;
    setDownloadingId(doc.id);
    setDownloadError("");
    try {
      const path = doc.file_path ?? docFilePath(basePath, doc.id, true);
      const blob = await apiFetchBlobAuth(path);
      triggerBlobDownload(blob, doc.original_filename || "document");
    } catch (e) {
      setDownloadError(e instanceof ApiError ? e.message : "Could not download file.");
    } finally {
      setDownloadingId(null);
    }
  };

  const loadDocs = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const data = await apiGetAuth<PatientDoc[]>(
        `${basePath}/patient_documents/?patient_id=${patientId}`,
      );
      setDocs(data ?? []);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : "Could not load documents.");
    } finally {
      setLoading(false);
    }
  }, [patientId, basePath]);

  useEffect(() => {
    void loadDocs();
  }, [loadDocs]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setUploadFile(file);
    setUploadError("");
    setUploadSuccess("");
    if (file && !uploadLabel) {
      // Pre-fill label from filename (strip extension)
      setUploadLabel(file.name.replace(/\.[^.]+$/, ""));
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) {
      setUploadError("Please choose a file.");
      return;
    }
    if (uploadFile.size > MAX_FILE_MB * 1024 * 1024) {
      setUploadError(`File must be under ${MAX_FILE_MB} MB.`);
      return;
    }
    const label = uploadLabel.trim() || uploadFile.name;
    setUploading(true);
    setUploadError("");
    setUploadSuccess("");
    try {
      const form = new FormData();
      form.append("patient_id", String(patientId));
      form.append("file", uploadFile);
      form.append("label", label);
      form.append("doc_type", uploadDocType);
      await apiUploadAuth<PatientDoc>(`${basePath}/patient_document_upload/`, form);
      setUploadFile(null);
      setUploadLabel("");
      setUploadDocType("other");
      setUploadSuccess("Document uploaded successfully.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadDocs();
    } catch (e) {
      setUploadError(e instanceof ApiError ? e.message : "Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (doc: PatientDoc) => {
    if (
      !window.confirm(
        `Delete "${doc.label}"?\n\nThis permanently removes the file and cannot be undone.`,
      )
    )
      return;
    setDeletingId(doc.id);
    setDeleteError("");
    try {
      await apiDelete(`${basePath}/patient_document_delete/?doc_id=${doc.id}`);
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (e) {
      setDeleteError(e instanceof ApiError ? e.message : "Could not delete document.");
    } finally {
      setDeletingId(null);
    }
  };

  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm transition focus:border-[#16a349]/40 focus:outline-none focus:ring-2 focus:ring-[#16a349]/15";

  return (
    <div className="animate-fade-in space-y-6">
      {/* ── Upload Section ─────────────────────────────────── */}
      <div className="rounded-2xl border border-[#16a349]/25 bg-[#f0fdf4]/60 p-4 sm:p-5">
        <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-[#0d5c2e]">
          Upload a document
        </h3>
        <div className="space-y-3">
          {/* File picker */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              File <span className="font-normal text-slate-400">(images, PDF — max {MAX_FILE_MB} MB)</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
              onChange={handleFileChange}
              className="block w-full cursor-pointer rounded-xl border border-slate-200 bg-white text-sm text-slate-700 file:mr-3 file:cursor-pointer file:rounded-l-xl file:border-0 file:bg-[#0d5c2e] file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-white hover:file:bg-[#0a4d26]"
            />
          </div>

          {/* Label */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Document label <span className="font-normal text-slate-400">(short name)</span>
            </label>
            <input
              type="text"
              value={uploadLabel}
              onChange={(e) => setUploadLabel(e.target.value)}
              placeholder="e.g. Blue Cross card front"
              className={inputClass}
              maxLength={200}
            />
          </div>

          {/* Doc type */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Document type</label>
            <select
              value={uploadDocType}
              onChange={(e) => setUploadDocType(e.target.value)}
              className={inputClass}
            >
              {DOC_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Upload button */}
          <button
            type="button"
            onClick={() => void handleUpload()}
            disabled={uploading || !uploadFile}
            className="h-auto rounded-xl bg-[#0d5c2e] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0a4d26] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Upload document"}
          </button>

          {uploadError && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {uploadError}
            </p>
          )}
          {uploadSuccess && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {uploadSuccess}
            </p>
          )}
        </div>
      </div>

      {/* ── Document List ───────────────────────────────────── */}
      <div>
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
          Attached documents {docs.length > 0 && `(${docs.length})`}
        </h3>

        {loadError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {loadError}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-[#0d5c2e]" />
            Loading documents…
          </div>
        ) : docs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
            <p className="text-2xl">📂</p>
            <p className="mt-2 text-sm font-medium text-slate-600">No documents yet</p>
            <p className="mt-1 text-xs text-slate-400">
              Upload insurance cards, X-rays, referrals, or any other files above.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {deleteError && (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                {deleteError}
              </p>
            )}
            {downloadError && (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                {downloadError}
              </p>
            )}
            {docs.map((doc) => {
              const isImg = isImageFile(doc.original_filename);
              const isPdf = isPdfFile(doc.original_filename);
              const canPreview = isImg || isPdf;
              return (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 rounded-xl border border-border/80 bg-white px-4 py-3 shadow-sm"
                >
                  {/* Icon */}
                  <span className="shrink-0 text-2xl" aria-hidden>
                    {isImg ? "🖼️" : isPdf ? "📄" : "📎"}
                  </span>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{doc.label}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {doc.doc_type_display}
                      {" · "}
                      {doc.original_filename}
                      {doc.uploaded_by ? ` · ${doc.uploaded_by}` : ""}
                      {" · "}
                      {formatDate(doc.created_at)}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 items-center gap-2">
                    {canPreview && patientDocHasFile(doc) && (
                      <button
                        type="button"
                        onClick={() => setPreviewDoc(doc)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-[#16a349]/40 hover:bg-[#f0fdf4] hover:text-[#0d5c2e]"
                      >
                        Preview
                      </button>
                    )}
                    {patientDocHasFile(doc) && (
                      <button
                        type="button"
                        onClick={() => void downloadDocument(doc)}
                        disabled={downloadingId === doc.id}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                      >
                        {downloadingId === doc.id ? "Downloading…" : "Download"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleDelete(doc)}
                      disabled={deletingId === doc.id}
                      className="rounded-lg border border-rose-100 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-50 disabled:opacity-50"
                    >
                      {deletingId === doc.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewDoc && (
        <PreviewModal
          doc={previewDoc}
          basePath={basePath}
          onClose={() => setPreviewDoc(null)}
          onDownload={() => void downloadDocument(previewDoc)}
        />
      )}
    </div>
  );
}
