import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { ApiError } from "../api/client";
import { useUpdateIncident } from "../api/incidents";
import { incidentEditSchema, type IncidentEditValues } from "../schemas/incident";
import type { Incident } from "../types/api";
import { Dialog } from "./Dialog";
import { SeverityPicker } from "./SeverityPicker";
import { useToast } from "./toastContext";

interface IncidentEditDialogProps {
  incident: Incident;
  open: boolean;
  onClose: () => void;
}

export function IncidentEditDialog({ incident, open, onClose }: IncidentEditDialogProps) {
  return (
    <Dialog open={open} title="Edit incident" onClose={onClose}>
      {/* Dialog mounts this only while open, so each edit starts from current values. */}
      <EditForm incident={incident} onDone={onClose} />
    </Dialog>
  );
}

function EditForm({ incident, onDone }: { incident: Incident; onDone: () => void }) {
  const update = useUpdateIncident(incident.id);
  const toast = useToast();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<IncidentEditValues>({
    resolver: zodResolver(incidentEditSchema),
    defaultValues: {
      title: incident.title,
      severity: incident.severity,
      description: incident.description ?? "",
    },
  });

  const submit = handleSubmit(async (values) => {
    try {
      await update.mutateAsync({
        title: values.title,
        severity: values.severity,
        description: values.description || null,
      });
      toast.show({ tone: "success", message: "Incident updated." });
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.problem.errors) {
        for (const fieldError of err.problem.errors) {
          const field = fieldError.loc.at(-1);
          if (field === "title" || field === "severity" || field === "description") {
            setError(field, { message: fieldError.msg });
          }
        }
        return;
      }
      setError("root", { message: err instanceof Error ? err.message : "Update failed." });
    }
  });

  return (
    <form onSubmit={submit} noValidate>
      {errors.root && (
        <p role="alert" className="form-error form-error-root">
          {errors.root.message}
        </p>
      )}
      <div className="form-field">
        <label htmlFor="edit-title">Title</label>
        <input id="edit-title" {...register("title")} aria-invalid={Boolean(errors.title)} />
        {errors.title && <p className="form-error">{errors.title.message}</p>}
      </div>
      <SeverityPicker registration={register("severity")} error={errors.severity?.message} />
      <div className="form-field">
        <label htmlFor="edit-description">Description</label>
        <textarea
          id="edit-description"
          rows={5}
          {...register("description")}
          aria-invalid={Boolean(errors.description)}
        />
        {errors.description && <p className="form-error">{errors.description.message}</p>}
      </div>
      <div className="dialog-actions">
        <button type="button" className="button" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="button button-primary" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
