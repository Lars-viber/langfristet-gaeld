import type { StudentAction, StudentState } from '../student';
import { CaseHeader } from '../components/CaseHeader';
import { ProgressNav } from '../components/ProgressNav';
import { StepShell } from '../components/StepShell';

interface AppShellProps {
  state: StudentState;
  onAction(action: StudentAction): void;
  onReset(): void;
  onNewCase(): void;
}

export function AppShell({ state, onAction, onReset, onNewCase }: AppShellProps) {
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
      <StepShell state={state} onAction={onAction} />
    </main>
  );
}
