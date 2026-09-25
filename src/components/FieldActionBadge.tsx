export type FieldAction = 'oplyst' | 'indtast' | 'beregn' | 'app' | 'amount';

const copy: Record<FieldAction, string> = {
  oplyst: 'Oplyst',
  indtast: 'Indtast',
  beregn: 'Beregn med =',
  app: 'App-beregning',
  amount: 'Indtast beløb – = kan bruges',
};

export function FieldActionBadge({ action, detail }: { action: FieldAction; detail?: string }) {
  return <span className={`field-action field-action-${action}`}>{copy[action]}{detail ? ` · ${detail}` : ''}</span>;
}
