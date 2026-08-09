import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RazorpayProvider } from './razorpay.provider';

describe('RazorpayProvider', () => {
  const config = (keyId: string, keySecret: string) =>
    ({
      get: jest.fn(
        (key: string) =>
          ({
            'razorpay.keyId': keyId,
            'razorpay.keySecret': keySecret,
          })[key],
      ),
    }) as unknown as ConfigService;

  it('reports placeholder credentials as an unavailable payment provider', async () => {
    const provider = new RazorpayProvider(
      config('rzp_test_YOUR_KEY_ID', 'YOUR_KEY_SECRET'),
    );

    await expect(
      provider.getOrCreatePlanId('SOLO', 'regular', 149),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('maps Razorpay authentication failures to a 503', async () => {
    const provider = new RazorpayProvider(
      config('rzp_test_valid', 'valid-secret'),
    );
    (provider as any).client = {
      plans: {
        all: jest.fn().mockRejectedValue({
          statusCode: 401,
          error: { description: 'Authentication failed' },
        }),
      },
    };

    await expect(
      provider.getOrCreatePlanId('SOLO', 'regular', 149),
    ).rejects.toMatchObject({
      status: 503,
      message: expect.stringContaining('Razorpay billing is unavailable'),
    });
  });
});
