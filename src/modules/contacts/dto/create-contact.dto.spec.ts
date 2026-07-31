import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateContactDto } from './create-contact.dto';

// R1/R2/KTD8: country and currency are required on create with no silent
// default -- a new Contact must never persist without an explicit choice.
// currency is additionally constrained to the 5-value set every document
// type (Proposal/Contract/Invoice) validates against.
describe('CreateContactDto', () => {
  function base(overrides: Partial<CreateContactDto> = {}) {
    return plainToInstance(CreateContactDto, {
      name:     'Test Contact',
      country:  'IN',
      currency: 'INR',
      ...overrides,
    });
  }

  it('passes with a valid country and currency', async () => {
    const errors = await validate(base());
    expect(errors).toHaveLength(0);
  });

  it('rejects a missing country', async () => {
    const errors = await validate(base({ country: undefined as unknown as string }));
    expect(errors.some(e => e.property === 'country')).toBe(true);
  });

  it('rejects a missing currency', async () => {
    const errors = await validate(base({ currency: undefined as unknown as string }));
    expect(errors.some(e => e.property === 'currency')).toBe(true);
  });

  it('rejects a currency outside the 5-value set', async () => {
    const errors = await validate(base({ currency: 'AUD' }));
    expect(errors.some(e => e.property === 'currency')).toBe(true);
  });

  it.each(['INR', 'USD', 'EUR', 'GBP', 'AED'])('accepts %s as a valid currency', async (currency) => {
    const errors = await validate(base({ currency }));
    expect(errors).toHaveLength(0);
  });
});
