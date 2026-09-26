import type { UseFormRegisterReturn } from "react-hook-form";

import { SEVERITY_HINTS } from "../schemas/incident";
import { INCIDENT_SEVERITIES } from "../types/api";
import { SeverityBadge } from "./Badges";

interface SeverityPickerProps {
  registration: UseFormRegisterReturn;
  error?: string;
}

/** Severity as a radio group, each option with what it means. */
export function SeverityPicker({ registration, error }: SeverityPickerProps) {
  return (
    <fieldset className="form-field choice-field" aria-invalid={Boolean(error)}>
      <legend>Severity</legend>
      <div className="choice-grid">
        {INCIDENT_SEVERITIES.map((sev) => (
          <label key={sev} className="choice">
            <input type="radio" value={sev} {...registration} />
            <span className="choice-body">
              <SeverityBadge severity={sev} />
              <span className="choice-hint">{SEVERITY_HINTS[sev]}</span>
            </span>
          </label>
        ))}
      </div>
      {error && <p className="form-error">{error}</p>}
    </fieldset>
  );
}
