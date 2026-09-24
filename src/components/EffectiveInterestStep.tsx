import { cashFlowRowStatus } from '../student';
import type { StudentAction, StudentState } from '../student';
import { ValidationMessage } from './ValidationMessage';

const dateLabel = (date: string) => date.split('-').reverse().join('.');
const money = (value: { toFixed(places: number): string }) => {
  const [whole, fraction] = value.toFixed(2).split('.');
  return `${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fraction}`;
};

export function EffectiveInterestStep({ state, onAction, readOnly }: {
  state: StudentState; onAction(action: StudentAction): void; readOnly: boolean;
}) {
  const loanType = state.generatedCase.loanType;
  const lastTerm = state.caseResult.cashFlows.length - 1;
  const manualTerms = [0, 1, 2, ...(loanType === 'bullet' ? [lastTerm] : [])];
  const canCalculateRest = manualTerms.every((term) => state.effectiveInterest.approvedTerms.includes(term));

  return <div className="step-work interest-work">
    <div className="work-card">
      <div className="work-card-heading">
        <p className="eyebrow">Betalingsrække</p>
        <h3>Pengestrømme</h3>
        <p>Indtast et positivt beløb og vælg fortegnet separat. Start med lånets optagelse ved termin 0.</p>
      </div>
      <div className="table-scroll" role="region" aria-label="Vandret rulbar betalingsrække" tabIndex={0}>
        <table className="finance-table cashflow-table">
          <thead><tr><th scope="col">Termin</th><th scope="col">Dato</th>
            <th scope="col">Fortegn</th><th scope="col">Beløb</th></tr></thead>
          <tbody>{state.caseResult.cashFlows.map((expected) => {
            const status = cashFlowRowStatus(state, expected.term);
            const entered = state.effectiveInterest.rows[expected.term];
            const active = status === 'active' && !readOnly;
            const shownSign = status === 'appCalculated'
              ? expected.direction === 'inflow' ? '+' : '−'
              : entered?.sign === '-' ? '−' : entered?.sign;
            const shownAmount = status === 'appCalculated' ? money(expected.amount) : entered?.amount ?? '';
            const id = `cashflow-${expected.term}`;
            return <tr key={expected.term} className={`row-${status}`}>
              <th scope="row">{expected.term}</th><td>{dateLabel(expected.date)}</td>
              <td>{active ? <fieldset className="sign-choice">
                <legend className="sr-only">Termin {expected.term}, fortegn</legend>
                {(['+', '-'] as const).map((sign) => <label key={sign}>
                  <input type="radio" name={`sign-${expected.term}`} value={sign}
                    checked={entered?.sign === sign}
                    onChange={() => onAction({ type: 'editCashFlowRow', term: expected.term, sign })} />
                  <span>{sign === '-' ? '−' : '+'}</span>
                </label>)}
              </fieldset> : <span className="cashflow-sign">{status === 'locked' ? '—' : shownSign ?? '—'}</span>}</td>
              <td>{status === 'appCalculated' ? <span className="calculated-value">{shownAmount}</span>
                : status === 'locked' ? <span className="empty-value">—</span>
                : <div className="table-field">
                    <input id={id} type="text" inputMode="decimal" autoComplete="off"
                      aria-label={`Termin ${expected.term}, positivt beløb`}
                      value={shownAmount} placeholder="Positivt beløb" readOnly={!active}
                      onChange={(event) => onAction({ type: 'editCashFlowRow', term: expected.term, amount: event.target.value })}
                      aria-invalid={entered?.errorCode ? true : undefined}
                      aria-describedby={entered?.errorCode ? `${id}-feedback` : undefined} />
                    {status === 'approved' && <span className="field-approved" aria-label="Godkendt">✓</span>}
                    <ValidationMessage code={entered?.errorCode ?? null} id={`${id}-feedback`} />
                  </div>}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      {state.caseResult.cashFlows.map((row) => cashFlowRowStatus(state, row.term) === 'active' && !readOnly
        ? <div className="row-action" key={row.term}><span>Termin {row.term} er den aktive række.</span>
            <button className="button button-primary" type="button"
              onClick={() => onAction({ type: 'checkCashFlowRow', term: row.term })}>Kontrollér termin {row.term}</button>
          </div> : null)}
      {canCalculateRest && !state.effectiveInterest.remainingCalculated && !readOnly &&
        <div className="row-action"><span>De manuelle pengestrømme er godkendt.</span>
          <button className="button button-primary" type="button"
            onClick={() => onAction({ type: 'calculateRemainingCashFlows' })}>Beregn resten af betalingsrækken</button>
        </div>}
      {state.effectiveInterest.remainingCalculated && <p className="calculated-note" role="status">Resten af betalingsrækken er beregnet af appen.</p>}
    </div>
    <div className="work-card">
      <div className="work-card-heading">
        <p className="eyebrow">IA-beregning</p>
        <h3>Effektiv rente pr. termin</h3>
        <p>Appen beregner renten, når hele betalingsrækken er klar. Du skal ikke skrive IA(…).</p>
      </div>
      {state.effectiveInterest.rateCalculated
        ? <p className="effective-rate" role="status">{state.caseResult.effectiveInterest.displayedPercent.replace('.', ',')} % <small>pr. termin · 4 decimaler</small></p>
        : <button className="button button-primary" type="button"
            disabled={!state.effectiveInterest.remainingCalculated || readOnly}
            onClick={() => onAction({ type: 'calculateEffectiveRate' })}>Beregn effektiv rente</button>}
    </div>
  </div>;
}
