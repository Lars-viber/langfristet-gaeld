import type { ContractScheduleRow } from '../domain';
import { canCalculateAnnuityPayment, prerequisitesApproved, scheduleRowStatus } from '../student';
import type { ScheduleField, SchedulePrerequisite, StudentAction, StudentState } from '../student/types';
import { ValidationMessage } from './ValidationMessage';

const fieldLabels: Record<ScheduleField, string> = {
  openingPrincipal: 'Restgæld primo', payment: 'Ydelse', nominalInterest: 'Rente',
  principalRepayment: 'Afdrag', closingPrincipal: 'Restgæld ultimo',
};
const columns: ScheduleField[] = ['openingPrincipal', 'payment', 'nominalInterest', 'principalRepayment', 'closingPrincipal'];
const dateLabel = (date: string) => date.split('-').reverse().join('.');
const money = (value: ContractScheduleRow[ScheduleField]) => value.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export function ContractScheduleStep({ state, onAction, readOnly }: { state: StudentState; onAction(action: StudentAction): void; readOnly: boolean }) {
  const loanType = state.generatedCase.loanType;
  const input = state.generatedCase.caseInput;
  const prerequisites: SchedulePrerequisite[] = loanType === 'serial' ? ['principal', 'termRate', 'termCount', 'fixedRepayment'] : ['principal', 'termRate', 'termCount'];
  const labels: Record<SchedulePrerequisite, string> = { principal: 'Hovedstol', termRate: 'Rente pr. termin', termCount: 'Samlet antal terminer', fixedRepayment: 'Fast afdrag' };
  const activePrerequisite = prerequisites.find((key) => !state.schedule.prerequisites[key]?.approved);
  const ready = prerequisitesApproved(state);
  const completed = state.completedSteps.includes('contractSchedule');
  const canContinue = completed && !readOnly && state.currentStep === 'contractSchedule' && state.viewingStep === 'contractSchedule';

  function prerequisiteResult(key: SchedulePrerequisite): string {
    if (key === 'principal' || key === 'fixedRepayment') return `${key === 'principal' ? money(state.caseResult.contract.rows[0]!.openingPrincipal) : money(state.caseResult.contract.standardPayment!)} kr.`;
    if (key === 'termRate') return `${state.caseResult.contract.termRate.times(100).toFixed(4).replace('.', ',')} %`;
    return String(state.caseResult.contract.rows.length);
  }
  function placeholder(key: SchedulePrerequisite): string { return key === 'principal' ? 'Indtast hovedstol' : key === 'fixedRepayment' ? 'Beregn et positivt beløb med =' : 'Beregn med ='; }
  function setupField(key: SchedulePrerequisite) {
    const entry = state.schedule.prerequisites[key]; const locked = readOnly || Boolean(entry?.approved); const active = activePrerequisite === key; const id = `schedule-${key}`;
    return <div className={`schedule-setup-field ${entry?.approved ? 'is-approved' : ''} ${active ? 'is-active' : ''}`} key={key}>
      <label htmlFor={id}>{labels[key]}</label><div className="schedule-setup-control">
        <input id={id} type="text" inputMode="decimal" autoComplete="off" spellCheck={false} value={entry?.raw ?? ''}
          placeholder={active ? placeholder(key) : 'Afvent forrige felt'} disabled={!active && !locked} readOnly={locked} aria-invalid={entry?.errorCode ? true : undefined}
          aria-describedby={entry?.errorCode ? `${id}-feedback` : undefined} onChange={(event) => onAction({ type: 'editSchedulePrerequisite', field: key, raw: event.target.value })} />
        {!locked && <button className="button button-primary" type="button" disabled={!active} onClick={() => onAction({ type: 'checkSchedulePrerequisite', field: key })}>Kontrollér</button>}
      </div>{entry?.approved && <div className="schedule-setup-result"><span>{prerequisiteResult(key)}</span><span aria-label="Godkendt" title="Godkendt">✓</span></div>}
      <ValidationMessage code={entry?.errorCode ?? null} id={`${id}-feedback`} />
    </div>;
  }
  function isLiteralField(term: number, key: ScheduleField): boolean { return key === 'openingPrincipal' || (loanType === 'bullet' && key === 'principalRepayment' && term !== state.caseResult.contract.rows.length); }
  function cell(row: ContractScheduleRow, key: ScheduleField) {
    const status = scheduleRowStatus(state, row.term); const entry = state.schedule.rows[row.term]?.[key];
    if (status === 'appCalculated') return <span className="calculated-value">{money(row[key])}</span>;
    if ((loanType === 'annuity' && key === 'payment') || (loanType === 'serial' && key === 'principalRepayment')) return status === 'locked' ? <span className="empty-value">—</span> : <span className="calculated-value">{money(row[key])}</span>;
    if (status === 'locked') return <span className="empty-value">—</span>;
    const id = `schedule-${row.term}-${key}`; const locked = readOnly || Boolean(entry?.approved);
    return <div className={`table-field ${entry?.approved ? 'is-approved' : ''}`}><input id={id} aria-label={`Termin ${row.term}, ${fieldLabels[key]}`} type="text" inputMode="decimal" autoComplete="off" spellCheck={false}
      value={entry?.raw ?? ''} placeholder={isLiteralField(row.term, key) ? 'Indtast beløb' : 'Beregn med ='} readOnly={locked}
      onChange={(event) => onAction({ type: 'editScheduleField', term: row.term, field: key, raw: event.target.value })}
      aria-invalid={entry?.errorCode ? true : undefined} aria-describedby={entry?.errorCode ? `${id}-feedback` : undefined} />
      {entry?.approved && <span className="table-result">{money(row[key])} kr. <span aria-label="Godkendt" title="Godkendt">✓</span></span>}<ValidationMessage code={entry?.errorCode ?? null} id={`${id}-feedback`} /></div>;
  }

  return <div className="step-work schedule-work r2-schedule-work">
    <aside className="schedule-reference" aria-label="Vejledning til ydelsesplan"><h2 id="step-heading">Ydelsesplan</h2><p>Beregn lånets betalinger termin for termin.</p><p className="schedule-date-note">Lånet er optaget {dateLabel(input.issueDate)}. Første betaling sker efter én fuld termin.</p>{canContinue && <button className="button button-primary schedule-continue" type="button" onClick={() => onAction({ type: 'continueToNextStep' })}>Fortsæt til Effektiv rente</button>}</aside>
    <div className="schedule-main"><section className="work-card schedule-setup" aria-label="Beregningsgrundlag"><p className="schedule-setup-instruction">Din opgave: {loanType === 'annuity' ? 'Indtast beløb og tryk Beregn ydelse.' : loanType === 'serial' ? 'Indtast beløb og beregn fast afdrag med =.' : 'Indtast beløb og beregn grundlaget med =.'}</p><div className="schedule-setup-grid">{prerequisites.map(setupField)}
      {loanType === 'annuity' && ready && <div className="schedule-app-action">{state.schedule.annuityPaymentCalculated ? <span><strong>Ydelse pr. termin</strong><output>{money(state.caseResult.contract.standardPayment!)} kr.</output></span> : <button className="button button-primary" type="button" disabled={!canCalculateAnnuityPayment(state) || readOnly} onClick={() => onAction({ type: 'calculateAnnuityPayment' })}>Beregn ydelse</button>}</div>}</div></section>
      <section className="work-card schedule-table-card"><p className="schedule-instruction">Din opgave: {loanType === 'bullet' ? 'Udfyld termin 1, termin 2 og sidste termin. Når de er korrekte, beregner appen de øvrige terminer.' : 'Udfyld termin 1 og termin 2. Når begge terminer er korrekte, beregner appen de resterende terminer.'}</p>
        <div className="table-scroll schedule-scroll" role="region" aria-label="Vandret rulbar ydelsesplan" tabIndex={0}><table className="finance-table schedule-table"><thead><tr><th scope="col">Termin</th><th scope="col">Dato</th>{columns.map((key) => <th scope="col" key={key}>{fieldLabels[key]}</th>)}</tr></thead><tbody>{state.caseResult.contract.rows.map((row) => <tr key={row.term} className={`row-${scheduleRowStatus(state, row.term)}`}><th scope="row">{row.term}</th><td>{dateLabel(row.date)}</td>{columns.map((key) => <td key={key}>{cell(row, key)}</td>)}</tr>)}</tbody></table></div>
        {state.caseResult.contract.rows.map((row) => scheduleRowStatus(state, row.term) === 'active' && !readOnly ? <div className="schedule-row-action" key={row.term}><span>Udfyld termin {row.term}, og kontrollér derefter rækken.</span><button className="button button-primary" type="button" onClick={() => onAction({ type: 'checkScheduleRow', term: row.term })}>Kontrollér termin {row.term}</button></div> : null)}
        {state.schedule.remainingCalculated && <p className="schedule-complete-note" role="status">De resterende terminer er beregnet af appen.</p>}</section></div>
  </div>;
}
