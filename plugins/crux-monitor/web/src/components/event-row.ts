// Event row Lit component

import { html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { checkSessionStatus, deleteSessionApi } from "../api";
import { ICON_CLIPBOARD, ICON_CLIPBOARD_CHECK, ICON_TRASH } from "../icons";
import { setReadStatus } from "../storage";
import type { EventResponse } from "../types";
import { copyToClipboard, showConfirmDialog, showToast } from "../ui";
import { escapeHtml, formatTime, isAiSummary } from "../utils";
import "./status-badge";

@customElement("event-row")
export class EventRow extends LitElement {
  @property({ type: Object }) event!: EventResponse;
  @property({ type: Boolean }) isRead = false;

  // Use light DOM for Tailwind CSS compatibility
  protected createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    // Make this element invisible to table layout, so tr can be direct child of tbody
    this.style.display = "contents";
  }

  private async handleCopy() {
    if (!this.event.tmux_command) return;

    await copyToClipboard(this.event.tmux_command, "tmux command");

    if (!this.isRead) {
      this.isRead = true;
      await setReadStatus(this.event.event_id, true);
      this.requestUpdate();
    }
  }

  private async handleDelete() {
    const row = this.querySelector("tr") as HTMLTableRowElement | null;
    if (row) {
      row.style.transition = "opacity 0.3s";
      row.style.opacity = "0.5";
    }

    const status = await checkSessionStatus(this.event.session_id);
    if (status.process_running) {
      const confirmed = await showConfirmDialog({
        title: "Delete Running Session",
        message:
          "Warning: Claude Code session is still running. " +
          "The process will continue running, but all event history will be removed.",
        confirmLabel: "Delete Session",
        cancelLabel: "Cancel",
        destructive: true,
      });
      if (!confirmed) {
        if (row) row.style.opacity = "1";
        return;
      }
    }

    const success = await deleteSessionApi(this.event.session_id);
    if (success) {
      showToast("Session deleted");
    } else {
      showToast("Failed to delete session", "error");
      if (row) row.style.opacity = "1";
    }
  }

  private renderCopyButton() {
    if (!this.event.tmux_command) {
      return html`<span class="no-tmux">-</span>`;
    }

    const icon = this.isRead ? ICON_CLIPBOARD_CHECK : ICON_CLIPBOARD;
    return html`
      <button
        class="copy-btn ${this.isRead ? "copied" : ""}"
        title="${escapeHtml(this.event.tmux_command)}"
        @click="${this.handleCopy}"
        .innerHTML="${icon}"
      ></button>
    `;
  }

  render() {
    const event = this.event;

    return html`
      <tr class="${this.isRead ? "read" : ""}" data-event-id="${event.event_id}">
        <td class="col-project">
          <div class="project-info">
            <span class="project-name">${escapeHtml(event.project_name)}</span>
            ${
              event.git_branch
                ? html`<span class="git-branch">(${escapeHtml(event.git_branch)})</span>`
                : nothing
            }
          </div>
          <div class="session-info">
            ${
              event.tmux_window_id
                ? html`<span class="tmux-id">${escapeHtml(event.tmux_window_id)}</span>`
                : nothing
            }
            <span class="session-id">${escapeHtml(event.session_id.substring(0, 8))}</span>
          </div>
        </td>
        <td class="col-status">
          <status-badge .eventType="${event.event_type}"></status-badge>
        </td>
        <td class="col-time">
          <span class="time">${formatTime(event.created_at)}</span>
        </td>
        <td class="col-summary">
          <div class="summary-wrapper">
            <span class="summary" title="${escapeHtml(event.summary)}">${escapeHtml(event.summary)}</span>
            ${
              isAiSummary(event.summary)
                ? html`<span class="ai-indicator" title="AI-generated summary">✨</span>`
                : nothing
            }
          </div>
        </td>
        <td class="col-copy">${this.renderCopyButton()}</td>
        <td class="col-actions">
          <button
            class="end-session-btn"
            title="End session"
            @click="${this.handleDelete}"
            .innerHTML="${ICON_TRASH}"
          ></button>
        </td>
      </tr>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "event-row": EventRow;
  }
}
