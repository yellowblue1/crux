// Context window gauge Lit component

import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("context-gauge")
export class ContextGauge extends LitElement {
  @property({ type: Number }) percentage = 0;

  // Use light DOM for Tailwind CSS compatibility
  protected createRenderRoot() {
    return this;
  }

  private getColorClass(): string {
    if (this.percentage >= 80) return "context-gauge--high";
    if (this.percentage >= 50) return "context-gauge--medium";
    return "context-gauge--low";
  }

  render() {
    const pct = Math.round(this.percentage);
    return html`
      <div class="context-gauge ${this.getColorClass()}" title="${this.percentage.toFixed(1)}% context used">
        <div class="context-gauge-bar">
          <div class="context-gauge-fill" style="width: ${pct}%"></div>
        </div>
        <span class="context-gauge-label">${pct}%</span>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "context-gauge": ContextGauge;
  }
}
