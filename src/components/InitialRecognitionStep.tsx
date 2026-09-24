import type { StudentAction, StudentState } from '../student';
import { PostingBlockEditor } from './PostingBlockEditor';

export function InitialRecognitionStep({ state, onAction, readOnly }: {
  state: StudentState; onAction(action: StudentAction): void; readOnly: boolean;
}) {
  return <div className="step-work recognition-work">
    <div className="work-card">
      <div className="work-card-heading">
        <p className="eyebrow">Samlet posteringsblok</p>
        <h3>Lånets optagelse</h3>
        <p>Bogfør lånets optagelse.</p>
      </div>
      <p className="posting-help">Angiv konto, Debet/Kredit og et positivt beløb på hver linje. Debet og kredit skal balancere.</p>
      <PostingBlockEditor block={state.initialRecognition} readOnly={readOnly}
        onChange={(lines) => onAction({ type: 'setInitialRecognitionLines', lines })}
        onCheck={() => onAction({ type: 'checkInitialRecognition' })} />
    </div>
  </div>;
}
