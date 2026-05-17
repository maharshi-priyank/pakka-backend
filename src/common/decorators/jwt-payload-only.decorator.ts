import { SetMetadata } from '@nestjs/common';

export const IS_JWT_PAYLOAD_ONLY_KEY = 'isJwtPayloadOnly';
export const JwtPayloadOnly = () => SetMetadata(IS_JWT_PAYLOAD_ONLY_KEY, true);
