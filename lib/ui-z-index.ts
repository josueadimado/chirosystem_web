/**
 * Shared stacking order for portaled UI (modals, confirms, toasts).
 * Page modals (desk book, add patient) use Z_PAGE_MODAL; Dialog/confirm uses Z_DIALOG_STACK above them;
 * feedback busy + toasts sit on top so success/error messages are never hidden behind a modal.
 */
export const Z_SHEET = 200;
export const Z_PAGE_MODAL = 400;
export const Z_DIALOG_STACK = 450;
export const Z_FEEDBACK_BUSY = 500;
export const Z_FEEDBACK_TOAST = 510;
