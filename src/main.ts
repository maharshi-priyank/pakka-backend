// New Relic agent must be the very first require in production
if (process.env.NODE_ENV === 'production' && process.env.NEW_RELIC_LICENSE_KEY) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('newrelic');
}

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const compression = require('compression');
import * as express from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  // bodyParser: false — we register our own below with a higher limit
  const app = await NestFactory.create(AppModule, { bufferLogs: true, bodyParser: false });

  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService);
  const corsOriginRaw = configService.get<string>('corsOrigin') ?? '';
  const port = configService.get<number>('port') ?? 3000;

  // Support comma-separated origins: "http://localhost:5173,http://localhost:5177"
  const allowedOrigins = corsOriginRaw.split(',').map(o => o.trim()).filter(Boolean);
  const corsOrigin = allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins;

  app.use(express.json({
    limit: '10mb',
    verify: (req: any, _res, buf) => { req.rawBody = buf; },
  }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  app.use(compression());
  app.use(helmet());

  // The lead-capture embed is designed to run inside a third-party site's
  // iframe -- including sandboxed iframes, which send `Origin: null`. That
  // can never appear in the authenticated app's origin allowlist below, so
  // this public, token-gated endpoint gets its own permissive CORS instead
  // of being folded into the global policy.
  app.use('/api/v1/forms/fill', (_req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (_req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

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

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ClearWork API')
    .setDescription('ClearWork platform API — Lead → Proposal → Contract → Invoice → Payment')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
  });

  await app.listen(port, '0.0.0.0');
  console.log(`ClearWork API running on http://0.0.0.0:${port}`);
  console.log(`Swagger docs: http://0.0.0.0:${port}/api/docs`);
}

bootstrap();
