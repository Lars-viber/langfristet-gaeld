import type { LoanType } from '../domain';
import type { StudentStep } from '../student';

export const LOAN_TYPE_LABELS: Record<LoanType, string> = {
  annuity: 'Annuitetslån',
  serial: 'Serielån',
  bullet: 'Stående lån',
};

export const STEP_COPY: Record<StudentStep, { number: number; title: string; description: string }> = {
  proceeds: {
    number: 1, title: 'Provenu',
    description: 'Her arbejder du med lånets omkostninger og det beløb, virksomheden modtager.',
  },
  initialRecognition: {
    number: 2, title: 'Optagelse',
    description: 'Her viser du lånets optagelse i bogføringen.',
  },
  contractSchedule: {
    number: 3, title: 'Ydelsesplan',
    description: 'Her opbygger du lånets kontraktmæssige betalingsplan.',
  },
  effectiveInterest: {
    number: 4, title: 'Effektiv rente',
    description: 'Her arbejder du med betalingsrækken og renten pr. termin.',
  },
  amortizedCost: {
    number: 5, title: 'Amortisering',
    description: 'Her følger du renteomkostning og amortiseret kostpris.',
  },
  yearBookkeeping: {
    number: 6, title: 'Bogføring',
    description: 'Her bogfører du årets betalinger og amortisering.',
  },
  classification: {
    number: 7, title: 'Kort/lang',
    description: 'Her fordeler du gælden i en kortfristet og en langfristet del.',
  },
  completion: {
    number: 8, title: 'Afslutning',
    description: 'Her samler du de sidste kontroller og afslutter niveauet.',
  },
};
