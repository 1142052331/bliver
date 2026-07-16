import type { ErrorRequestHandler, RequestHandler, Response } from 'express';

import { problemDetails } from '@bliver/contracts';

export interface HttpErrorContext {
  readonly requestId: string;
  readonly correlationId: string;
  readonly method: string;
  readonly status: number;
}

export interface HttpErrorReporter {
  capture(error: Error, context: HttpErrorContext): void;
}

function sendProblem(
  response: Response,
  problem: unknown,
): void {
  const parsed = problemDetails.parse(problem);
  response
    .status(parsed.status)
    .type('application/problem+json')
    .json(parsed);
}

export const notFoundHandler: RequestHandler = (request, response) => {
  sendProblem(response, {
    type: 'about:blank',
    title: 'Not Found',
    status: 404,
    code: 'NOT_FOUND',
    requestId: request.id,
  });
};

export function createErrorHandler(reporter?: HttpErrorReporter): ErrorRequestHandler {
  return (error, request, response, _next) => {
    void _next;
    const isJsonSyntaxError = error instanceof SyntaxError;
    const isPayloadTooLarge = (error as { status?: unknown }).status === 413;
    const status = isPayloadTooLarge ? 413 : isJsonSyntaxError ? 400 : 500;

    if (status >= 500) {
      const observed = request as typeof request & { correlationId?: string };
      const requestId = String(request.id);
      reporter?.capture(new Error('Unhandled HTTP request failure'), {
        requestId,
        correlationId: observed.correlationId ?? requestId,
        method: request.method,
        status,
      });
    }

    sendProblem(response, {
      type: 'about:blank',
      title: isPayloadTooLarge ? 'Payload too large' : isJsonSyntaxError ? 'Invalid request' : 'Internal Server Error',
      status,
      code: isPayloadTooLarge ? 'PAYLOAD_TOO_LARGE' : isJsonSyntaxError ? 'INVALID_JSON' : 'INTERNAL_ERROR',
      requestId: request.id,
    });
  };
}

export const errorHandler = createErrorHandler();
