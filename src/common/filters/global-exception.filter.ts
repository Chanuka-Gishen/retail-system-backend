import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { StandardApiErrorResponse } from '@/common/types';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let responseCode = 'ERR_INTERNAL_SERVER_ERROR';
    let responseMessage = 'An unexpected server error occurred.';
    let errors: { field: string; message: string }[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        responseMessage = res;
      } else if (typeof res === 'object' && res !== null) {
        const errorObj = res as Record<string, any>;
        responseMessage = errorObj['message'] || exception.message;

        // Validation pipe errors
        if (Array.isArray(errorObj['message'])) {
          responseCode = 'ERR_VALIDATION_FAILED';
          responseMessage = 'Validation failed for one or more fields.';
          errors = errorObj['message'].map((msg: string) => {
            const parts = msg.split(' ');
            return {
              field: parts[0] || 'field',
              message: msg,
            };
          });
        } else if (errorObj['responseCode']) {
          responseCode = errorObj['responseCode'];
        }
      }

      if (status === HttpStatus.UNAUTHORIZED) {
        responseCode = 'ERR_UNAUTHORIZED';
      } else if (status === HttpStatus.FORBIDDEN) {
        responseCode = 'ERR_FORBIDDEN';
      } else if (status === HttpStatus.NOT_FOUND) {
        responseCode = 'ERR_NOT_FOUND';
      } else if (status === HttpStatus.CONFLICT) {
        responseCode = 'ERR_CONFLICT';
      }
    } else if (exception instanceof Error) {
      this.logger.error(`Unhandled Exception: ${exception.message}`, exception.stack);
      responseMessage =
        process.env.NODE_ENV === 'development'
          ? exception.message
          : 'An unexpected server error occurred.';
    }

    const payload: StandardApiErrorResponse = {
      responseCode,
      responseMessage,
      ...(errors ? { errors } : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(status).json(payload);
  }
}
