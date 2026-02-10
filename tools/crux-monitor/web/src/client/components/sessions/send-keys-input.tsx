import { CornerDownLeft, Send } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { useSendKeys } from "@/hooks/use-send-keys";
import { cn } from "@/lib/cn";

interface SendKeysInputProps {
  paneId: string;
}

export function SendKeysInput({ paneId }: SendKeysInputProps) {
  const [text, setText] = useState("");
  const [noEnter, setNoEnter] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const sendKeys = useSendKeys();

  const handleSubmit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    sendKeys.mutate(
      { paneId, text: trimmed, noEnter },
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
    handleSubmit(text);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(text);
    }
  };

  const handleQuickAction = (value: string) => {
    sendKeys.mutate(
      { paneId, text: value, noEnter: false },
      {
        onSuccess: () => {
          toast.success(`Sent: ${value}`);
          inputRef.current?.focus();
        },
      },
    );
  };

  return (
    <div className="send-keys-bar">
      {/* Quick action buttons */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-text-muted">Quick:</span>
        <button
          type="button"
          className="quick-action-btn"
          onClick={() => handleQuickAction("y")}
          disabled={sendKeys.isPending}
        >
          y
        </button>
        <button
          type="button"
          className="quick-action-btn"
          onClick={() => handleQuickAction("n")}
          disabled={sendKeys.isPending}
        >
          n
        </button>
      </div>

      {/* Input row */}
      <form onSubmit={handleFormSubmit} className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send text to pane..."
          disabled={sendKeys.isPending}
          className={cn(
            "flex-1 bg-bg-secondary border border-border-default rounded-lg px-3 py-2",
            "text-text-primary placeholder:text-text-muted font-mono text-sm",
            "focus:outline-none focus:border-accent-blue transition-colors",
            "min-h-[44px]",
          )}
        />
        <button
          type="button"
          onClick={() => setNoEnter(!noEnter)}
          title={noEnter ? "Enter key will NOT be sent" : "Enter key will be sent after text"}
          className={cn(
            "inline-flex items-center justify-center border rounded-lg min-h-[44px] min-w-[44px] cursor-pointer transition-all",
            noEnter
              ? "border-accent-yellow text-accent-yellow bg-accent-yellow/15"
              : "border-border-default text-text-muted bg-bg-secondary",
          )}
        >
          <CornerDownLeft size={18} />
        </button>
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
