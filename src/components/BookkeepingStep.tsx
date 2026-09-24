import { deriveStudentView } from '../student';
import type { StudentAction, StudentState } from '../student';
import { PostingBlockEditor } from './PostingBlockEditor';

const dateLabel = (date: string) => date.split('-').reverse().join('.');
const money = (value: { toFixed(places: number): string }) => {
  const [whole, fraction] = value.toFixed(2).split('.');
  return `${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fraction}`;
};

export function BookkeepingStep({ state, onAction, readOnly }: {
  state: StudentState; onAction(action: StudentAction): void; readOnly: boolean;
}) {
  const view = deriveStudentView(state);
  const actual = state.caseResult.actual2026Terms;
  return <div className="step-work bookkeeping-work">
    <p className="posting-help">Bogfør hver faktisk betaling i 2026 og derefter den tilhørende amortisering. Angiv konto, D/K og et positivt beløb på hver linje. Hele blokken skal balancere.</p>
    <p className="term-count">{actual.length} {actual.length === 1 ? 'faktisk termin' : 'faktiske terminer'} i 2026</p>
    {actual.map((row) => {
      const saved = state.bookkeeping[row.term];
      if (!saved) return null;
      const active = view.activeBookkeepingTerm === row.term;
      const approved = saved.payment.approved && saved.amortization.approved;
      const visible = approved || active;
      const income = state.caseResult.incomeSchedule[row.term - 1];
      return <section className={`work-card term-bookkeeping ${approved ? 'is-approved' : ''}`} key={row.term} aria-label={`Bogføring termin ${row.term}`}>
        <div className="work-card-heading">
          <p className="eyebrow">Termin {row.term} · {dateLabel(row.date)}</p>
          <h3>Bogføring af termin {row.term}</h3>
          <p>{approved ? '✓ Hele terminen godkendt' : active ? 'Aktuel termin' : 'Afventer forrige termin'}</p>
        </div>
        {visible && <>
          <div className="bookkeeping-reference" aria-label={`Godkendt reference for termin ${row.term}`}>
            <strong>Reference fra dit tidligere arbejde</strong>
            <dl>
              <div><dt>Dato</dt><dd>{dateLabel(row.date)}</dd></div>
              <div><dt>Ydelse/betaling</dt><dd>{money(row.payment)} kr.</dd></div>
              <div><dt>Nominel rente</dt><dd>{money(row.nominalInterest)} kr.</dd></div>
              <div><dt>Afdrag</dt><dd>{money(row.principalRepayment)} kr.</dd></div>
              {income && <div><dt>Amortisering</dt><dd>{money(income.amortization)} kr.</dd></div>}
            </dl>
          </div>
          <div className="bookkeeping-block">
            <h4>1. Betaling {saved.payment.approved && <span className="block-status">✓ Godkendt · låst</span>}</h4>
            <PostingBlockEditor block={saved.payment} readOnly={readOnly || !active}
              onChange={(lines) => onAction({ type: 'setBookkeepingBlock', term: row.term, block: 'payment', lines })}
              onCheck={() => onAction({ type: 'checkBookkeepingBlock', term: row.term, block: 'payment' })} />
          </div>
          {saved.payment.approved ? <div className="bookkeeping-block">
            <h4>2. Amortisering {saved.amortization.approved && <span className="block-status">✓ Godkendt · låst</span>}</h4>
            <PostingBlockEditor block={saved.amortization} readOnly={readOnly || !active}
              onChange={(lines) => onAction({ type: 'setBookkeepingBlock', term: row.term, block: 'amortization', lines })}
              onCheck={() => onAction({ type: 'checkBookkeepingBlock', term: row.term, block: 'amortization' })} />
          </div> : <p className="block-waiting">Amortiseringsblokken åbner, når betalingsblokken er godkendt.</p>}
        </>}
      </section>;
    })}
  </div>;
}
