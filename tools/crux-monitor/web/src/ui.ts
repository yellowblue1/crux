// UI helper functions

import type { ConnectionStatus } from "./types";

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
 * Copy text to clipboard and show a toast notification
 */
export async function copyToClipboard(text: string, label = "text"): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    showToast(`Copied ${label} to clipboard!`);
  } catch {
    showToast(`Failed to copy ${label}`, "error");
  }
}

/**
 * Show the warning banner with a message
 */
export function showWarningBanner(message: string): void {
  const banner = document.getElementById("warning-banner");
  const messageEl = document.getElementById("warning-message");

  if (!banner || !messageEl) return;

  messageEl.innerHTML = message;
  banner.classList.remove("hidden");
}
