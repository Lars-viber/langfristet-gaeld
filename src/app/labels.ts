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
  contractSchedule: {
    number: 2, title: 'Ydelsesplan',
    description: 'Her opbygger du lånets kontraktmæssige betalingsplan.',
  },
  effectiveInterest: {
    number: 3, title: 'Effektiv rente',
    description: 'Her arbejder du med betalingsrækken og renten pr. termin.',
  },
  amortizedCost: {
    number: 4, title: 'Amortiseret kostpris',
    description: 'Her følger du renteomkostning og amortiseret kostpris.',
  },
  yearBookkeeping: {
    number: 6, title: 'Bogføring',
    description: 'Her samles bogføringen af optagelse, betalinger og amortisering.',
  },
  classification: {
    number: 5, title: 'Kort/lang',
    description: 'Her fordeler du gælden i en kortfristet og en langfristet del.',
  },
  completion: {
    number: 6, title: 'Bogføring',
    description: 'Intern state for saldoarbejdet i Bogføring.',
  },
  finalOverview: {
    number: 7, title: 'Afslutning',
    description: 'Her samles opgaven og afsluttes.',
  },
  initialRecognition: {
    number: 0, title: 'Optagelse',
    description: 'Intern bogføringsstate.',
  },
};
