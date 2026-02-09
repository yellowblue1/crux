// Status badge Lit component

import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("status-badge")
export class StatusBadge extends LitElement {
  @property() status: "busy" | "waiting" = "busy";

  // Use light DOM for Tailwind CSS compatibility
  protected createRenderRoot() {
    return this;
  }

  render() {
    const cssClass =
      this.status === "busy"
        ? "status-badge status-badge--busy"
        : "status-badge status-badge--waiting";
    const label = this.status === "busy" ? "Busy" : "Waiting";
    const icon = this.status === "busy" ? "\u{1F4A6}" : "\u2615";

    return html`<span class="${cssClass}" title="${label}">${icon}</span>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "status-badge": StatusBadge;
  }
}
