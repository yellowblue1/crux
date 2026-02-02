// UI helper functions

import type { ConfirmDialogOptions, ConnectionStatus } from "./types";

// Constants
export const TOAST_DURATION_MS = 2000;

/**
 * Show an element by removing the hidden class
 */
export function showElement(el: HTMLElement | null): void {
  el?.classList.remove("hidden");
}

/**
 * Hide an element by adding the hidden class
 */
export function hideElement(el: HTMLElement | null): void {
  el?.classList.add("hidden");
}

/**
 * Show a toast notification
 */
export function showToast(message: string, type: "success" | "error" = "success"): void {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.className = `toast ${type}`;

  setTimeout(() => {
    toast.classList.add("hidden");
  }, TOAST_DURATION_MS);
}

/**
 * Show a custom confirmation dialog
 */
export function showConfirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = document.getElementById("confirm-dialog");
    const titleEl = document.getElementById("confirm-dialog-title");
    const messageEl = document.getElementById("confirm-dialog-message");
    const confirmBtn = document.getElementById(
      "confirm-dialog-confirm",
    ) as HTMLButtonElement | null;
    const cancelBtn = document.getElementById("confirm-dialog-cancel") as HTMLButtonElement | null;

    if (!dialog || !titleEl || !messageEl || !confirmBtn || !cancelBtn) {
      resolve(false);
      return;
    }

    // Set content
    titleEl.textContent = options.title;
    messageEl.textContent = options.message;
    confirmBtn.textContent = options.confirmLabel ?? "Confirm";
    cancelBtn.textContent = options.cancelLabel ?? "Cancel";

    // Show dialog
    dialog.classList.remove("hidden");
    confirmBtn.focus();

    // Cleanup function
    const cleanup = () => {
      dialog.classList.add("hidden");
      confirmBtn.removeEventListener("click", handleConfirm);
      cancelBtn.removeEventListener("click", handleCancel);
      dialog.removeEventListener("click", handleBackdropClick);
      document.removeEventListener("keydown", handleKeydown);
    };

    // Event handlers
    const handleConfirm = () => {
      cleanup();
      resolve(true);
    };

    const handleCancel = () => {
      cleanup();
      resolve(false);
    };

    const handleBackdropClick = (e: MouseEvent) => {
      if (e.target === dialog) {
        cleanup();
        resolve(false);
      }
    };

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cleanup();
        resolve(false);
      }
    };

    // Attach listeners
    confirmBtn.addEventListener("click", handleConfirm);
    cancelBtn.addEventListener("click", handleCancel);
    dialog.addEventListener("click", handleBackdropClick);
    document.addEventListener("keydown", handleKeydown);
  });
}

/**
 * Update connection status indicator
 */
export function setConnectionStatus(status: ConnectionStatus): void {
  const indicator = document.getElementById("connection-status");
  const text = document.getElementById("connection-text");

  if (!indicator || !text) return;

  indicator.className = `status-indicator ${status}`;
  switch (status) {
    case "connected":
      text.textContent = "Live";
      break;
    case "polling":
      text.textContent = "Polling";
      break;
    case "disconnected":
      text.textContent = "Disconnected";
      break;
  }
}

/**
 * Copy text to clipboard with toast feedback
 */
export async function copyToClipboard(text: string, label = "text"): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    showToast(`Copied ${label} to clipboard!`);
  } catch {
    showToast(`Failed to copy ${label}`, "error");
  }
}
