import type { StudentAction, StudentState } from '../student';
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
  const historical = state.viewingStep !== state.currentStep;
  return (
    <main id="main-content" className="app-layout">
      <div className="workspace-top">
        <div>
          <p className="eyebrow">Langfristet gæld · Niveau 1</p>
          <h1>{state.sessionStatus === 'completed' ? 'Din afsluttede opgave' : 'Din opgave'}</h1>
        </div>
        <div className="workspace-actions">
          <button className="button button-text" type="button" onClick={onReset}>Start opgaven forfra</button>
          <button className="button button-secondary" type="button" onClick={onNewCase}>Ny opgave</button>
        </div>
      </div>
      <CaseHeader state={state} />
      <ProgressNav state={state} onAction={onAction} />
      {historical && <HistoricalBanner onReturn={() => onAction({ type: 'returnToCurrentStep' })} />}
      {state.sessionStatus === 'completed' && (
        <div className="completed-banner" role="status"><span aria-hidden="true">✓</span> Niveau 1 gennemført</div>
      )}
      <StepShell state={state} />
    </main>
  );
}
