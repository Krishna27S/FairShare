/**
 * Centralized error handling for the expense splitter app
 */

interface AppError {
  code: string;
  message: string;
  details?: string;
  statusCode?: number;
  userMessage: string;
}

/**
 * Error codes for different scenarios
 */
export const ErrorCodes = {
  // Authentication errors
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_USER_NOT_FOUND: 'AUTH_USER_NOT_FOUND',
  AUTH_SESSION_EXPIRED: 'AUTH_SESSION_EXPIRED',
  AUTH_UNAUTHORIZED: 'AUTH_UNAUTHORIZED',

  // Validation errors
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',

  // Database errors
  DB_CONNECTION_ERROR: 'DB_CONNECTION_ERROR',
  DB_QUERY_ERROR: 'DB_QUERY_ERROR',
  DB_CONSTRAINT_VIOLATION: 'DB_CONSTRAINT_VIOLATION',
  DB_RECORD_NOT_FOUND: 'DB_RECORD_NOT_FOUND',

  // Business logic errors
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  DUPLICATE_MEMBER: 'DUPLICATE_MEMBER',
  CANNOT_LEAVE_GROUP: 'CANNOT_LEAVE_GROUP',
  SETTLEMENT_FAILED: 'SETTLEMENT_FAILED',
  INVALID_OPERATION: 'INVALID_OPERATION',

  // Network errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',

  // Unknown errors
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

/**
 * Parse and normalize errors from various sources
 */
export function parseError(error: any): AppError {
  // Supabase error
  if (error?.status && error?.message) {
    return handleSupabaseError(error);
  }

  // Network error
  if (error?.name === 'NetworkError' || error?.message?.includes('fetch')) {
    return {
      code: ErrorCodes.NETWORK_ERROR,
      message: 'Network request failed',
      userMessage: 'Unable to connect. Please check your internet connection.',
      statusCode: 0,
    };
  }

  // Timeout error
  if (error?.name === 'AbortError' || error?.code === 'ETIMEDOUT') {
    return {
      code: ErrorCodes.REQUEST_TIMEOUT,
      message: 'Request timed out',
      userMessage: 'The request took too long. Please try again.',
      statusCode: 408,
    };
  }

  // Standard Error object
  if (error instanceof Error) {
    return {
      code: ErrorCodes.UNKNOWN_ERROR,
      message: error.message,
      userMessage: error.message || 'An unexpected error occurred',
    };
  }

  // String error
  if (typeof error === 'string') {
    return {
      code: ErrorCodes.UNKNOWN_ERROR,
      message: error,
      userMessage: error,
    };
  }

  // Unknown error
  return {
    code: ErrorCodes.UNKNOWN_ERROR,
    message: 'An unknown error occurred',
    userMessage: 'An unexpected error occurred. Please try again.',
  };
}

/**
 * Handle Supabase-specific errors
 */
function handleSupabaseError(error: any): AppError {
  const status = error.status;
  const message = error.message || '';

  console.log('[v0] Supabase error:', { status, message });

  // Authentication errors
  if (status === 401) {
    return {
      code: ErrorCodes.AUTH_UNAUTHORIZED,
      message,
      userMessage: 'You are not authorized. Please log in again.',
      statusCode: 401,
    };
  }

  if (status === 403) {
    return {
      code: ErrorCodes.AUTH_UNAUTHORIZED,
      message,
      userMessage: 'You do not have permission to perform this action.',
      statusCode: 403,
    };
  }

  // Not found errors
  if (status === 404) {
    return {
      code: ErrorCodes.DB_RECORD_NOT_FOUND,
      message,
      userMessage: 'The requested resource was not found.',
      statusCode: 404,
    };
  }

  // Constraint violations (unique constraint, foreign key, etc.)
  if (status === 409) {
    if (message.includes('duplicate')) {
      return {
        code: ErrorCodes.DB_CONSTRAINT_VIOLATION,
        message,
        userMessage: 'This record already exists. Please use a different value.',
        statusCode: 409,
      };
    }

    if (message.includes('foreign key')) {
      return {
        code: ErrorCodes.DB_CONSTRAINT_VIOLATION,
        message,
        userMessage: 'Cannot perform this action due to related records.',
        statusCode: 409,
      };
    }

    return {
      code: ErrorCodes.DB_CONSTRAINT_VIOLATION,
      message,
      userMessage: 'This action violates data constraints.',
      statusCode: 409,
    };
  }

  // Server errors
  if (status >= 500) {
    return {
      code: ErrorCodes.SERVICE_UNAVAILABLE,
      message,
      userMessage:
        'The service is temporarily unavailable. Please try again later.',
      statusCode: status,
    };
  }

  // Default database error
  return {
    code: ErrorCodes.DB_QUERY_ERROR,
    message,
    userMessage: 'A database error occurred. Please try again.',
    statusCode: status,
  };
}

/**
 * Create a custom app error
 */
export function createAppError(
  code: string,
  message: string,
  userMessage?: string,
  statusCode?: number
): AppError {
  return {
    code,
    message,
    userMessage: userMessage || message,
    statusCode,
  };
}

/**
 * Validate required fields
 */
export function validateRequired(
  data: Record<string, any>,
  fields: string[]
): { valid: boolean; error?: AppError } {
  const missing = fields.filter((field) => !data[field]);

  if (missing.length > 0) {
    return {
      valid: false,
      error: createAppError(
        ErrorCodes.MISSING_REQUIRED_FIELD,
        `Missing required fields: ${missing.join(', ')}`,
        `Please fill in all required fields: ${missing.join(', ')}`
      ),
    };
  }

  return { valid: true };
}

/**
 * Validate email format
 */
export function validateEmail(email: string): {
  valid: boolean;
  error?: AppError;
} {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(email)) {
    return {
      valid: false,
      error: createAppError(
        ErrorCodes.INVALID_INPUT,
        'Invalid email format',
        'Please enter a valid email address'
      ),
    };
  }

  return { valid: true };
}

/**
 * Validate amount is positive
 */
export function validateAmount(
  amount: number
): { valid: boolean; error?: AppError } {
  if (amount <= 0) {
    return {
      valid: false,
      error: createAppError(
        ErrorCodes.INVALID_INPUT,
        'Amount must be positive',
        'Please enter an amount greater than 0'
      ),
    };
  }

  return { valid: true };
}

/**
 * Log error for debugging
 */
export function logError(error: AppError, context?: string) {
  console.error('[v0] Error:', {
    code: error.code,
    message: error.message,
    details: error.details,
    context,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Create user-friendly error message
 */
export function getUserMessage(error: AppError | any): string {
  if (error?.userMessage) {
    return error.userMessage;
  }

  const parsed = parseError(error);
  return parsed.userMessage;
}

/**
 * Retry logic with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: {
    maxAttempts?: number;
    delayMs?: number;
    backoffMultiplier?: number;
  }
): Promise<T> {
  const maxAttempts = options?.maxAttempts || 3;
  const delayMs = options?.delayMs || 1000;
  const backoffMultiplier = options?.backoffMultiplier || 2;

  let lastError: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[v0] Attempt ${attempt}/${maxAttempts}`);
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < maxAttempts) {
        const delay = delayMs * Math.pow(backoffMultiplier, attempt - 1);
        console.log(`[v0] Retry in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
