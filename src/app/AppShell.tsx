import { useState } from 'react';
import { deriveCompletedSummary } from '../student';
import type { StudentAction, StudentState } from '../student';
import { LOAN_TYPE_LABELS } from './labels';
import { CaseHeader } from '../components/CaseHeader';
import { HistoricalBanner } from '../components/HistoricalBanner';
import { ProgressNav } from '../components/ProgressNav';
import { StepShell } from '../components/StepShell';

interface AppShellProps {
  state: StudentState;
  onAction(action: StudentAction): void;
  onReset(): void;
  onNewCase(): void;
}

export function AppShell({ state, onAction, onReset, onNewCase }: AppShellProps) {
  const [showCompletedWork, setShowCompletedWork] = useState(false);
  const historical = state.viewingStep !== state.currentStep;
  const summary = deriveCompletedSummary(state);
  const showWork = !summary || showCompletedWork;
  const money = (raw: string) => {
    const [whole, fraction = '00'] = raw.split('.');
    return `${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fraction.padEnd(2, '0')} kr.`;
  };
  return (
    <main id="main-content" className="app-layout">
      <div className="workspace-flow-header">
        <ProgressNav state={state} onAction={onAction} />
        <div className="workspace-actions">
          <button className="button button-secondary" type="button" onClick={onReset}>Start opgaven forfra</button>
          <button className="button button-secondary" type="button" onClick={onNewCase}>Ny opgave</button>
        </div>
      </div>
      <div className="case-overview">
        <section className="task-introduction" aria-labelledby="task-introduction-heading">
          <h2 id="task-introduction-heading">Opgavetekst</h2>
          <p>En klasse B-virksomhed har den {state.generatedCase.caseInput.issueDate.split('-').reverse().join('.')} optaget et lån. Lånets størrelse og betingelser fremgår af låneaftalen ved siden af. Lånet er uden for handelsbeholdningen. Første indregning sker til kostpris, og den efterfølgende måling sker til amortiseret kostpris. Første betaling sker efter én fuld termin. I det følgende skal du hjælpe virksomheden med at beregne og måle lånet og til sidst bogføre det i årsregnskabet for 2026.</p>
        </section>
        <CaseHeader state={state} />
      </div>
      {state.sessionStatus === 'completed' && (
        <div className="completed-banner" role="status"><span aria-hidden="true">✓</span> Niveau 1 gennemført</div>
      )}
      {summary && !showCompletedWork && <section className="completed-summary card" aria-labelledby="summary-heading">
        <div className="summary-heading"><div><p className="eyebrow">Dit resultat</p><h2 id="summary-heading">Niveau 1 er afsluttet</h2></div><span className="step-mode is-readonly">Kun visning</span></div>
        <dl>
          <div><dt>Lånetype</dt><dd>{LOAN_TYPE_LABELS[summary.loanType]}</dd></div>
          <div><dt>Finansiering</dt><dd>{summary.financingType === 'bank' ? 'Banklån' : 'Obligationslån'}</dd></div>
          <div><dt>Optagelsesdato</dt><dd>{summary.issueDate.split('-').reverse().join('.')}</dd></div>
          <div><dt>Løbetid</dt><dd>{summary.years} år</dd></div>
          <div><dt>Terminer pr. år</dt><dd>{summary.paymentsPerYear}</dd></div>
          <div><dt>Provenu</dt><dd>{money(summary.proceeds)}</dd></div>
          <div><dt>Effektiv rente pr. termin</dt><dd>{state.caseResult.effectiveInterest.rate.times(100).toFixed(4).replace('.', ',')} %</dd></div>
          <div><dt>Amortiseret kostpris pr. 31.12.2026</dt><dd>{money(summary.carryingAmount2026)}</dd></div>
          <div><dt>Kortfristet gæld</dt><dd>{money(summary.shortTerm)}</dd></div>
          <div><dt>Langfristet gæld</dt><dd>{money(summary.longTerm)}</dd></div>
        </dl>
        <button className="button button-primary" type="button" onClick={() => setShowCompletedWork(true)}>Se afsluttet opgave</button>
      </section>}
      {showWork && <>
        {historical && state.viewingStep !== 'contractSchedule' && state.viewingStep !== 'effectiveInterest' && <HistoricalBanner onReturn={() => onAction({ type: 'returnToCurrentStep' })} />}
        <StepShell state={state} onAction={onAction} />
      </>}
    </main>
  );
}
