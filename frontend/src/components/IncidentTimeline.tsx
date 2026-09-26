import { type FormEvent, useState } from "react";

import { useAddNote, useIncidentEvents } from "../api/incidents";
import { errorMessage } from "../api/errorMessage";
import { describeEvent, eventIcon, eventTone } from "../lib/events";
import { ErrorState, LoadingState } from "./AsyncState";
import { Icon } from "./Icon";
import { RelativeTime } from "./RelativeTime";
import { useToast } from "./toastContext";

const NOTE_MAX = 5000;

export function IncidentTimeline({ incidentId }: { incidentId: string }) {
  const events = useIncidentEvents(incidentId);

  return (
    <section className="panel" aria-labelledby="timeline-heading">
      <div className="panel-header">
        <h2 id="timeline-heading">Timeline</h2>
        {events.data && <span className="muted">{events.data.total} events</span>}
      </div>
      {events.isLoading && <LoadingState label="Loading timeline…" />}
      {events.isError && (
        <ErrorState message={errorMessage(events.error)} onRetry={() => void events.refetch()} />
      )}
      {events.data && (
        <ol className="timeline">
          {events.data.items.map((event) => (
            <li key={event.id} className={`timeline-item ${eventTone(event)}`}>
              <span className="timeline-marker">
                <Icon name={eventIcon(event)} size={14} />
              </span>
              <div className="timeline-content">
                <p className="timeline-summary">
                  {describeEvent(event)}
                  <span className="timeline-time">
                    <RelativeTime iso={event.created_at} />
                  </span>
                </p>
                {event.kind === "note" && <p className="timeline-note">{event.body}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
      <NoteComposer incidentId={incidentId} />
    </section>
  );
}

function NoteComposer({ incidentId }: { incidentId: string }) {
  const addNote = useAddNote(incidentId);
  const toast = useToast();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const trimmed = body.trim();

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!trimmed || addNote.isPending) return;
    setError(null);
    try {
      await addNote.mutateAsync(trimmed);
      setBody("");
      toast.show({ tone: "success", message: "Note added." });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <form className="note-composer" onSubmit={submit} noValidate>
      <label htmlFor="note-body" className="visually-hidden">
        Add a note
      </label>
      <textarea
        id="note-body"
        rows={3}
        maxLength={NOTE_MAX}
        value={body}
        placeholder="Add a note: what you tried, what you found, who you paged…"
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
        }}
        aria-invalid={Boolean(error)}
        aria-describedby="note-hint"
      />
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="note-composer-actions">
        <span id="note-hint" className="muted">
          ⌘/Ctrl + Enter to post
        </span>
        <button
          type="submit"
          className="button button-primary button-small"
          disabled={!trimmed || addNote.isPending}
        >
          {addNote.isPending ? "Posting…" : "Add note"}
        </button>
      </div>
    </form>
  );
}
