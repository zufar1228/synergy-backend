/**
 * @file apiError.ts
 * @purpose Custom error class with HTTP status code for API error responses
 * @usedBy All controllers and services
 * @deps None
 * @exports ApiError (default)
 * @sideEffects None
 */


class ApiError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export default ApiError;
