import type { SessionResponse } from "@shared/types";
import { Link } from "@tanstack/react-router";
import { Clipboard, ClipboardCheck } from "lucide-react";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { cn } from "@/lib/cn";
import { StatusBadge } from "../ui/badge";

interface SessionRowProps {
  session: SessionResponse;
  isRead: boolean;
  onMarkAsRead: (paneId: string) => void;
}

export function SessionRow({ session, isRead, onMarkAsRead }: SessionRowProps) {
  const copy = useCopyToClipboard();
  const tmuxCommand = `tmux switch-client -t ${session.pane_id}`;

  const handleCopy = async () => {
    const success = await copy(tmuxCommand, "tmux command");
    if (success && !isRead) {
      onMarkAsRead(session.pane_id);
    }
  };

  const statusClass = session.status === "busy" ? "row-busy" : "row-waiting";

  return (
    <tr className={cn(statusClass, isRead && "read")}>
      <td className="col-project">
        <Link
          to="/sessions/$paneId"
          params={{ paneId: session.pane_id }}
          className="project-name hover:underline"
        >
          {session.project_name}
        </Link>
      </td>
      <td className="col-branch">
        {session.git_branch ? (
          <span className="git-branch">{session.git_branch}</span>
        ) : (
          <span className="no-branch">-</span>
        )}
      </td>
      <td className="col-status">
        <StatusBadge variant={session.status} />
      </td>
      <td className="col-summary">
        {session.summary ? (
          <span className="summary" title={session.summary}>
            <span className="ai-indicator" title="AI-generated summary">
              ✨
            </span>
            {session.summary}
          </span>
        ) : (
          <span className="summary-placeholder">-</span>
        )}
      </td>
      <td className="col-tmux">
        <button
          type="button"
          className={cn("copy-btn", isRead && "copied")}
          title={tmuxCommand}
          onClick={handleCopy}
        >
          {isRead ? <ClipboardCheck size={20} /> : <Clipboard size={20} />}
        </button>
      </td>
    </tr>
  );
}
