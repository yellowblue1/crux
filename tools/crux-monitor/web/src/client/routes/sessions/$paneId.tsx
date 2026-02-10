import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/sessions/$paneId")({
  component: SessionDetailPage,
});

function SessionDetailPage() {
  const { paneId } = Route.useParams();

  return (
    <>
      <title>Session {paneId} - Claude Monitoring</title>
      <div className="mb-4">
        <Link to="/" className="text-accent-blue hover:underline text-sm">
          &larr; Back to sessions
        </Link>
      </div>
      <div className="empty-state">
        <p>Session Detail: {paneId}</p>
        <p className="hint">Terminal view and interaction features coming soon.</p>
      </div>
    </>
  );
}
