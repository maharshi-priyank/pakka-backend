import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { passportJwtSecret } from 'jwks-rsa';
import { PrismaService } from '../../prisma/prisma.service';

interface SupabaseJwtPayload {
  sub:   string;
  email: string;
  role:  string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const supabaseUrl = configService.getOrThrow<string>('supabase.url');

    super({
      jwtFromRequest:   ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // Fetch public key from Supabase JWKS — supports both ES256 (new projects) and HS256 (legacy)
      secretOrKeyProvider: passportJwtSecret({
        cache:              true,
        rateLimit:          true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
      }),
    });
  }

  async validate(payload: SupabaseJwtPayload) {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });

    if (!user) {
      throw new UnauthorizedException('User not found. Please complete onboarding.');
    }

    return user;
  }
}
