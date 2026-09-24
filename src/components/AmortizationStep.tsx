import type { BalanceField, IncomeField, StudentAction, StudentState } from '../student/types';
import { amortizationSubrowStatus, deriveStudentView } from '../student';
import { ValidationMessage } from './ValidationMessage';

type Subtable = 'income' | 'balance';
type Column = IncomeField | BalanceField;

const incomeColumns: IncomeField[] = ['nominalInterest', 'amortization', 'totalInterestExpense'];
const balanceColumns: BalanceField[] = ['openingCarryingAmount', 'principalRepayment', 'amortization', 'closingCarryingAmount'];
const labels: Record<Column, string> = {
  nominalInterest: 'Nominel rente', amortization: 'Amortisering',
  totalInterestExpense: 'Renteomkostning i alt', openingCarryingAmount: 'Kostpris primo',
  principalRepayment: 'Afdrag', closingCarryingAmount: 'Kostpris ultimo',
};
const dateLabel = (date: string) => date.split('-').reverse().join('.');
const money = (value: { toFixed(places: number): string }) => {
  const [whole, fraction] = value.toFixed(2).split('.');
  return `${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fraction}`;
};

export function AmortizationStep({ state, onAction, readOnly }: {
  state: StudentState; onAction(action: StudentAction): void; readOnly: boolean;
}) {
  const view = deriveStudentView(state);

  function table(subtable: Subtable) {
    const columns: Column[] = subtable === 'income' ? incomeColumns : balanceColumns;
    const title = subtable === 'income' ? 'Resultatopgørelsen' : 'Balancen';
    const rows = subtable === 'income' ? state.caseResult.incomeSchedule : state.caseResult.carryingSchedule;
    const activeTerm = view.activeAmortizationSubtable === subtable ? view.activeAmortizationTerm : null;
    return <section className={`work-card ${activeTerm !== null ? 'is-active-table' : ''}`} aria-label={title} key={subtable}>
      <div className="work-card-heading">
        <p className="eyebrow">{subtable === 'income' ? 'A · Renteomkostning' : 'B · Amortiseret kostpris'}</p>
        <h3>{title}</h3>
        <p>{activeTerm !== null ? `Du arbejder nu med termin ${activeTerm}.` : 'Termin 1 og 2 beregnes manuelt med =. Godkendte felter låses enkeltvis.'}</p>
      </div>
      <div className="table-scroll" role="region" aria-label={`Vandret rulbar tabel: ${title}`} tabIndex={0}>
        <table className="finance-table amortization-table">
          <thead><tr><th scope="col">Termin</th><th scope="col">Dato</th>
            {columns.map((column) => <th scope="col" key={column}>{labels[column]}</th>)}
          </tr></thead>
          <tbody>{rows.map((row) => {
            const status = amortizationSubrowStatus(state, row.term, subtable);
            const saved = state.amortization.terms[row.term]?.[subtable] as Partial<Record<Column, { raw: string; approved: boolean; errorCode: string | null }>> | undefined;
            return <tr key={row.term} className={`row-${status}`}>
              <th scope="row">{row.term}<span className="row-status">{status === 'approved' ? 'Godkendt' : status === 'appCalculated' ? 'Beregnet af appen' : status === 'active' ? 'Aktiv' : 'Afventer'}</span></th>
              <td>{dateLabel(row.date)}</td>
              {columns.map((column) => {
                const entry = saved?.[column];
                const id = `amortization-${subtable}-${row.term}-${column}`;
                return <td key={column}>
                  {status === 'appCalculated' ? <span className="calculated-value">{money(row[column as keyof typeof row] as { toFixed(places: number): string })}</span>
                    : status === 'locked' ? <span className="empty-value">—</span>
                      : <div className="table-field">
                        <input id={id} aria-label={`Termin ${row.term}, ${title}, ${labels[column]}`}
                          type="text" inputMode="decimal" autoComplete="off" spellCheck={false}
                          value={entry?.raw ?? ''} placeholder="= …" readOnly={readOnly || Boolean(entry?.approved)}
                          onChange={(event) => onAction({ type: 'editAmortizationField', term: row.term, subtable, field: column, raw: event.target.value })}
                          aria-invalid={entry?.errorCode ? true : undefined}
                          aria-describedby={entry?.errorCode ? `${id}-feedback` : undefined} />
                        {entry?.approved && <span className="field-approved">✓ Godkendt</span>}
                        <ValidationMessage code={entry?.errorCode as Parameters<typeof ValidationMessage>[0]['code'] ?? null} id={`${id}-feedback`} />
                      </div>}
                </td>;
              })}
            </tr>;
          })}</tbody>
        </table>
      </div>
      {activeTerm !== null && !readOnly && <div className="row-action">
        <span>Termin {activeTerm}: {columns.filter((column) => state.amortization.terms[activeTerm]?.[subtable]?.[column as IncomeField & BalanceField]?.approved).length} af {columns.length} felter godkendt</span>
        <button className="button button-primary" type="button" onClick={() => onAction({ type: 'checkAmortizationSubrow', term: activeTerm, subtable })}>
          Kontrollér {title.toLowerCase()} termin {activeTerm}
        </button>
      </div>}
    </section>;
  }

  const manualApproved = state.amortization.terms[1]?.approved && state.amortization.terms[2]?.approved;
  return <div className="step-work amortization-work">
    <p className="calculation-help">Beregn først renteomkostning og amortisering for termin 1, og derefter kostpris ultimo. Gentag for termin 2. Brug <strong>[Effektiv rente · fuld præcision]</strong> i formlen, når du henviser til renten fra trin 4.</p>
    {table('income')}
    {table('balance')}
    {manualApproved && !state.amortization.remainingCalculated && !readOnly && <div className="row-action">
      <span>Resultat og balance for termin 1 og 2 er godkendt.</span>
      <button className="button button-primary" type="button" onClick={() => onAction({ type: 'calculateRemainingAmortization' })}>
        Beregn resterende terminer efter samme princip
      </button>
    </div>}
    {state.amortization.remainingCalculated && <p className="calculated-note" role="status">Resterende terminer: Beregnet af appen efter samme princip.</p>}
  </div>;
}
