import { STEP_COPY } from '../app/labels';
import { canEditStep, STUDENT_STEPS } from '../student';
import type { StudentAction, StudentState } from '../student';
import { ProceedsStep } from './ProceedsStep';
import { ContractScheduleStep } from './ContractScheduleStep';
import { EffectiveInterestStep } from './EffectiveInterestStep';
import { AmortizationStep } from './AmortizationStep';
import { BookkeepingStep } from './BookkeepingStep';
import { ClassificationStep } from './ClassificationStep';
import { CompletionStep } from './CompletionStep';

export function StepShell({ state, onAction }: { state: StudentState; onAction(action: StudentAction): void }) {
  const step = state.viewingStep;
  const copy = STEP_COPY[step];
  const readOnly = !canEditStep(state, step);
  const historical = state.viewingStep !== state.currentStep;
  const steps = STUDENT_STEPS;
  const nextStep = steps[steps.indexOf(step as typeof STUDENT_STEPS[number]) + 1];
  const canContinue = state.sessionStatus === 'active' && state.viewingStep === state.currentStep
    && state.completedSteps.includes(step) && nextStep !== undefined;
  return (
    <section className="step-shell card" aria-labelledby="step-heading">
      {step !== 'proceeds' && step !== 'contractSchedule' && step !== 'effectiveInterest' && step !== 'amortizedCost' && step !== 'classification' && <div className="step-heading">
        <div className="step-number-large" aria-hidden="true">{String(copy.number).padStart(2, '0')}</div>
        <div>
          <p className="eyebrow">Trin {copy.number} af 8</p>
          <h2 id="step-heading">{copy.title}</h2>
          <p>{copy.description}</p>
        </div>
        {historical ? <div className="step-history-inline"><span>Du ser et tidligere trin. Trinnet er skrivebeskyttet.</span><button className="button button-secondary" type="button" onClick={() => onAction({ type: 'returnToCurrentStep' })}>Tilbage til aktuelt trin</button></div>
          : <span className={`step-mode ${readOnly ? 'is-readonly' : ''}`}>{readOnly ? 'Kun visning' : 'Aktuelt trin'}</span>}
      </div>}
      {step === 'proceeds' ? <ProceedsStep state={state} onAction={onAction} readOnly={readOnly} />
        : step === 'contractSchedule' ? <ContractScheduleStep state={state} onAction={onAction} readOnly={readOnly} />
        : step === 'effectiveInterest' ? <EffectiveInterestStep state={state} onAction={onAction} readOnly={readOnly} />
        : step === 'amortizedCost' ? <AmortizationStep state={state} onAction={onAction} readOnly={readOnly} />
        : step === 'yearBookkeeping' ? <BookkeepingStep state={state} onAction={onAction} readOnly={readOnly} />
        : step === 'classification' ? <ClassificationStep state={state} onAction={onAction} readOnly={readOnly} />
        : step === 'completion' ? <CompletionStep state={state} onAction={onAction} readOnly={readOnly} />
        : <div className="work-area table-scroll" role="group" aria-label={`Arbejdsområde for ${copy.title}`}>
          <div className="work-area-symbol" aria-hidden="true">{String(copy.number).padStart(2, '0')}</div>
          <div>
            <h3>Arbejdsområde</h3>
            <p>Her får du plads til beregninger og bogføring.</p>
          </div>
        </div>}
      {canContinue && step !== 'proceeds' && step !== 'contractSchedule' && step !== 'effectiveInterest' && step !== 'amortizedCost' && step !== 'classification' && <div className="step-continue"><span>Trinnet er godkendt. Du vælger selv, hvornår du fortsætter.</span><button className="button button-primary" type="button" onClick={() => onAction({ type: 'continueToNextStep' })}>Fortsæt til {STEP_COPY[nextStep].title}</button></div>}
    </section>
  );
}
