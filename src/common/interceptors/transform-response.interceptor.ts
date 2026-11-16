import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { StandardApiResponse } from '@/common/types';

@Injectable()
export class TransformResponseInterceptor<T>
  implements NestInterceptor<T, StandardApiResponse<T>>
{
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<StandardApiResponse<T>> {
    return next.handle().pipe(
      map((data) => {
        // If data is already in standard format (e.g. from custom handler), pass through
        if (data && typeof data === 'object' && 'responseCode' in data && 'response' in data) {
          return data;
        }

        // If pagination meta is attached to data
        let meta;
        let responseData = data;
        if (data && typeof data === 'object' && 'meta' in data && 'items' in data) {
          meta = data.meta;
          if ('summary' in data) {
            responseData = { items: data.items, summary: data.summary };
          } else {
            responseData = data.items;
          }
        }

        return {
          responseCode: 'SUCCESS',
          responseMessage: 'Operation completed successfully.',
          response: responseData,
          ...(meta ? { meta } : {}),
        };
      }),
    );
  }
}
