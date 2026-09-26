import { cashFlowRowStatus } from '../student';
import type { StudentAction, StudentState } from '../student';
import type { ValidationErrorCode } from '../validation';
import { ValidationMessage } from './ValidationMessage';

const dateLabel = (date: string) => date.split('-').reverse().join('.');
const money = (value: { toFixed(places: number): string }) => {
  const [whole, fraction] = value.toFixed(2).split('.');
  return `${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fraction}`;
};
const cashFlowError = (code: ValidationErrorCode | null) => code === 'NEGATIVE_AMOUNT_NOT_ALLOWED'
  ? 'Indtast beløbet som et positivt beløb. Vælg fortegnet separat.' : null;

export function EffectiveInterestStep({ state, onAction, readOnly }: {
  state: StudentState; onAction(action: StudentAction): void; readOnly: boolean;
}) {
  const loanType = state.generatedCase.loanType;
  const historical = state.viewingStep !== state.currentStep;
  const canContinue = state.completedSteps.includes('effectiveInterest') && !readOnly && !historical;
  const approvedProceeds = state.proceeds.proceeds?.approved;
  const approvedSchedule = state.schedule.remainingCalculated;
  const activeRow = state.caseResult.cashFlows.find((row) => cashFlowRowStatus(state, row.term) === 'active');

  return <div className="step-work interest-work r3-interest-work">
    <aside className="interest-reference" aria-label="Vejledning til effektiv rente">
      <h2 id="step-heading">Effektiv rente</h2>
      <p>Opstil lånets pengestrømme og beregn den effektive rente pr. termin.</p>
      <p>Provenuet er en indbetaling. De kontraktuelle betalinger er udbetalinger.</p>
      <dl className="interest-approved-reference">
        {approvedProceeds && <div><dt>Godkendt provenu</dt><dd>{money(state.caseResult.proceeds.proceeds)} kr.</dd></div>}
        <div><dt>Optagelsesdato</dt><dd>{dateLabel(state.generatedCase.caseInput.issueDate)}</dd></div>
      </dl>
      {approvedSchedule && <div className="interest-payment-reference" aria-label="Godkendte kontraktuelle betalinger">
        <p>Godkendte betalinger</p>
        <div className="interest-payment-scroll"><table><thead><tr><th scope="col">Termin</th><th scope="col">Dato</th><th scope="col">Betaling</th></tr></thead>
          <tbody>{state.caseResult.contract.rows.map((row) => <tr key={row.term}><th scope="row">{row.term}</th><td>{dateLabel(row.date)}</td><td>{money(row.payment)} kr.</td></tr>)}</tbody></table></div>
      </div>}
      {historical && <p className="interest-history-note" role="status">Du ser et tidligere trin. Trinnet er skrivebeskyttet.</p>}
      {historical ? <button className="button button-secondary interest-continue" type="button" onClick={() => onAction({ type: 'returnToCurrentStep' })}>Tilbage til aktuelt trin</button>
        : canContinue && <button className="button button-primary interest-continue" type="button" onClick={() => onAction({ type: 'continueToNextStep' })}>Fortsæt til Amortiseret kostpris</button>}
    </aside>
    <div className="interest-main">
      <section className="work-card interest-table-card" aria-label="Pengestrømme">
        <div className="interest-table-top"><p className="interest-instruction">Din opgave: {loanType === 'bullet'
          ? 'Udfyld termin 0, termin 1, termin 2 og sidste termin. Når de er korrekte, beregner appen de øvrige pengestrømme.'
          : 'Udfyld termin 0, termin 1 og termin 2. Når de er korrekte, beregner appen de resterende pengestrømme.'}</p>
          {activeRow && !readOnly && <button className="button button-primary" type="button" onClick={() => onAction({ type: 'checkCashFlowRow', term: activeRow.term })}>Kontrollér termin {activeRow.term}</button>}</div>
        <div className="table-scroll interest-scroll" role="region" aria-label="Vandret rulbar pengestrømstabel" tabIndex={0}>
          <table className="finance-table interest-table"><thead><tr><th scope="col">Termin</th><th scope="col">Dato</th><th scope="col">Fortegn</th><th scope="col">Beløb</th></tr></thead>
            <tbody>{state.caseResult.cashFlows.map((expected) => {
              const status = cashFlowRowStatus(state, expected.term);
              const entered = state.effectiveInterest.rows[expected.term];
              const active = status === 'active' && !readOnly;
              const shownSign = status === 'appCalculated' ? (expected.direction === 'inflow' ? '+' : '−') : entered?.sign === '-' ? '−' : entered?.sign;
              const shownAmount = status === 'appCalculated' ? money(expected.amount) : entered?.amount ?? '';
              const id = `cashflow-${expected.term}`;
              return <tr key={expected.term} className={`row-${status}`}>
                <th scope="row">{expected.term}</th><td>{dateLabel(expected.date)}</td>
                <td>{active ? <fieldset className="interest-sign-choice"><legend className="sr-only">Termin {expected.term}, fortegn</legend>
                  {(['+', '-'] as const).map((sign) => <label key={sign}><input type="radio" name={`sign-${expected.term}`} value={sign}
                    checked={entered?.sign === sign} onChange={() => onAction({ type: 'editCashFlowRow', term: expected.term, sign })} />
                    <span>{sign === '-' ? '−' : '+'}</span></label>)}
                </fieldset> : <span className="interest-sign">{status === 'locked' ? '—' : shownSign ?? '—'}</span>}</td>
                <td>{status === 'appCalculated' ? <span className="calculated-value">{shownAmount}</span>
                  : status === 'locked' ? <span className="empty-value">—</span>
                  : <div className="table-field interest-amount-field"><input id={id} type="text" inputMode="decimal" autoComplete="off"
                    aria-label={`Termin ${expected.term}, positivt beløb`} value={shownAmount} placeholder="Indtast positivt beløb" readOnly={!active}
                    onChange={(event) => onAction({ type: 'editCashFlowRow', term: expected.term, amount: event.target.value })}
                    aria-invalid={entered?.errorCode ? true : undefined} aria-describedby={entered?.errorCode ? `${id}-feedback` : undefined} />
                    {status === 'approved' && <span className="interest-approved" aria-label="Godkendt">✓</span>}
                    {cashFlowError(entered?.errorCode ?? null)
                      ? <p className="validation-message" id={`${id}-feedback`} role="alert">{cashFlowError(entered?.errorCode ?? null)}</p>
                      : <ValidationMessage code={entered?.errorCode ?? null} id={`${id}-feedback`} />}
                  </div>}</td>
              </tr>;
            })}</tbody></table>
        </div>
      </section>
      <section className="work-card interest-rate-card" aria-label="Beregn effektiv rente">
        <p className="interest-instruction">Din opgave: Beregn den effektive rente ud fra den godkendte pengestrøm.</p>
        <div className="interest-rate-row">
          {state.effectiveInterest.rateCalculated
            ? <div className="interest-rate-result"><strong>Effektiv rente pr. termin</strong><output>{state.caseResult.effectiveInterest.displayedPercent.replace('.', ',')} %</output></div>
            : <button className="button button-primary" type="button" disabled={!state.effectiveInterest.remainingCalculated || readOnly}
                onClick={() => onAction({ type: 'calculateEffectiveRate' })}>Beregn effektiv rente</button>}
          {state.effectiveInterest.rateCalculated && <p className="interest-precision-note">Den viste rente er afrundet. Appen anvender den fulde beregnede præcision i de efterfølgende beregninger.</p>}
        </div>
      </section>
    </div>
  </div>;
}
