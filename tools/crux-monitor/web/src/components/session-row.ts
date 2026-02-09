// Session row Lit component

import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import { setReadStatus } from "../storage";
import type { SessionResponse } from "../types";
import { copyToClipboard } from "../ui";
import { escapeHtml } from "../utils";
import "./status-badge";

const ICON_CLIPBOARD = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
  <path d="M4 1.5H3a2 2 0 00-2 2V13a2 2 0 002 2h10a2 2 0 002-2V3.5a2 2 0 00-2-2h-1v1h1a1 1 0 011 1V13a1 1 0 01-1 1H3a1 1 0 01-1-1V3.5a1 1 0 011-1h1v-1z"/>
  <path d="M9.5 1a.5.5 0 01.5.5v1a.5.5 0 01-.5.5h-3a.5.5 0 01-.5-.5v-1a.5.5 0 01.5-.5h3zm-3-1A1.5 1.5 0 005 1.5v1A1.5 1.5 0 006.5 4h3A1.5 1.5 0 0011 2.5v-1A1.5 1.5 0 009.5 0h-3z"/>
</svg>`;

const ICON_CLIPBOARD_CHECK = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
  <path fill-rule="evenodd" d="M10.854 7.146a.5.5 0 010 .708l-3 3a.5.5 0 01-.708 0l-1.5-1.5a.5.5 0 11.708-.708L7.5 9.793l2.646-2.647a.5.5 0 01.708 0z"/>
  <path d="M4 1.5H3a2 2 0 00-2 2V13a2 2 0 002 2h10a2 2 0 002-2V3.5a2 2 0 00-2-2h-1v1h1a1 1 0 011 1V13a1 1 0 01-1 1H3a1 1 0 01-1-1V3.5a1 1 0 011-1h1v-1z"/>
  <path d="M9.5 1a.5.5 0 01.5.5v1a.5.5 0 01-.5.5h-3a.5.5 0 01-.5-.5v-1a.5.5 0 01.5-.5h3zm-3-1A1.5 1.5 0 005 1.5v1A1.5 1.5 0 006.5 4h3A1.5 1.5 0 0011 2.5v-1A1.5 1.5 0 009.5 0h-3z"/>
</svg>`;

@customElement("session-row")
export class SessionRow extends LitElement {
  @property({ type: Object }) session!: SessionResponse;
  @property({ type: Boolean }) isRead = false;
  @property({ type: Boolean }) showTmuxTarget = false;

  // Use light DOM for Tailwind CSS compatibility
  protected createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.style.display = "contents";
  }

  private get tmuxCommand(): string {
    return `tmux switch-client -t ${this.session.pane_id}`;
  }

  private async handleCopy() {
    await copyToClipboard(this.tmuxCommand, "tmux command");

    if (!this.isRead) {
      this.isRead = true;
      await setReadStatus(this.session.pane_id, true);
      this.requestUpdate();
    }
  }

  private renderCopyButton() {
    const icon = this.isRead ? ICON_CLIPBOARD_CHECK : ICON_CLIPBOARD;
    return html`
      <button
        class="copy-btn ${this.isRead ? "copied" : ""}"
        title="${escapeHtml(this.tmuxCommand)}"
        @click="${this.handleCopy}"
        .innerHTML="${icon}"
      ></button>
    `;
  }

  render() {
    const s = this.session;
    const statusClass = s.status === "busy" ? "row-busy" : "row-waiting";
    const rowClass = `${statusClass} ${this.isRead ? "read" : ""}`.trim();

    return html`
      <tr class="${rowClass}">
        <td class="col-project">
          <span class="project-name">${escapeHtml(s.project_name)}</span>
          ${when(
            this.showTmuxTarget,
            () => html`<span class="tmux-target">${escapeHtml(s.tmux_target)}</span>`,
          )}
        </td>
        <td class="col-branch">
          ${when(
            s.git_branch,
            () => html`<span class="git-branch">${escapeHtml(s.git_branch ?? "")}</span>`,
            () => html`<span class="no-branch">-</span>`,
          )}
        </td>
        <td class="col-status">
          <status-badge .status="${s.status}"></status-badge>
        </td>
        <td class="col-summary">
          ${when(
            s.summary,
            () => html`
              <span class="summary" title="${escapeHtml(s.summary ?? "")}">
                <span class="ai-indicator" title="AI-generated summary">✨</span>
                ${escapeHtml(s.summary ?? "")}
              </span>
            `,
            () => html`<span class="summary-placeholder">-</span>`,
          )}
        </td>
        <td class="col-tmux">${this.renderCopyButton()}</td>
      </tr>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "session-row": SessionRow;
  }
}
