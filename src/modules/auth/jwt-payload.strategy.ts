import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { passportJwtSecret } from 'jwks-rsa';
import type { Request } from 'express';
import { LoginSessionsService } from './login-sessions.service';

export interface SupabaseJwtPayload {
  sub:            string;
  email:          string;
  role:           string;
  session_id?:    string;
  jti?:           string;
  iat?:           number;
  exp?:           number;
  user_metadata?: { name?: string; email?: string };
}

/**
 * Validates JWT signature via JWKS but does NOT look up the user in the database.
 * Used exclusively on POST /users/me (the upsert/onboarding endpoint) where
 * the user record may not exist yet.
 */
@Injectable()
export class JwtPayloadStrategy extends PassportStrategy(Strategy, 'jwt-payload') {
  constructor(
    configService: ConfigService,
    private readonly loginSessions: LoginSessionsService,
  ) {
    const supabaseUrl = configService.getOrThrow<string>('supabase.url');

    super({
      jwtFromRequest:   ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      passReqToCallback: true,
      secretOrKeyProvider: passportJwtSecret({
        cache:                 true,
        rateLimit:             true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
      }),
    });
  }

  async validate(_request: Request, payload: SupabaseJwtPayload): Promise<SupabaseJwtPayload> {
    await this.loginSessions.assertNotRevoked(payload);
    return payload;
  }
}
