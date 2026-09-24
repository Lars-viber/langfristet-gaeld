import Decimal from 'decimal.js';
import type { StudentState } from '../student';
import { LOAN_TYPE_LABELS } from '../app/labels';

function danishDecimal(value: string): string {
  const [whole, fraction] = value.split('.');
  const grouped = (whole ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return fraction ? `${grouped},${fraction}` : grouped;
}

export function CaseHeader({ state }: { state: StudentState }) {
  const input = state.generatedCase.caseInput;
  const details = [
    ['Lånetype', LOAN_TYPE_LABELS[input.loanType]],
    ['Finansiering', input.financingType === 'bank' ? 'Banklån' : 'Obligationslån'],
    ['Hovedstol', `${danishDecimal(input.nominalPrincipal)} kr.`],
    ['Lånedato', input.issueDate.split('-').reverse().join('.')],
    ['Løbetid', `${input.years} år`],
    ['Terminer pr. år', String(input.paymentsPerYear)],
    ['Nominel rente', `${danishDecimal(new Decimal(input.nominalAnnualRate).times(100).toString())} % p.a.`],
  ];
  return (
    <section className="case-header card" aria-labelledby="case-heading">
      <div className="case-header-title">
        <div><p className="eyebrow">Din case</p><h2 id="case-heading">Låneaftalen</h2></div>
      </div>
      <dl className="case-details">
        {details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
    </section>
  );
}
