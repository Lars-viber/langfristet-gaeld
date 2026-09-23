export const financingTypes = ['bank', 'bond'] as const;
export const principals = [
  '6500000', '7000000', '7500000', '8000000', '8500000', '9000000',
  '9500000', '10000000', '10500000', '11000000', '11500000', '12000000',
] as const;
export const years = [4, 5] as const;
export const paymentsPerYear = [1, 2, 4] as const;
export const annualRates = ['0.04', '0.05', '0.06', '0.07', '0.08', '0.09', '0.10'] as const;
export const openingBankBalances = ['500000', '750000', '1000000', '1250000', '1500000'] as const;
export const issueDates = ['2026-01-01', '2026-07-01'] as const;
export const bankVariableRates = ['0.01', '0.015', '0.02', '0.025', '0.03'] as const;
export const bankFixedCosts = ['50000', '100000', '150000', '200000'] as const;
export const bondIssuePrices = ['96', '97', '98', '99'] as const;
export const bondBrokerageRates = ['0.005', '0.01', '0.015'] as const;
export const bondFixedCosts = ['50000', '100000', '150000'] as const;
