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

    return html`<span class="${cssClass}">${label}</span>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "status-badge": StatusBadge;
  }
}
