import { classificationRepaymentCount, classificationStage } from '../student';
import type { StudentAction, StudentState } from '../student/types';
import { ValidationMessage } from './ValidationMessage';

const dateLabel = (date: string) => date.split('-').reverse().join('.');
const money = (value: { toFixed(places: number): string }) => {
  const [whole, fraction] = value.toFixed(2).split('.');
  return `${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fraction}`;
};

export function ClassificationStep({ state, onAction, readOnly }: {
  state: StudentState; onAction(action: StudentAction): void; readOnly: boolean;
}) {
  const stage = classificationStage(state);
  const historical = state.viewingStep !== state.currentStep;
  const model = state.caseResult.classification;
  const repaymentCount = classificationRepaymentCount(state);
  const zeroShortTerm = repaymentCount === 0;
  const short = state.classification.fields.shortTerm;
  const long = state.classification.fields.longTerm;
  const canContinue = state.completedSteps.includes('classification') && !readOnly && !historical;

  return <div className="step-work classification-work r5-classification-work">
    <aside className="classification-reference" aria-label="Vejledning til kort/lang">
      <h2 id="step-heading">Kort/lang</h2>
      <p>Opdel den amortiserede kostpris pr. 31.12.2026 i kortfristet og langfristet del.</p>
      <dl><div><dt>Klassifikationsdato</dt><dd>31.12.2026</dd></div></dl>
      {historical && <p className="classification-history-note" role="status">Du ser et tidligere trin. Trinnet er skrivebeskyttet.</p>}
      {historical ? <button className="button button-secondary classification-continue" type="button"
        onClick={() => onAction({ type: 'returnToCurrentStep' })}>Tilbage til aktuelt trin</button>
        : canContinue && <button className="button button-primary classification-continue" type="button"
          onClick={() => onAction({ type: 'continueToNextStep' })}>Fortsæt til Bogføring</button>}
    </aside>
    <div className="classification-main">
      <section className="work-card classification-balance-card" aria-label="Godkendt Balance fra amortiseret kostpris">
        <h3>Balance · godkendt</h3>
        <p>Find i balancetabellen de kontraktuelle afdrag, der forfalder efter 31.12.2026 og senest 31.12.2027.</p>
        <div className="table-scroll classification-balance-scroll" role="region" aria-label="Vandret rulbar godkendt balancetabel" tabIndex={0}>
          <table className="finance-table classification-balance-table"><thead><tr>
            <th scope="col">Termin</th><th scope="col">Dato</th><th scope="col">Kostpris primo</th>
            <th scope="col">Afdrag</th><th scope="col">Amortisering</th><th scope="col">Kostpris ultimo</th>
          </tr></thead><tbody>{state.caseResult.carryingSchedule.map((row) => <tr key={row.term}>
            <th scope="row">{row.term}</th><td>{dateLabel(row.date)}</td>
            <td>{money(row.openingCarryingAmount)}</td><td>{money(row.principalRepayment)}</td>
            <td>{money(row.amortization)}</td><td>{money(row.closingCarryingAmount)}</td>
          </tr>)}</tbody></table>
        </div>
      </section>
      <section className="work-card classification-statement" aria-label="Opdeling i kort og lang gæld">
        <h3>Kortfristet og langfristet del</h3>
        <div className="classification-statement-row">
          <span>Amortiseret kostpris pr. 31.12.2026</span>
          <strong className="classification-money">{money(model.carryingAmount)} kr.</strong>
        </div>
        <div className="classification-statement-row">
          <label htmlFor={zeroShortTerm ? undefined : 'classification-shortTerm'}><span aria-hidden="true">− </span>Kortfristet del</label>
          {zeroShortTerm ? <div className="classification-amount-cell">
            {short?.approved ? <><strong className="classification-money">0,00 kr.</strong><span className="classification-approved" aria-label="Godkendt">✓</span></>
              : <div className="classification-zero-answer">
                <p>Forfalder der afdrag på hovedstolen i perioden 01.01.2027–31.12.2027?</p>
                <div role="group" aria-label="Afdrag i 2027">{(['yes', 'no'] as const).map((answer) =>
                  <label key={answer}><input type="radio" name="short-term-answer" value={answer} disabled={readOnly}
                    checked={state.classification.shortTermAnswer === answer}
                    onChange={() => onAction({ type: 'setShortTermAnswer', answer })} />{answer === 'yes' ? 'Ja' : 'Nej'}</label>)}</div>
                {!readOnly && <button className="button button-secondary" type="button" onClick={() => onAction({ type: 'checkShortTermAnswer' })}>Kontrollér svar</button>}
                <ValidationMessage code={state.classification.answerErrorCode} id="classification-short-answer-feedback" />
              </div>}
          </div> : <div className="classification-amount-cell">
            <input id="classification-shortTerm" aria-label="Kortfristet del" type="text" inputMode="decimal" autoComplete="off" spellCheck={false}
              value={short?.raw ?? ''} placeholder={repaymentCount === 1 ? 'Indtast beløb' : 'Beregn et positivt beløb med ='} readOnly={readOnly || Boolean(short?.approved)}
              aria-invalid={short?.errorCode ? true : undefined}
              onChange={(event) => onAction({ type: 'editClassificationField', field: 'shortTerm', raw: event.target.value })} />
            {!readOnly && !short?.approved && <button className="button button-secondary" type="button"
              onClick={() => onAction({ type: 'checkClassificationField', field: 'shortTerm' })}>Kontrollér</button>}
            {short?.approved && <span className="classification-approved" aria-label="Godkendt">✓</span>}
            {short?.approved && <strong className="classification-money">{money(model.shortTerm)} kr.</strong>}
            <ValidationMessage code={short?.errorCode ?? null} id="classification-short-feedback" context={repaymentCount > 1 ? 'classificationSum' : 'default'} />
          </div>}
        </div>
        <div className="classification-statement-row classification-long-row">
          <label htmlFor="classification-longTerm"><span aria-hidden="true">= </span>Langfristet del</label>
          <div className="classification-amount-cell">
            <input id="classification-longTerm" aria-label="Langfristet del" type="text" inputMode="decimal" autoComplete="off" spellCheck={false}
              value={long?.raw ?? ''} placeholder={stage === 'shortTerm' ? 'Afventer kortfristet del' : 'Beregn et positivt beløb med ='}
              disabled={stage === 'shortTerm'} readOnly={readOnly || Boolean(long?.approved)}
              aria-invalid={stage !== 'shortTerm' && long?.errorCode ? true : undefined}
              onChange={(event) => onAction({ type: 'editClassificationField', field: 'longTerm', raw: event.target.value })} />
            {!readOnly && stage === 'longTerm' && <button className="button button-primary" type="button"
              onClick={() => onAction({ type: 'checkClassificationField', field: 'longTerm' })}>Kontrollér</button>}
            {long?.approved && <span className="classification-approved" aria-label="Godkendt">✓</span>}
            {long?.approved && <strong className="classification-money">{money(model.longTerm)} kr.</strong>}
            <ValidationMessage code={stage === 'shortTerm' ? null : long?.errorCode ?? null} id="classification-long-feedback" />
          </div>
        </div>
      </section>
    </div>
  </div>;
}
