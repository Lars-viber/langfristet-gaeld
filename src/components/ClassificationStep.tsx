import { classificationStage } from '../student';
import type { ClassificationField, StudentAction, StudentState } from '../student/types';
import { ManualCalculationField } from './ManualCalculationField';
import { PostingBlockEditor } from './PostingBlockEditor';
import { ValidationMessage } from './ValidationMessage';

const dateLabel = (date: string) => date.split('-').reverse().join('.');
const stages = ['carrying', 'upcoming', 'shortTerm', 'longTerm', 'reconcile', 'reclassification', 'noReclassification', 'done'] as const;

export function ClassificationStep({ state, onAction, readOnly }: {
  state: StudentState; onAction(action: StudentAction): void; readOnly: boolean;
}) {
  const stage = classificationStage(state);
  const reached = (name: typeof stages[number]) => readOnly || stages.indexOf(stage) >= stages.indexOf(name);
  const rows = state.caseResult.contract.rows.filter((row) => row.date > '2026-12-31' && row.date <= '2027-12-31');
  const positive = state.caseResult.classification.reclassificationRequired;
  const field = (name: ClassificationField, label: string, active: boolean) =>
    <ManualCalculationField id={`classification-${name}`} label={label} field={state.classification.fields[name]}
      active={active} readOnly={readOnly} onChange={(raw) => onAction({ type: 'editClassificationField', field: name, raw })}
      onCheck={() => onAction({ type: 'checkClassificationField', field: name })} />;

  return <div className="step-work classification-work">
    <p className="calculation-help">Kortfristet gæld er summen af kontraktuelle <strong>hovedstolsafdrag</strong> med forfald efter 31.12.2026 og senest 31.12.2027. Brug hverken hele ydelsen, renter eller amortisering. Du kan slå afdragene op i din godkendte ydelsesplan.</p>
    <section className="work-card" aria-labelledby="classification-heading">
      <div className="work-card-heading"><p className="eyebrow">A · Fordeling pr. 31.12.2026</p><h3 id="classification-heading">Kortfristet og langfristet del</h3></div>
      <div className="classification-fields">
        <div className="classification-entry">
          <label htmlFor="classification-carryingAmount">Samlet amortiseret kostpris pr. 31.12.2026</label>
          <div className="manual-field-controls">
            <input id="classification-carryingAmount" type="text" inputMode="decimal" autoComplete="off"
              value={state.classification.fields.carryingAmount?.raw ?? ''} placeholder="Beløb fra balancen"
              readOnly={readOnly || Boolean(state.classification.fields.carryingAmount?.approved)}
              aria-invalid={state.classification.fields.carryingAmount?.errorCode ? true : undefined}
              onChange={(event) => onAction({ type: 'editClassificationField', field: 'carryingAmount', raw: event.target.value })} />
            {!readOnly && !state.classification.fields.carryingAmount?.approved && <button className="button button-primary" type="button" onClick={() => onAction({ type: 'checkClassificationField', field: 'carryingAmount' })}>Kontrollér</button>}
            {state.classification.fields.carryingAmount?.approved && <span className="approved-mark">✓ Godkendt</span>}
          </div>
          <ValidationMessage code={state.classification.fields.carryingAmount?.errorCode ?? null} id="classification-carrying-feedback" />
        </div>
        {reached('upcoming') && <div className="upcoming-repayments">
          <h4>Afdrag med forfald i 2027</h4>
          {rows.length === 0 && <p>Ingen kontraktuelle terminer i perioden.</p>}
          {rows.map((row) => {
            const saved = state.classification.upcomingRepayments[row.term];
            return <div className="repayment-row" key={row.term}>
              <label htmlFor={`repayment-${row.term}`}>Termin {row.term} · {dateLabel(row.date)}<small>Kontraktuelt hovedstolsafdrag</small></label>
              <div className="repayment-controls">
                <input id={`repayment-${row.term}`} type="text" inputMode="decimal" autoComplete="off"
                  value={saved?.raw ?? ''} placeholder="Afdrag fra ydelsesplanen"
                  readOnly={readOnly || Boolean(saved?.approved)}
                  aria-invalid={saved?.errorCode ? true : undefined}
                  onChange={(event) => onAction({ type: 'editUpcomingRepayment', term: row.term, raw: event.target.value })} />
                {!readOnly && !saved?.approved && <button className="button button-secondary" type="button" onClick={() => onAction({ type: 'checkUpcomingRepayment', term: row.term })}>Kontrollér</button>}
                {saved?.approved && <span className="approved-mark">✓ Godkendt</span>}
              </div>
              <ValidationMessage code={saved?.errorCode ?? null} id={`repayment-${row.term}-feedback`} />
            </div>;
          })}
        </div>}
        {reached('shortTerm') && field('shortTerm', 'Kortfristet del = summen af afdragene i perioden', stage === 'shortTerm')}
        {reached('longTerm') && field('longTerm', 'Langfristet del = amortiseret kostpris − kortfristet del', stage === 'longTerm')}
        {reached('reconcile') && <div className="classification-reconcile">
          <strong>Afstemning</strong><p>Kortfristet + langfristet − samlet amortiseret kostpris = 0,00 kr.</p>
          {!readOnly && !state.classification.reconciled && <button className="button button-primary" type="button" onClick={() => onAction({ type: 'checkClassification' })}>Kontrollér fordeling</button>}
          {state.classification.reconciled && <span className="approved-mark">✓ Fordelingen stemmer</span>}
        </div>}
      </div>
    </section>
    {state.classification.reconciled && <section className="work-card" aria-labelledby="reclassification-heading">
      <div className="work-card-heading"><p className="eyebrow">B · Omklassifikation</p><h3 id="reclassification-heading">Skal gælden omklassificeres?</h3></div>
      {positive ? <>
        <p className="posting-help">Den kortfristede del er positiv. Bogfør omklassifikationen med Debet 6320/6330 og Kredit 6760. Angiv positive beløb og D/K for hver linje.</p>
        <PostingBlockEditor block={state.classification.reclassification} readOnly={readOnly}
          onChange={(lines) => onAction({ type: 'setReclassificationBlock', lines })}
          onCheck={() => onAction({ type: 'checkReclassification' })} />
      </> : <>
        <p>Den kortfristede del er nul. Vælg, om der skal bogføres en omklassifikation.</p>
        <div className="answer-options" role="group" aria-label="Omklassifikation ved nul kortfristet del">
          {(['yes', 'no'] as const).map((answer) => <label key={answer}>
            <input type="radio" name="reclassification-answer" value={answer} disabled={readOnly}
              checked={state.classification.reclassificationAnswer === answer}
              onChange={() => onAction({ type: 'setReclassificationAnswer', answer })} />
            {answer === 'yes' ? 'Ja' : 'Nej'}
          </label>)}
        </div>
        <ValidationMessage code={state.classification.answerErrorCode} id="reclassification-answer-feedback" />
        {!readOnly && <button className="button button-primary" type="button" onClick={() => onAction({ type: 'checkReclassificationAnswer' })}>Kontrollér svar</button>}
        {readOnly && state.classification.reclassificationAnswer === 'no' && <p className="calculated-note">Ingen omklassifikation bogført.</p>}
      </>}
    </section>}
  </div>;
}
