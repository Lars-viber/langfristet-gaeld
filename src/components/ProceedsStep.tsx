import Decimal from 'decimal.js';
import type { ProceedsField, StudentAction, StudentState } from '../student/types';
import { ManualCalculationField } from './ManualCalculationField';

function danishNumber(raw: string): string {
  const [whole, fraction] = raw.split('.');
  const grouped = (whole ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return fraction && fraction !== '00' ? `${grouped},${fraction}` : grouped;
}
function ratePercent(raw: string): string {
  return danishNumber(new Decimal(raw).times(100).toString());
}

interface ProceedsStepProps {
  state: StudentState;
  onAction(action: StudentAction): void;
  readOnly: boolean;
}

export function ProceedsStep({ state, onAction, readOnly }: ProceedsStepProps) {
  const input = state.generatedCase.caseInput;
  const order: ProceedsField[] = input.financingType === 'bank'
    ? ['variableCost', 'proceeds'] : ['marketValue', 'brokerage', 'proceeds'];
  const active = order.find((key) => !state.proceeds[key]?.approved);
  function given(symbol: string, label: string, value: string, unit = 'kr.') {
    return <div className="calculation-row given-row">
      <span className="calculation-sign" aria-hidden="true">{symbol}</span>
      <span className="calculation-label">{label}</span>
      <span className="calculation-work" />
      <strong className={unit ? 'calculation-amount' : 'calculation-assumption'}>{value}{unit && <> <span className="unit">{unit}</span></>}</strong>
      <span className="calculation-status" />
    </div>;
  }
  function assumption(symbol: string, label: string, value: string) {
    return <div className="calculation-row assumption-row">
      <span className="calculation-sign" aria-hidden="true">{symbol}</span>
      <span className="calculation-label">{label}</span>
      <strong className="calculation-work">{value}</strong>
      <span className="calculation-amount" />
      <span className="calculation-status" />
    </div>;
  }
  function manual(symbol: string, label: string, key: ProceedsField) {
    const calculation = state.caseResult.proceeds;
    const result = key === 'proceeds' ? calculation.proceeds
      : calculation.financingType === 'bank' ? calculation.variableCost
        : key === 'marketValue' ? calculation.marketValue : calculation.brokerage;
    return <div className={`calculation-row input-row ${key === 'proceeds' ? 'total-row' : ''}`} key={key}>
      <span className="calculation-sign" aria-hidden="true">{symbol}</span>
      <label className="calculation-label" htmlFor={`proceeds-${key}`}>{label}</label>
      <ManualCalculationField id={`proceeds-${key}`} label={label} field={state.proceeds[key]}
        active={active === key} readOnly={readOnly} feedbackContext={key === 'brokerage' ? 'brokerage' : 'default'}
        approvedResult={`${danishNumber(result.toFixed(2))} kr.`}
        variant="proceeds" placeholder={key === 'variableCost' || key === 'brokerage' ? 'Beregn et positivt beløb med =' : 'Beregn med ='}
        onChange={(raw) => onAction({ type: 'editProceedsFormula', field: key, raw })}
        onCheck={() => onAction({ type: 'checkProceedsField', field: key })} />
    </div>;
  }
  const completed = state.completedSteps.includes('proceeds');
  const canContinue = completed && !readOnly && state.sessionStatus === 'active' && state.currentStep === 'proceeds';
  return <div className="step-work proceeds-work">
    <aside className="proceeds-reference" aria-label="Grundlag for provenuberegning">
      <h2 id="step-heading">Provenu</h2>
      <p>Her arbejder du med lånets omkostninger og det beløb, virksomheden modtager.</p>
      <p className="proceeds-reference-note">Fradragets retning er allerede vist med −.</p>
      {canContinue && <button className="button button-primary proceeds-continue" type="button" onClick={() => onAction({ type: 'continueToNextStep' })}>Fortsæt til Ydelsesplan</button>}
    </aside>
    <div className="work-card proceeds-statement">
      <div className="calculation-stack">
        {given('', input.financingType === 'bank' ? 'Hovedstol' : 'Nominel hovedstol', danishNumber(input.nominalPrincipal))}
        {input.financingType === 'bank' ? <>
          {assumption('', 'Variabel omkostningssats', `${ratePercent(input.financingTerms.variableCostRate)} %`)}
          {manual('−', 'Variable låneomkostninger i kr.', 'variableCost')}
          {given('−', 'Faste låneomkostninger', danishNumber(input.financingTerms.fixedCost))}
          {manual('=', 'Provenu', 'proceeds')}
        </> : <>
          {assumption('×', 'Kurs', danishNumber(input.financingTerms.issuePrice))}
          {manual('=', 'Kursværdi', 'marketValue')}
          {assumption('', 'Kurtagesats', `${ratePercent(input.financingTerms.brokerageRate)} %`)}
          {manual('−', 'Kurtage i kr.', 'brokerage')}
          {given('−', 'Faste låneomkostninger', danishNumber(input.financingTerms.fixedCost))}
          {manual('=', 'Provenu', 'proceeds')}
        </>}
      </div>
    </div>
  </div>;
}
