import type { FieldState } from '../student';
import type { FeedbackContext } from '../validation/types';
import { ValidationMessage } from './ValidationMessage';

interface ManualCalculationFieldProps {
  id: string;
  label: string;
  field?: FieldState;
  active: boolean;
  readOnly: boolean;
  feedbackContext?: FeedbackContext;
  onChange(raw: string): void;
  onCheck(): void;
}

export function ManualCalculationField({
  id, label, field, active, readOnly, feedbackContext, onChange, onCheck,
}: ManualCalculationFieldProps) {
  const approved = field?.approved ?? false;
  const locked = readOnly || approved;
  const waiting = !locked && !active;
  const feedbackId = `${id}-feedback`;
  return (
    <form className={`manual-field ${approved ? 'is-approved' : ''} ${waiting ? 'is-waiting' : ''}`}
      onSubmit={(event) => { event.preventDefault(); if (!locked && active) onCheck(); }}>
      <label htmlFor={id}>{label}<span className="field-kind">Beregn manuelt med =</span></label>
      <div className="manual-field-controls">
        <input id={id} type="text" inputMode="decimal" autoComplete="off" spellCheck={false}
          value={field?.raw ?? ''} placeholder={waiting ? 'Afvent forrige beregning' : '= …'}
          onChange={(event) => onChange(event.target.value)}
          readOnly={locked} disabled={waiting} aria-invalid={field?.errorCode ? true : undefined}
          aria-describedby={field?.errorCode ? feedbackId : undefined} />
        {!locked && <button className="button button-primary" type="submit" disabled={!active}>Kontrollér</button>}
        {approved && <span className="approved-mark" role="status">✓ Godkendt</span>}
      </div>
      <ValidationMessage code={field?.errorCode ?? null} id={feedbackId} context={feedbackContext} />
    </form>
  );
}
