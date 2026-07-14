import type { ErrorRequestHandler, RequestHandler, Response } from 'express';

import { problemDetails } from '@bliver/contracts';

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

export const errorHandler: ErrorRequestHandler = (
  error,
  request,
  response,
  _next,
) => {
  void _next;
  const isJsonSyntaxError = error instanceof SyntaxError;
  const status = isJsonSyntaxError ? 400 : 500;

  sendProblem(response, {
    type: 'about:blank',
    title: isJsonSyntaxError ? 'Invalid request' : 'Internal Server Error',
    status,
    code: isJsonSyntaxError ? 'INVALID_JSON' : 'INTERNAL_ERROR',
    requestId: request.id,
  });
};
