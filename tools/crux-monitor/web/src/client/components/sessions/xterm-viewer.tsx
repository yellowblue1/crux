import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";

import "@xterm/xterm/css/xterm.css";

interface XtermViewerProps {
  content: string | null;
  className?: string;
}

// GitHub Dark theme matching existing CSS custom properties
const XTERM_THEME = {
  background: "#0d1117",
  foreground: "#c9d1d9",
  cursor: "#0d1117",
  cursorAccent: "#0d1117",
  selectionBackground: "#264f78",
  selectionForeground: "#f0f6fc",
  black: "#586069",
  red: "#f85149",
  green: "#3fb950",
  yellow: "#d29922",
  blue: "#58a6ff",
  magenta: "#bc8cff",
  cyan: "#39c5cf",
  white: "#f0f6fc",
  brightBlack: "#8b949e",
  brightRed: "#ff7b72",
  brightGreen: "#56d364",
  brightYellow: "#e3b341",
  brightBlue: "#79c0ff",
  brightMagenta: "#d2a8ff",
  brightCyan: "#56d4dd",
  brightWhite: "#ffffff",
} as const;

export function XtermViewer({ content, className }: XtermViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  // Initialize terminal on mount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const fitAddon = new FitAddon();
    const terminal = new Terminal({
      theme: XTERM_THEME,
      fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
      fontSize: 14,
      lineHeight: 1.5,
      cursorBlink: false,
      cursorStyle: "block",
      cursorInactiveStyle: "none",
      disableStdin: true,
      convertEol: true,
      scrollback: 0,
    });

    terminal.loadAddon(fitAddon);
    terminal.open(container);
    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        fitAddon.fit();
      });
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  // Write content when it changes
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;

    terminal.reset();
    if (content != null) {
      terminal.write(content);
    }
  }, [content]);

  return <div ref={containerRef} className={className} />;
}
