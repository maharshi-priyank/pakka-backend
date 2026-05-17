import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { passportJwtSecret } from 'jwks-rsa';

export interface SupabaseJwtPayload {
  sub:            string;
  email:          string;
  role:           string;
  user_metadata?: { name?: string; email?: string };
}

/**
 * Validates JWT signature via JWKS but does NOT look up the user in the database.
 * Used exclusively on POST /users/me (the upsert/onboarding endpoint) where
 * the user record may not exist yet.
 */
@Injectable()
export class JwtPayloadStrategy extends PassportStrategy(Strategy, 'jwt-payload') {
  constructor(configService: ConfigService) {
    const supabaseUrl = configService.getOrThrow<string>('supabase.url');

    super({
      jwtFromRequest:   ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: passportJwtSecret({
        cache:                 true,
        rateLimit:             true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
      }),
    });
  }

  validate(payload: SupabaseJwtPayload): SupabaseJwtPayload {
    return payload;
  }
}
