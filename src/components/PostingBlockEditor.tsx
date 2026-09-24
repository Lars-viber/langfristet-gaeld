import type { AccountNumber } from '../domain';
import type { PostingBlockState } from '../student';
import type { DebitCreditSide, StudentPostingLine } from '../validation';
import { feedbackFor } from '../validation';

const ACCOUNTS: readonly { number: AccountNumber; name: string }[] = [
  { number: '4410', name: 'Renteudgift, bank, lån' },
  { number: '4450', name: 'Låneomkostninger/amortisering' },
  { number: '5820', name: 'Bankkonto' },
  { number: '6320', name: 'Lån hos kreditinstitutter' },
  { number: '6330', name: 'Obligationslån' },
  { number: '6760', name: 'Kortfristet del af langfristede gældsforpligtelser' },
];

function AccountSelect({ line, index, readOnly, onChange }: {
  line: StudentPostingLine; index: number; readOnly: boolean; onChange(account: AccountNumber): void;
}) {
  return <label className="posting-account">Konto
    <select value={line.account} disabled={readOnly} onChange={(event) => onChange(event.target.value as AccountNumber)}
      aria-label={`Konto, linje ${index + 1}`}>
      {ACCOUNTS.map(({ number, name }) => <option key={number} value={number}>{number} {name}</option>)}
    </select>
  </label>;
}

function DebitCreditControl({ line, index, readOnly, onChange }: {
  line: StudentPostingLine; index: number; readOnly: boolean; onChange(side: DebitCreditSide): void;
}) {
  return <label className="posting-side">D/K
    <select value={line.side} disabled={readOnly} onChange={(event) => onChange(event.target.value as DebitCreditSide)}
      aria-label={`Debet eller kredit, linje ${index + 1}`}>
      <option value="D">Debet</option>
      <option value="K">Kredit</option>
    </select>
  </label>;
}

interface PostingBlockEditorProps {
  block: PostingBlockState;
  readOnly: boolean;
  onChange(lines: StudentPostingLine[]): void;
  onCheck(): void;
}

export function PostingBlockEditor({ block, readOnly, onChange, onCheck }: PostingBlockEditorProps) {
  const locked = readOnly || block.approved;
  function update(index: number, changes: Partial<StudentPostingLine>) {
    onChange(block.lines.map((line, current) => current === index ? { ...line, ...changes } : line));
  }
  function add() {
    onChange([...block.lines, { account: '4410', side: 'D', amount: '' }]);
  }
  const messages = [...new Set(block.errors.map((error) => feedbackFor(error)))];
  return <form className="posting-editor" onSubmit={(event) => { event.preventDefault(); if (!locked) onCheck(); }}>
    <div className="posting-list" role="group" aria-label="Posteringslinjer">
      {block.lines.length === 0 && <p className="posting-empty">Tilføj den første posteringslinje.</p>}
      {block.lines.map((line, index) => <div className="posting-line" key={index}>
        <span className="posting-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
        <AccountSelect line={line} index={index} readOnly={locked} onChange={(account) => update(index, { account })} />
        <DebitCreditControl line={line} index={index} readOnly={locked} onChange={(side) => update(index, { side })} />
        <label className="posting-amount">Beløb
          <input type="text" inputMode="decimal" autoComplete="off" value={line.amount}
            aria-label={`Beløb, linje ${index + 1}`} placeholder="0,00" readOnly={locked}
            onChange={(event) => update(index, { amount: event.target.value })} />
        </label>
        {!locked && <button className="button button-text posting-delete" type="button"
          aria-label={`Slet linje ${index + 1}`}
          onClick={() => onChange(block.lines.filter((_, current) => current !== index))}>Slet linje</button>}
      </div>)}
    </div>
    {messages.length > 0 && <div className="posting-feedback" role="alert">
      {messages.map((message) => <p key={message}>{message}</p>)}
    </div>}
    <div className="posting-actions">
      {!locked && <>
        <button className="button button-secondary" type="button" onClick={add}>Tilføj linje</button>
        <button className="button button-primary" type="submit">Kontrollér postering</button>
      </>}
      {block.approved && <span className="approved-mark" role="status">✓ Hele posteringen godkendt</span>}
    </div>
  </form>;
}
