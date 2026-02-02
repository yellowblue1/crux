// Main application entry point
// Handles initialization and orchestration

import "./styles/input.css";
import "./components"; // Register Lit components
import { getPrunePreview, performPrune } from "./api";
import type { EventRow } from "./components/event-row";
import { requestNotificationPermission, showBrowserNotification } from "./notifications";
import { connectSSE, getCurrentMode, setCurrentMode, setOnEventsCallback } from "./sse";
import { getReadStatus, initDb } from "./storage";
import type { EventResponse, FilterMode, PrunePreviewResponse } from "./types";
import { hideElement, showElement, showToast } from "./ui";
import { escapeHtml } from "./utils";

/**
 * Render events using Lit components
 */
async function renderEvents(events: EventResponse[]): Promise<void> {
  const table = document.getElementById("events-table");
  const emptyState = document.getElementById("empty-state");
  const tbody = document.getElementById("events-body");

  if (!table || !emptyState || !tbody) return;

  if (events.length === 0) {
    hideElement(table);
    showElement(emptyState);
    return;
  }

  showElement(table);
  hideElement(emptyState);

  // Clear existing rows
  tbody.innerHTML = "";

  // Create event-row elements for each event
  for (const event of events) {
    const isRead = await getReadStatus(event.event_id);
    const eventRow = document.createElement("event-row") as EventRow;
    eventRow.event = event;
    eventRow.isRead = isRead;
    tbody.appendChild(eventRow);
  }
}

// Filter mode state management

function initModeFromUrl(): void {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");
  if (mode === "active" || mode === "all") {
    setCurrentMode(mode);
  } else {
    setCurrentMode("waiting");
  }
  updateToggleUI(getCurrentMode());
}

function updateUrlWithMode(mode: FilterMode): void {
  const url = new URL(window.location.href);
  if (mode === "waiting") {
    url.searchParams.delete("mode");
  } else {
    url.searchParams.set("mode", mode);
  }
  window.history.replaceState({}, "", url);
}

function updateToggleUI(mode: FilterMode): void {
  const waitingBtn = document.getElementById("mode-waiting");
  const activeBtn = document.getElementById("mode-active");
  const allBtn = document.getElementById("mode-all");
  if (!waitingBtn || !activeBtn || !allBtn) return;

  waitingBtn.classList.remove("active");
  activeBtn.classList.remove("active");
  allBtn.classList.remove("active");

  if (mode === "waiting") {
    waitingBtn.classList.add("active");
  } else if (mode === "active") {
    activeBtn.classList.add("active");
  } else {
    allBtn.classList.add("active");
  }
}

function setFilterMode(mode: FilterMode): void {
  if (getCurrentMode() === mode) return;
  setCurrentMode(mode);
  updateUrlWithMode(mode);
  updateToggleUI(mode);
  connectSSE(); // Reconnect SSE with new mode
}

// Prune modal

function showPruneModal(preview: PrunePreviewResponse): void {
  const modal = document.getElementById("prune-modal");
  const countEl = document.getElementById("prune-count");
  const listEl = document.getElementById("prune-list");

  if (!modal || !countEl || !listEl) return;

  if (preview.count === 0) {
    showToast("No dead sessions to prune");
    return;
  }

  countEl.textContent = `${preview.count} session${preview.count !== 1 ? "s" : ""} will be deleted.`;
  listEl.innerHTML = preview.sessions
    .map(
      (s: { project_name: string | null; session_id: string }) =>
        `<li>${escapeHtml(s.project_name || "unknown")} <span class="session-id">(${escapeHtml(s.session_id.substring(0, 8))})</span></li>`,
    )
    .join("");

  showElement(modal);
}

function hidePruneModal(): void {
  hideElement(document.getElementById("prune-modal"));
}

// Initialize application

async function init(): Promise<void> {
  // Request notification permission early
  requestNotificationPermission();

  // Initialize IndexedDB
  await initDb();

  // Initialize filter mode from URL
  initModeFromUrl();

  // Set up SSE events callback
  setOnEventsCallback((data) => {
    for (const event of data.events) {
      showBrowserNotification(event);
    }
    renderEvents(data.events);
  });

  // Set up filter toggle handlers
  const modeWaiting = document.getElementById("mode-waiting");
  const modeActive = document.getElementById("mode-active");
  const modeAll = document.getElementById("mode-all");

  if (modeWaiting) {
    modeWaiting.addEventListener("click", () => {
      setFilterMode("waiting");
    });
  }

  if (modeActive) {
    modeActive.addEventListener("click", () => {
      setFilterMode("active");
    });
  }

  if (modeAll) {
    modeAll.addEventListener("click", () => {
      setFilterMode("all");
    });
  }

  // Set up prune handlers
  const pruneBtn = document.getElementById("prune-btn");
  const pruneCancel = document.getElementById("prune-cancel");
  const pruneConfirm = document.getElementById("prune-confirm");
  const pruneModal = document.getElementById("prune-modal");

  if (pruneBtn) {
    pruneBtn.addEventListener("click", async () => {
      const preview = await getPrunePreview();
      showPruneModal(preview);
    });
  }

  if (pruneCancel) {
    pruneCancel.addEventListener("click", () => {
      hidePruneModal();
    });
  }

  if (pruneConfirm) {
    pruneConfirm.addEventListener("click", async () => {
      hidePruneModal();
      const result = await performPrune();
      if (result.deleted_count > 0) {
        showToast(
          `Deleted ${result.deleted_count} session${result.deleted_count !== 1 ? "s" : ""}`,
        );
      } else {
        showToast("No sessions were deleted", "error");
      }
    });
  }

  // Close modal when clicking outside
  if (pruneModal) {
    pruneModal.addEventListener("click", (e) => {
      if (e.target === pruneModal) {
        hidePruneModal();
      }
    });
  }

  // Start SSE connection
  connectSSE();
}

init();
