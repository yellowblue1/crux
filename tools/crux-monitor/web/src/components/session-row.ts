// Session row Lit component

import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import { jumpToSession } from "../api";
import type { SessionResponse } from "../types";
import { showToast } from "../ui";
import { escapeHtml } from "../utils";
import "./status-badge";

const ICON_JUMP = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
  <path fill-rule="evenodd" d="M8.636 3.5a.5.5 0 00-.5-.5H1.5A1.5 1.5 0 000 4.5v10A1.5 1.5 0 001.5 16h10a1.5 1.5 0 001.5-1.5V7.864a.5.5 0 00-1 0V14.5a.5.5 0 01-.5.5h-10a.5.5 0 01-.5-.5v-10a.5.5 0 01.5-.5h6.636a.5.5 0 00.5-.5z"/>
  <path fill-rule="evenodd" d="M16 .5a.5.5 0 00-.5-.5h-5a.5.5 0 000 1h3.793L6.146 9.146a.5.5 0 10.708.708L15 1.707V5.5a.5.5 0 001 0v-5z"/>
</svg>`;

@customElement("session-row")
export class SessionRow extends LitElement {
  @property({ type: Object }) session!: SessionResponse;

  // Use light DOM for Tailwind CSS compatibility
  protected createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.style.display = "contents";
  }

  private async handleJump() {
    const success = await jumpToSession(this.session.pane_id);
    if (!success) {
      showToast("Failed to switch pane", "error");
    }
  }

  render() {
    const s = this.session;
    const rowClass = s.status === "busy" ? "row-busy" : "row-waiting";

    return html`
      <tr class="${rowClass}">
        <td class="col-project">
          <span class="project-name">${escapeHtml(s.project_name)}</span>
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
        <td class="col-actions">
          <button
            class="jump-btn"
            title="Jump to ${escapeHtml(s.tmux_target)}"
            @click="${this.handleJump}"
            .innerHTML="${ICON_JUMP}"
          ></button>
        </td>
      </tr>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "session-row": SessionRow;
  }
}
