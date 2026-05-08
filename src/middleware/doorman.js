const {
  acquireSlot,
  releaseSlot,
  checkDailyRateLimit,
  checkScratchStatus,
  checkUpstashStatus
} = require('../utils/upstash');
const catchAsync = require('../utils/catchAsync');

const isDevelopment = process.env.NODE_ENV === 'development';

class ProcessingError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.status = 503;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

class RateLimitError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.status = 429;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

exports.ProcessingError = ProcessingError;
exports.RateLimitError = RateLimitError;

function getClientIP(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  
  if (forwardedFor) {
    const ips = forwardedFor.split(',');
    const clientIP = ips[0].trim();
    
    if (isValidIP(clientIP)) {
      return clientIP;
    }
  }
  
  console.warn('Could not determine client IP, using fallback');
  return 'unknown';
}

function isValidIP(ip) {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Regex.test(ip)) {
    const parts = ip.split('.');
    return parts.every(part => {
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255;
    });
  }
  
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  return ipv6Regex.test(ip);
}

const PROCESSING_TIMEOUT = 6;

exports.dailyRateGuard = catchAsync(async function dailyRateGuard(req, res, next) {
  if (isDevelopment) {
    req.clientIP = '127.0.0.1';
    return next();
  }

  const ip = getClientIP(req);
  
  const upstashStatus = await checkUpstashStatus();
  
  if (!upstashStatus.available) {
    const err = new ProcessingError('Service temporarily unavailable', {
      status: 'upstash_exhausted',
      retryAfterSeconds: upstashStatus.retryAfterSeconds
    });
    err.status = 502;
    throw err;
  }
  
  const scratchStatus = await checkScratchStatus();
  
  if (scratchStatus.status === 'waiting') {
    const err = new ProcessingError('Scratch API is temporarily unavailable', {
      status: 'scratch_down',
      retryAfterSeconds: scratchStatus.retryAfterSeconds
    });
    err.status = 502;
    throw err;
  }
  
  const rateLimit = await checkDailyRateLimit(ip);
  
  res.set({
    'X-RateLimit-Limit': rateLimit.limit,
    'X-RateLimit-Remaining': Math.max(0, rateLimit.remaining),
    'X-RateLimit-Reset': rateLimit.resetInSeconds
  });
  
  if (!rateLimit.allowed) {
    throw new RateLimitError('Daily request limit reached', {
      limit: rateLimit.limit,
      remaining: 0,
      retryAfterSeconds: rateLimit.resetInSeconds
    });
  }
  
  req.clientIP = ip;
  next();
});

exports.processingGuard = catchAsync(async function processingGuard(req, res, next) {
  if (isDevelopment) {
    return next();
  }

  const ip = req.clientIP;
  
  const result = await acquireSlot(ip);
  
  if (result.canProcess) {
    let cleanedUp = false;
    
    const cleanup = async () => {
      if (!cleanedUp) {
        cleanedUp = true;
        await releaseSlot(ip);
      }
    };
    
    res.once('finish', cleanup);
    res.once('close', cleanup);
    res.once('error', cleanup);
    
    const safetyTimeout = setTimeout(cleanup, PROCESSING_TIMEOUT * 1000);
    
    const originalEnd = res.end;
    res.end = function(...args) {
      clearTimeout(safetyTimeout);
      originalEnd.apply(this, args);
    };
    
    return next();
  }
  
  if (result.retryAfterSeconds === 0) {
    const err = new ProcessingError('Too many requests', {
      status: 'too_many_requests'
    });
    err.status = 429;
    throw err;
  }
  
  res.set('Retry-After', Math.max(1, result.retryAfterSeconds));
  
  throw new ProcessingError('Server is busy processing another request', {
    status: 'server_busy',
    retryAfterSeconds: result.retryAfterSeconds
  });
});