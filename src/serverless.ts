import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import type { IncomingMessage, ServerResponse } from 'http';
import type { Express } from 'express';

let cachedHandler: Express | null = null;

async function bootstrap(): Promise<Express> {
  if (cachedHandler) return cachedHandler;

  const app = await NestFactory.create(AppModule, { logger: false });
  const configService = app.get(ConfigService);

  const corsOriginRaw = configService.get<string>('corsOrigin') ?? '';
  const allowedOrigins = corsOriginRaw.split(',').map((o: string) => o.trim()).filter(Boolean);
  const corsOrigin = allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins;

  app.use(helmet());
  app.enableCors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  await app.init();
  cachedHandler = app.getHttpAdapter().getInstance() as Express;
  return cachedHandler;
}

export default async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  const handler = await bootstrap();
  handler(req, res);
};
