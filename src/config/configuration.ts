import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),
  DATABASE_URL: Joi.string().required(),
  SUPABASE_URL: Joi.string().uri().required(),
  SUPABASE_SERVICE_ROLE_KEY: Joi.string().required(),
  SUPABASE_JWT_SECRET: Joi.string().required(),
  RAZORPAY_KEY_ID: Joi.string().required(),
  RAZORPAY_KEY_SECRET: Joi.string().required(),
  CORS_ORIGIN: Joi.string().required(),
});

export const configuration = () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV,
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    jwtSecret: process.env.SUPABASE_JWT_SECRET,
  },
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
  },
  corsOrigin: process.env.CORS_ORIGIN,
});
