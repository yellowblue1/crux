// Status badge Lit component

import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { escapeHtml, parseEventType } from "../utils";

@customElement("status-badge")
export class StatusBadge extends LitElement {
  @property() eventType = "";

  // Use light DOM for Tailwind CSS compatibility
  protected createRenderRoot() {
    return this;
  }

  render() {
    const { baseType, subType, cssClass } = parseEventType(this.eventType);

    if (subType) {
      return html`
        <span class="status-badge-wrapper">
          <span class="status-badge ${cssClass}">${escapeHtml(baseType)}</span>
          <span class="status-badge-subtype">${escapeHtml(subType)}</span>
        </span>
      `;
    }

    return html`
      <span class="status-badge ${cssClass}">${escapeHtml(baseType)}</span>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "status-badge": StatusBadge;
  }
}
