import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { JwtPayloadStrategy } from './jwt-payload.strategy';
import { LoginSessionsController } from './login-sessions.controller';
import { LoginSessionsService } from './login-sessions.service';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [LoginSessionsController],
  providers: [JwtStrategy, JwtPayloadStrategy, LoginSessionsService],
  exports: [PassportModule, LoginSessionsService],
})
export class AuthModule {}
