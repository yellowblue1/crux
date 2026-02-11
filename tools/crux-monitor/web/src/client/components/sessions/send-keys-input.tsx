import type { PaneAction } from "@shared/types";
import { Send } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { useActionDetection } from "@/hooks/use-action-detection";
import { useSendKeys } from "@/hooks/use-send-keys";
import { cn } from "@/lib/cn";

interface SendKeysInputProps {
  paneId: string;
}

export function SendKeysInput({ paneId }: SendKeysInputProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const sendKeys = useSendKeys();
  const { action, isDetecting, detect } = useActionDetection(paneId);

  const handleInputFocus = () => {
    setTimeout(() => {
      inputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  };

  const handleSend = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    sendKeys.mutate(
      { paneId, text: trimmed },
      {
        onSuccess: () => {
          setText("");
          inputRef.current?.focus();
          toast.success(`Sent: ${trimmed}`);
        },
      },
    );
  };

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    handleSend(text);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(text);
    }
  };

  /** Send text with Enter (y, n, etc.) */
  const handleQuickAction = (value: string) => {
    sendKeys.mutate(
      { paneId, text: value },
      {
        onSuccess: () => {
          toast.success(`Sent: ${value}`);
          inputRef.current?.focus();
        },
      },
    );
  };

  /** Send a raw tmux key name (Escape, i, etc.) without Enter */
  const handleRawKey = (key: string, label: string) => {
    sendKeys.mutate(
      { paneId, text: key, raw: true },
      {
        onSuccess: () => {
          toast.success(`Sent: ${label}`);
          inputRef.current?.focus();
          setTimeout(() => {
            inputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 100);
        },
      },
    );
  };

  return (
    <div className="send-keys-bar">
      {/* Raw key buttons + AI detect (always visible) */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-text-muted">Keys:</span>
        <button
          type="button"
          className="quick-action-btn"
          onClick={() => handleRawKey("Escape", "Esc")}
          disabled={sendKeys.isPending}
          title="Send Escape key (vi normal mode)"
        >
          Esc
        </button>
        <button
          type="button"
          className="quick-action-btn"
          onClick={() => handleRawKey("i", "i")}
          disabled={sendKeys.isPending}
          title="Send i key (vi insert mode)"
        >
          i
        </button>
        <button
          type="button"
          className="quick-action-btn"
          onClick={() => handleRawKey("Up", "↑")}
          disabled={sendKeys.isPending}
          title="Send Up arrow key"
        >
          ↑
        </button>
        <button
          type="button"
          className="quick-action-btn"
          onClick={() => handleRawKey("Down", "↓")}
          disabled={sendKeys.isPending}
          title="Send Down arrow key"
        >
          ↓
        </button>
        <button
          type="button"
          className="quick-action-btn"
          onClick={() => handleRawKey("Enter", "Enter")}
          disabled={sendKeys.isPending}
          title="Send Enter key"
        >
          Enter
        </button>
        <button
          type="button"
          className="quick-action-btn !text-xl !leading-none"
          onClick={() => detect()}
          disabled={isDetecting}
          title="Detect actions with AI"
        >
          {isDetecting ? "..." : "\u{1F9E0}"}
        </button>
      </div>

      {/* Dynamic AI-detected actions */}
      <DynamicActions
        action={action}
        onQuickAction={handleQuickAction}
        onRawKey={handleRawKey}
        isPending={sendKeys.isPending}
      />

      {/* Input row */}
      <form onSubmit={handleFormSubmit} className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={handleInputFocus}
          enterKeyHint="send"
          placeholder={action.type === "freeform" ? action.placeholder : "Send text to pane..."}
          disabled={sendKeys.isPending}
          className={cn(
            "flex-1 bg-bg-secondary border border-border-default rounded-lg px-3 py-2",
            "text-text-primary placeholder:text-text-muted font-mono text-sm",
            "focus:outline-none focus:border-accent-blue transition-colors",
            "min-h-[44px]",
          )}
        />
        <button
          type="submit"
          disabled={sendKeys.isPending || !text.trim()}
          className={cn(
            "action-btn bg-accent-blue text-white rounded-lg min-h-[44px] min-w-[44px]",
            "disabled:opacity-40 disabled:cursor-not-allowed",
            "hover:opacity-90 transition-opacity",
          )}
          title="Send text to pane"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}

/** Renders dynamic buttons based on AI-detected action type */
function DynamicActions({
  action,
  onQuickAction,
  onRawKey,
  isPending,
}: {
  action: PaneAction;
  onQuickAction: (value: string) => void;
  onRawKey: (key: string, label: string) => void;
  isPending: boolean;
}) {
  if (action.type === "none") return null;

  if (action.type === "yesno") {
    return (
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-text-muted">Answer:</span>
        <button
          type="button"
          className="quick-action-btn"
          onClick={() => onQuickAction("y")}
          disabled={isPending}
        >
          Yes
        </button>
        <button
          type="button"
          className="quick-action-btn"
          onClick={() => onQuickAction("n")}
          disabled={isPending}
        >
          No
        </button>
      </div>
    );
  }

  if (action.type === "choices") {
    return (
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-xs text-text-muted">Options:</span>
        {action.options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className="quick-action-btn"
            onClick={() =>
              opt.autoEnter ? onQuickAction(opt.value) : onRawKey(opt.value, opt.label)
            }
            disabled={isPending}
          >
            {opt.label}
          </button>
        ))}
      </div>
    );
  }

  // "freeform" type: placeholder is set on the input, no extra buttons needed
  return null;
}
