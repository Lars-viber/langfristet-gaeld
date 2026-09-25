import type { FieldState } from '../student';
import type { FeedbackContext } from '../validation/types';
import { ValidationMessage } from './ValidationMessage';
import { FieldActionBadge } from './FieldActionBadge';

interface ManualCalculationFieldProps {
  id: string;
  label: string;
  field?: FieldState;
  active: boolean;
  readOnly: boolean;
  feedbackContext?: FeedbackContext;
  approvedResult?: string;
  onChange(raw: string): void;
  onCheck(): void;
}

export function ManualCalculationField({
  id, label, field, active, readOnly, feedbackContext, approvedResult, onChange, onCheck,
}: ManualCalculationFieldProps) {
  const approved = field?.approved ?? false;
  const locked = readOnly || approved;
  const waiting = !locked && !active;
  const feedbackId = `${id}-feedback`;
  return (
    <form className={`manual-field ${approved ? 'is-approved' : ''} ${waiting ? 'is-waiting' : ''}`}
      onSubmit={(event) => { event.preventDefault(); if (!locked && active) onCheck(); }}>
      <label htmlFor={id}>{label}<FieldActionBadge action="beregn" /></label>
      <div className="manual-field-controls">
        <input id={id} type="text" inputMode="decimal" autoComplete="off" spellCheck={false}
          value={field?.raw ?? ''} placeholder={waiting ? 'Afvent forrige beregning' : '= …'}
          onChange={(event) => onChange(event.target.value)}
          readOnly={locked} disabled={waiting} aria-invalid={field?.errorCode ? true : undefined}
          aria-describedby={field?.errorCode ? feedbackId : undefined} />
        {!locked && <button className="button button-primary" type="submit" disabled={!active}>Kontrollér</button>}
        {approved && <span className="approved-mark" role="status">✓ Godkendt</span>}
      </div>
      {approved && approvedResult && <div className="approved-result"><span>Resultat</span><strong>{approvedResult}</strong></div>}
      <ValidationMessage code={field?.errorCode ?? null} id={feedbackId} context={feedbackContext} />
    </form>
  );
}
