import { STEP_COPY } from '../app/labels';
import { STUDENT_STEPS, deriveStudentView } from '../student';
import type { StudentAction, StudentState, StudentStep } from '../student';

interface ProgressNavProps {
  state: StudentState;
  onAction(action: StudentAction): void;
}

export function ProgressNav({ state, onAction }: ProgressNavProps) {
  const view = deriveStudentView(state);
  function navigate(step: StudentStep): void {
    if (step === state.currentStep) onAction({ type: 'returnToCurrentStep' });
    else onAction({ type: 'viewHistoricalStep', step });
  }

  return (
    <nav className="progress-wrap" aria-label="Opgavens syv trin">
      <div className="progress-head"><p className="eyebrow">Dit forløb</p><span>{STUDENT_STEPS.filter((step) => state.completedSteps.includes(step)).length} af {STUDENT_STEPS.length} gennemført</span></div>
      <ol className="progress-list">
        {STUDENT_STEPS.map((step) => {
          const item = view.steps.find((entry) => entry.step === step)!;
          const copy = STEP_COPY[step];
          const isViewing = state.viewingStep === step;
          return (
            <li key={step}>
              <button
                type="button"
                className={`progress-step status-${item.status} ${isViewing ? 'is-viewing' : ''}`}
                disabled={!item.canView}
                aria-current={isViewing ? 'step' : undefined}
                onClick={() => navigate(step)}
              >
                <span className="progress-number">{item.status === 'completed' ? '✓' : copy.number}</span>
                <span className="progress-copy"><strong>{copy.title}</strong><small>{item.status === 'completed' ? 'Gennemført' : item.status === 'current' ? 'Aktuelt trin' : 'Låst'}</small></span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
