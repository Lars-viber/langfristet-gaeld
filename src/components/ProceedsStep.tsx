import Decimal from 'decimal.js';
import type { ProceedsField, StudentAction, StudentState } from '../student/types';
import { ManualCalculationField } from './ManualCalculationField';
import { FieldActionBadge } from './FieldActionBadge';

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
      <span className="calculation-label">{label}<FieldActionBadge action="oplyst" /></span>
      <strong>{value} <span className="unit">{unit}</span></strong>
    </div>;
  }
  function manual(symbol: string, label: string, key: ProceedsField) {
    const calculation = state.caseResult.proceeds;
    const result = key === 'proceeds' ? calculation.proceeds
      : calculation.financingType === 'bank' ? calculation.variableCost
        : key === 'marketValue' ? calculation.marketValue : calculation.brokerage;
    return <div className={`calculation-row input-row ${key === 'proceeds' ? 'total-row' : ''}`} key={key}>
      <span className="calculation-sign" aria-hidden="true">{symbol}</span>
      <ManualCalculationField id={`proceeds-${key}`} label={label} field={state.proceeds[key]}
        active={active === key} readOnly={readOnly} feedbackContext={key === 'brokerage' ? 'brokerage' : 'default'}
        approvedResult={`${danishNumber(result.toFixed(2))} kr.`}
        onChange={(raw) => onAction({ type: 'editProceedsFormula', field: key, raw })}
        onCheck={() => onAction({ type: 'checkProceedsField', field: key })} />
    </div>;
  }
  const completed = state.completedSteps.includes('proceeds');
  return <div className="step-work proceeds-work">
    <aside className="proceeds-reference" aria-label="Grundlag for provenuberegning">
      <p className="eyebrow">Grundlag</p>
      <h3>Beregn provenu</h3>
      <p>Arbejd lodret i opstillingen. Fradragets retning er allerede vist med −.</p>
      <p><strong>Din opgave:</strong> {input.financingType === 'bank' ? 'Beregn omkostningerne og provenuet.' : 'Beregn kursværdi, kurtage og provenuet.'}</p>
    </aside>
    <div className="work-card proceeds-statement">
      <div className="work-card-heading">
        <p className="eyebrow">Regneopstilling</p>
        <h3>Provenu</h3>
        <p>{input.financingType === 'bank' ? 'Beregn omkostningerne og det beløb, virksomheden modtager.' : 'Beregn kursværdi, kurtage og det beløb, virksomheden modtager.'}</p>
      </div>
      <p className="calculation-help">Beregn et positivt beløb med =. Fortegnet fremgår af opstillingen.</p>
      <div className="calculation-stack">
        {given('', input.financingType === 'bank' ? 'Hovedstol' : 'Nominel hovedstol', danishNumber(input.nominalPrincipal))}
        {input.financingType === 'bank' ? <>
          <div className="given-detail">Variabel omkostningssats <strong>{ratePercent(input.financingTerms.variableCostRate)} %</strong> <FieldActionBadge action="oplyst" /></div>
          {manual('−', 'Variable låneomkostninger i kr.', 'variableCost')}
          {given('−', 'Faste låneomkostninger', danishNumber(input.financingTerms.fixedCost))}
          {manual('=', 'Provenu', 'proceeds')}
        </> : <>
          {given('×', 'Kurs', danishNumber(input.financingTerms.issuePrice), '')}
          {manual('=', 'Kursværdi', 'marketValue')}
          <div className="given-detail">Kurtagesats <strong>{ratePercent(input.financingTerms.brokerageRate)} %</strong> <FieldActionBadge action="oplyst" /></div>
          {manual('−', 'Kurtage i kr.', 'brokerage')}
          {given('−', 'Faste låneomkostninger', danishNumber(input.financingTerms.fixedCost))}
          {manual('=', 'Provenu', 'proceeds')}
        </>}
      </div>
      {completed && <div className="continue-panel" role="status"><strong>Trin 1 er godkendt.</strong><span> Din opstilling bliver stående, indtil du aktivt fortsætter.</span></div>}
    </div>
  </div>;
}
