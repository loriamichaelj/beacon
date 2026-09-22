export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <p role="status" className="state state-loading">
      {label}
    </p>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <p role="alert" className="state state-error">
      {message}
    </p>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <p className="state state-empty">{message}</p>;
}
