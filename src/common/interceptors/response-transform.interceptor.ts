import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

@Injectable()
export class ResponseTransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((result) => {
        const response = context.switchToHttp().getResponse();
        const contentType = response.getHeader('Content-Type');
        if (typeof contentType === 'string' && contentType.includes('text/csv')) {
          return result as ApiResponse<T>;
        }
        if (result && typeof result === 'object' && 'data' in result) {
          return result as ApiResponse<T>;
        }
        return { data: result };
      }),
    );
  }
}
