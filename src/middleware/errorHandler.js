const { ExternalApiError } = require('../services/proxyService');
const { InputError } = require('./validator');
const { ProcessingError, RateLimitError } = require('./doorman');
const { UpstashError } = require('../utils/upstash');

module.exports = function errorHandler(err, req, res, next) {
  let statusCode = 500;
  let responseBody = {
    error: 'Internal Server Error',
    code: 'INTERNAL_ERROR'
  };

  logError(err);

  if (err instanceof UpstashError) {
    statusCode = 502;
    responseBody = {
      error: getPublicMessage(err, 'External service temporarily unavailable'),
      code: 'UPSTASH_UNAVAILABLE'
    };
  }
  else if (err instanceof ExternalApiError) {
    statusCode = err.status === 404 ? 404 : 502;
    responseBody = {
      error: getPublicMessage(err, 
        err.status === 404 ? 'Resource not found' : 'Upstream service unavailable'
      ),
      code: err.status === 404 ? 'NOT_FOUND' : 'EXTERNAL_API_ERROR'
    };
  }
  else if (err instanceof InputError) {
    statusCode = err.status || 400;
    responseBody = {
        error: err.message || 'Invalid request',
        code: 'INVALID_INPUT'
    };
  }
  else if (err instanceof RateLimitError) {
    statusCode = 429;
    responseBody = {
      error: getPublicMessage(err, 'Daily request limit reached'),
      code: 'DAILY_LIMIT_REACHED',
      details: sanitizeDetails(err.details)
    };
    setRateLimitHeaders(res, err.details);
  }
  else if (err instanceof ProcessingError) {
    statusCode = err.status || 503;
    
    if (err.details?.status === 'too_many_requests') {
      responseBody = {
        error: getPublicMessage(err, 'Too many requests'),
        code: 'TOO_MANY_REQUESTS'
      };
    } else if (err.details?.status === 'scratch_down') {
      responseBody = {
        error: getPublicMessage(err, 'Scratch API is temporarily unavailable'),
        code: 'SCRATCH_DOWN',
        details: sanitizeDetails(err.details)
      };
      if (err.details?.retryAfterSeconds) {
        res.set('Retry-After', Math.max(1, Math.ceil(err.details.retryAfterSeconds)));
      }
    } else if (err.details?.status === 'upstash_exhausted') {
      responseBody = {
        error: getPublicMessage(err, 'Service temporarily unavailable'),
        code: 'UPSTASH_EXHAUSTED',
        details: sanitizeDetails(err.details)
      };
      if (err.details?.retryAfterSeconds) {
        res.set('Retry-After', Math.max(1, Math.ceil(err.details.retryAfterSeconds)));
      }
    } else {
      responseBody = {
        error: getPublicMessage(err, 'Server is busy processing another request'),
        code: 'SERVER_BUSY',
        details: sanitizeDetails(err.details)
      };
      if (err.details?.retryAfterSeconds) {
        res.set('Retry-After', Math.max(1, Math.ceil(err.details.retryAfterSeconds)));
      }
    }
  }
  else {
    responseBody = {
      error: getPublicMessage(err, 'Internal Server Error'),
      code: 'INTERNAL_ERROR'
    };
    if (process.env.NODE_ENV !== 'production') {
      responseBody.stack = err.stack?.split('\n').slice(0, 5);
    }
  }

  return res.status(statusCode).json(responseBody);
};

function logError(err) {
  const errorName = err.name || 'UnknownError';
  
  if (err instanceof UpstashError) {
    console.error(`[CRITICAL] [UpstashError] ${err.message}`);
    if (err.originalError) {
      console.error(`  Caused by: ${err.originalError.message}`);
    }
    return;
  }
  
  if (err instanceof ExternalApiError) {
    console.error(`[ExternalAPI] Status ${err.status}: ${err.message}`);
    return;
  }
  
  if (err instanceof InputError || 
      err instanceof RateLimitError || 
      err instanceof ProcessingError) {
    return;
  }
  
  console.error(`[UNEXPECTED] [${errorName}] ${err.message}`);
  console.error(err.stack);
}

function getPublicMessage(err, productionMessage) {
  if (process.env.NODE_ENV !== 'production') {
    return err.message || productionMessage;
  }
  return productionMessage;
}

function sanitizeDetails(details) {
  if (!details) return undefined;
  
  if (process.env.NODE_ENV !== 'production') {
    return details;
  }
  
  const sanitized = {};
  if (details.retryAfterSeconds) sanitized.retryAfterSeconds = details.retryAfterSeconds;
  
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function setRateLimitHeaders(res, details) {
  if (!details) return;
  if (details.limit) res.set('X-RateLimit-Limit', details.limit);
  if (details.remaining !== undefined) res.set('X-RateLimit-Remaining', details.remaining);
  if (details.retryAfterSeconds) res.set('Retry-After', Math.ceil(details.retryAfterSeconds));
}