import type { ContractScheduleRow } from '../domain';
import {
  canCalculateAnnuityPayment, prerequisitesApproved, scheduleRowStatus,
} from '../student';
import type {
  ScheduleField, SchedulePrerequisite, StudentAction, StudentState,
} from '../student/types';
import { ManualCalculationField } from './ManualCalculationField';
import { ValidationMessage } from './ValidationMessage';

const prerequisiteLabels: Record<SchedulePrerequisite, string> = {
  termCount: 'Antal terminer',
  termRate: 'Rente pr. termin',
  fixedRepayment: 'Fast afdrag pr. termin',
};
const fieldLabels: Record<ScheduleField, string> = {
  openingPrincipal: 'Restgæld primo',
  payment: 'Ydelse',
  nominalInterest: 'Rente',
  principalRepayment: 'Afdrag',
  closingPrincipal: 'Restgæld ultimo',
};
const columns: ScheduleField[] = [
  'openingPrincipal', 'payment', 'nominalInterest', 'principalRepayment', 'closingPrincipal',
];
const dateLabel = (date: string) => date.split('-').reverse().join('.');
const money = (value: ContractScheduleRow[ScheduleField]) => {
  const [whole, fraction] = value.toFixed(2).split('.');
  return `${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fraction}`;
};

export function ContractScheduleStep({ state, onAction, readOnly }: {
  state: StudentState; onAction(action: StudentAction): void; readOnly: boolean;
}) {
  const loanType = state.generatedCase.loanType;
  const prerequisites: SchedulePrerequisite[] = loanType === 'serial'
    ? ['termCount', 'termRate', 'fixedRepayment'] : ['termCount', 'termRate'];
  const activePrerequisite = prerequisites.find((field) => !state.schedule.prerequisites[field]?.approved);
  const ready = prerequisitesApproved(state);
  const manualFields: ScheduleField[] = loanType === 'annuity'
    ? columns.filter((field) => field !== 'payment') : columns;
  const canCalculateRest = state.caseResult.contract.rows
    .filter((row) => [1, 2, ...(loanType === 'bullet' ? [state.caseResult.contract.rows.length] : [])].includes(row.term))
    .every((row) => state.schedule.approvedTerms.includes(row.term));

  function cell(row: ContractScheduleRow, key: ScheduleField) {
    const status = scheduleRowStatus(state, row.term);
    const entry = state.schedule.rows[row.term]?.[key];
    if (status === 'appCalculated') return <span className="calculated-value">{money(row[key])}</span>;
    if (loanType === 'annuity' && key === 'payment') {
      return state.schedule.annuityPaymentCalculated && status !== 'locked'
        ? <span className="calculated-value">{money(row.payment)}</span> : <span className="empty-value">—</span>;
    }
    if (status === 'locked') return <span className="empty-value">—</span>;
    const id = `schedule-${row.term}-${key}`;
    const locked = readOnly || Boolean(entry?.approved);
    return <div className="table-field">
      <input id={id} aria-label={`Termin ${row.term}, ${fieldLabels[key]}`}
        type="text" inputMode="decimal" autoComplete="off" spellCheck={false}
        value={entry?.raw ?? ''} placeholder="= …" readOnly={locked}
        onChange={(event) => onAction({ type: 'editScheduleField', term: row.term, field: key, raw: event.target.value })}
        aria-invalid={entry?.errorCode ? true : undefined}
        aria-describedby={entry?.errorCode ? `${id}-feedback` : undefined} />
      {entry?.approved && <span className="field-approved" aria-label="Godkendt">✓</span>}
      <ValidationMessage code={entry?.errorCode ?? null} id={`${id}-feedback`} />
    </div>;
  }

  return <div className="step-work schedule-work">
    <div className="work-card">
      <div className="work-card-heading">
        <p className="eyebrow">Forbered betalingsplanen</p>
        <h3>Beregn lånets terminer</h3>
        <p>Beregn først antal terminer og renten pr. termin med =.
          {loanType === 'serial' ? ' Beregn derefter det faste afdrag pr. termin.' : ''}</p>
      </div>
      <div className="prerequisite-grid">
        {prerequisites.map((field) => <ManualCalculationField key={field}
          id={`schedule-${field}`} label={prerequisiteLabels[field]}
          field={state.schedule.prerequisites[field]} active={activePrerequisite === field}
          readOnly={readOnly}
          onChange={(raw) => onAction({ type: 'editSchedulePrerequisite', field, raw })}
          onCheck={() => onAction({ type: 'checkSchedulePrerequisite', field })} />)}
      </div>
      {loanType === 'annuity' && ready && <div className="calculation-action">
        {state.schedule.annuityPaymentCalculated
          ? <p role="status"><strong>Ydelse pr. termin:</strong> {state.caseResult.contract.standardPayment && money(state.caseResult.contract.standardPayment)} kr. · Beregnet af appen</p>
          : <button className="button button-primary" type="button" disabled={!canCalculateAnnuityPayment(state) || readOnly}
              onClick={() => onAction({ type: 'calculateAnnuityPayment' })}>Beregn ydelse</button>}
      </div>}
    </div>
    <div className="work-card">
      <div className="work-card-heading">
        <p className="eyebrow">Betalingsplan</p>
        <h3>Ydelsesplan</h3>
        <p>Udfyld én termin ad gangen. Brug = i hver manuel beregning. Godkendte felter låses.</p>
      </div>
      <div className="table-scroll" role="region" aria-label="Vandret rulbar ydelsesplan" tabIndex={0}>
        <table className="finance-table schedule-table">
          <thead><tr><th scope="col">Termin</th><th scope="col">Dato</th>
            {columns.map((field) => <th scope="col" key={field}>{fieldLabels[field]}</th>)}
          </tr></thead>
          <tbody>{state.caseResult.contract.rows.map((row) => {
            const status = scheduleRowStatus(state, row.term);
            return <tr key={row.term} className={`row-${status}`}>
              <th scope="row">{row.term}</th><td>{dateLabel(row.date)}</td>
              {columns.map((field) => <td key={field}>{cell(row, field)}</td>)}
            </tr>;
          })}</tbody>
        </table>
      </div>
      {state.caseResult.contract.rows.map((row) => scheduleRowStatus(state, row.term) === 'active' && !readOnly
        ? <div className="row-action" key={row.term}>
            <span>Termin {row.term}: {manualFields.filter((field) => state.schedule.rows[row.term]?.[field]?.approved).length} af {manualFields.length} felter godkendt</span>
            <button className="button button-primary" type="button"
              onClick={() => onAction({ type: 'checkScheduleRow', term: row.term })}>Kontrollér termin {row.term}</button>
          </div> : null)}
      {canCalculateRest && !state.schedule.remainingCalculated && !readOnly &&
        <div className="row-action"><span>De manuelle terminer er godkendt.</span>
          <button className="button button-primary" type="button"
            onClick={() => onAction({ type: 'calculateRemainingSchedule' })}>Beregn resten af ydelsesplanen</button>
        </div>}
      {state.schedule.remainingCalculated && <p className="calculated-note" role="status">Resten af ydelsesplanen er beregnet af appen.</p>}
    </div>
  </div>;
}
