import { STEP_COPY } from '../app/labels';
import { canEditStep } from '../student';
import type { StudentAction, StudentState } from '../student';
import { InitialRecognitionStep } from './InitialRecognitionStep';
import { ProceedsStep } from './ProceedsStep';
import { ContractScheduleStep } from './ContractScheduleStep';
import { EffectiveInterestStep } from './EffectiveInterestStep';
import { AmortizationStep } from './AmortizationStep';
import { BookkeepingStep } from './BookkeepingStep';

export function StepShell({ state, onAction }: { state: StudentState; onAction(action: StudentAction): void }) {
  const step = state.viewingStep;
  const copy = STEP_COPY[step];
  const readOnly = !canEditStep(state, step);
  return (
    <section className="step-shell card" aria-labelledby="step-heading">
      <div className="step-heading">
        <div className="step-number-large" aria-hidden="true">{String(copy.number).padStart(2, '0')}</div>
        <div>
          <p className="eyebrow">Trin {copy.number} af 8</p>
          <h2 id="step-heading">{copy.title}</h2>
          <p>{copy.description}</p>
        </div>
        <span className={`step-mode ${readOnly ? 'is-readonly' : ''}`}>{readOnly ? 'Kun visning' : 'Aktuelt trin'}</span>
      </div>
      {step === 'proceeds' ? <ProceedsStep state={state} onAction={onAction} readOnly={readOnly} />
        : step === 'initialRecognition' ? <InitialRecognitionStep state={state} onAction={onAction} readOnly={readOnly} />
        : step === 'contractSchedule' ? <ContractScheduleStep state={state} onAction={onAction} readOnly={readOnly} />
        : step === 'effectiveInterest' ? <EffectiveInterestStep state={state} onAction={onAction} readOnly={readOnly} />
        : step === 'amortizedCost' ? <AmortizationStep state={state} onAction={onAction} readOnly={readOnly} />
        : step === 'yearBookkeeping' ? <BookkeepingStep state={state} onAction={onAction} readOnly={readOnly} />
        : <div className="work-area table-scroll" role="group" aria-label={`Arbejdsområde for ${copy.title}`}>
          <div className="work-area-symbol" aria-hidden="true">{String(copy.number).padStart(2, '0')}</div>
          <div>
            <h3>Arbejdsområde</h3>
            <p>Her får du plads til beregninger og bogføring.</p>
          </div>
        </div>}
    </section>
  );
}
