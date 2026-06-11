export type BankFieldType = 'india' | 'iban' | 'routing' | 'bsb' | 'generic'

export interface CountryDefaults {
  currency:   string
  taxLabel:   string
  taxRate:    number
  bankFields: BankFieldType
  locale:     string
  dateFormat: string
}

export const COUNTRY_DEFAULTS: Record<string, CountryDefaults> = {
  IN: { currency: 'INR', taxLabel: 'GST',      taxRate: 18, bankFields: 'india',   locale: 'en-IN', dateFormat: 'DD/MM/YYYY' },
  US: { currency: 'USD', taxLabel: 'Sales Tax', taxRate: 0,  bankFields: 'routing', locale: 'en-US', dateFormat: 'MM/DD/YYYY' },
  GB: { currency: 'GBP', taxLabel: 'VAT',       taxRate: 20, bankFields: 'iban',    locale: 'en-GB', dateFormat: 'DD/MM/YYYY' },
  AU: { currency: 'AUD', taxLabel: 'GST',       taxRate: 10, bankFields: 'bsb',     locale: 'en-AU', dateFormat: 'DD/MM/YYYY' },
  CA: { currency: 'CAD', taxLabel: 'GST/HST',   taxRate: 5,  bankFields: 'routing', locale: 'en-CA', dateFormat: 'DD/MM/YYYY' },
  AE: { currency: 'AED', taxLabel: 'VAT',       taxRate: 5,  bankFields: 'iban',    locale: 'en-AE', dateFormat: 'DD/MM/YYYY' },
  SG: { currency: 'SGD', taxLabel: 'GST',       taxRate: 9,  bankFields: 'generic', locale: 'en-SG', dateFormat: 'DD/MM/YYYY' },
  DE: { currency: 'EUR', taxLabel: 'MwSt.',     taxRate: 19, bankFields: 'iban',    locale: 'de-DE', dateFormat: 'DD.MM.YYYY' },
  FR: { currency: 'EUR', taxLabel: 'TVA',       taxRate: 20, bankFields: 'iban',    locale: 'fr-FR', dateFormat: 'DD/MM/YYYY' },
  NL: { currency: 'EUR', taxLabel: 'BTW',       taxRate: 21, bankFields: 'iban',    locale: 'nl-NL', dateFormat: 'DD/MM/YYYY' },
  NZ: { currency: 'NZD', taxLabel: 'GST',       taxRate: 15, bankFields: 'bsb',     locale: 'en-NZ', dateFormat: 'DD/MM/YYYY' },
  ZA: { currency: 'ZAR', taxLabel: 'VAT',       taxRate: 15, bankFields: 'generic', locale: 'en-ZA', dateFormat: 'DD/MM/YYYY' },
  PK: { currency: 'PKR', taxLabel: 'GST',       taxRate: 17, bankFields: 'generic', locale: 'en-PK', dateFormat: 'DD/MM/YYYY' },
  BD: { currency: 'BDT', taxLabel: 'VAT',       taxRate: 15, bankFields: 'generic', locale: 'en-BD', dateFormat: 'DD/MM/YYYY' },
  LK: { currency: 'LKR', taxLabel: 'VAT',       taxRate: 18, bankFields: 'generic', locale: 'en-LK', dateFormat: 'DD/MM/YYYY' },
  NG: { currency: 'NGN', taxLabel: 'VAT',       taxRate: 7,  bankFields: 'generic', locale: 'en-NG', dateFormat: 'DD/MM/YYYY' },
  KE: { currency: 'KES', taxLabel: 'VAT',       taxRate: 16, bankFields: 'generic', locale: 'en-KE', dateFormat: 'DD/MM/YYYY' },
}

export const GENERIC_DEFAULTS: CountryDefaults = {
  currency: 'USD', taxLabel: 'Tax', taxRate: 0, bankFields: 'generic', locale: 'en-US', dateFormat: 'DD/MM/YYYY',
}

export function getCountryDefaults(country: string | null | undefined): CountryDefaults {
  if (!country || country === 'IN') return COUNTRY_DEFAULTS['IN']
  return COUNTRY_DEFAULTS[country] ?? GENERIC_DEFAULTS
}
