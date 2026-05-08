const { Redis } = require('@upstash/redis');
const crypto = require('crypto');

const isDevelopment = process.env.NODE_ENV === 'development';

class UpstashError extends Error {
  constructor(message, originalError = null) {
    super(message);
    this.name = this.constructor.name;
    this.status = 502;
    this.originalError = originalError;
    Error.captureStackTrace(this, this.constructor);
  }
}
exports.UpstashError = UpstashError;

const redis = isDevelopment ? null : new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
  enableAutoPipelining: true,
  retry: {
    retries: 1,
    backoff: () => 200
  },
  timeout: 3000
});

const KEYS = {
  PROCESSING_LOCK: 'scarlet:processing',
  RATE_LIMIT_PREFIX: 'scarlet:daily:',
  SCRATCH_DOWN_SINCE: 'scarlet:scratch:down_since',
  SCRATCH_FAIL_COUNT: 'scarlet:scratch:fail_count',
  UPSTASH_DAILY_EXHAUSTED: 'scarlet:upstash:daily_exhausted',
  UPSTASH_MONTHLY_EXHAUSTED: 'scarlet:upstash:monthly_exhausted'
};

const PROCESSING_TIMEOUT = 6;

function hashIP(ip) {
  const salt = process.env.IP_HASH_SALT || 'default-salt-change-me';
  return crypto
    .createHmac('sha256', salt)
    .update(ip)
    .digest('hex')
    .substring(0, 16);
}

const ACQUIRE_LOCK_SCRIPT = `
  local lock_key = KEYS[1]
  local hashed_ip = ARGV[1]
  local lock_ttl = tonumber(ARGV[2])
  
  local lock_owner = redis.call('GET', lock_key)
  
  if lock_owner == hashed_ip then
    return {0, 0}
  end
  
  if lock_owner == false then
    redis.call('SETEX', lock_key, lock_ttl, hashed_ip)
    return {1, 0}
  end
  
  local current_ttl = redis.call('TTL', lock_key)
  if current_ttl < 0 then current_ttl = 0 end
  
  return {0, current_ttl}
`;

const RELEASE_LOCK_SCRIPT = `
  local lock_key = KEYS[1]
  local hashed_ip = ARGV[1]
  
  local current_owner = redis.call('GET', lock_key)
  
  if current_owner == hashed_ip then
    redis.call('DEL', lock_key)
    return {1}
  end
  
  return {0}
`;

const REGISTER_SCRATCH_FAILURE_SCRIPT = `
  local down_key = KEYS[1]
  local count_key = KEYS[2]
  
  local now = redis.call('TIME')[1]
  
  redis.call('SET', down_key, now)
  
  local fail_count = redis.call('INCR', count_key)
  
  local base_delay = 30
  local backoff = base_delay
  for i = 2, fail_count do
    backoff = backoff * 2
  end
  
  if backoff > 600 then
    backoff = 600
  end
  
  redis.call('EXPIRE', down_key, backoff + 60)
  redis.call('EXPIRE', count_key, backoff + 60)
  
  return {fail_count, backoff}
`;

const CHECK_SCRATCH_STATUS_SCRIPT = `
  local down_key = KEYS[1]
  
  local last_fail = redis.call('GET', down_key)
  
  if last_fail == false then
    return {1, 0}
  end
  
  local now = redis.call('TIME')[1]
  local elapsed = now - tonumber(last_fail)
  
  local count_key = KEYS[2]
  local fail_count = tonumber(redis.call('GET', count_key) or '1')
  
  local base_delay = 30
  local backoff = base_delay
  for i = 2, fail_count do
    backoff = backoff * 2
  end
  if backoff > 600 then backoff = 600 end
  
  if elapsed >= backoff then
    return {2, backoff}
  else
    local retry_in = backoff - elapsed
    return {0, retry_in}
  end
`;

const CLEAR_SCRATCH_FAILURE_SCRIPT = `
  local down_key = KEYS[1]
  local count_key = KEYS[2]
  
  redis.call('DEL', down_key)
  redis.call('DEL', count_key)
  
  return {1}
`;

const REGISTER_UPSTASH_EXHAUSTION_SCRIPT = `
  local exhausted_key = KEYS[1]
  local ttl_seconds = tonumber(ARGV[1])
  
  local now = redis.call('TIME')[1]
  
  redis.call('SET', exhausted_key, now)
  redis.call('EXPIRE', exhausted_key, ttl_seconds)
  
  return {1}
`;

const CHECK_UPSTASH_STATUS_SCRIPT = `
  local daily_key = KEYS[1]
  local monthly_key = KEYS[2]
  
  local daily_exhausted = redis.call('GET', daily_key)
  local monthly_exhausted = redis.call('GET', monthly_key)
  
  if daily_exhausted ~= false then
    local ttl = redis.call('TTL', daily_key)
    if ttl < 0 then ttl = 0 end
    return {0, ttl, 'daily'}
  end
  
  if monthly_exhausted ~= false then
    local ttl = redis.call('TTL', monthly_key)
    if ttl < 0 then ttl = 0 end
    return {0, ttl, 'monthly'}
  end
  
  return {1, 0, 'ok'}
`;

const CHECK_DAILY_LIMIT_SCRIPT = `
  local key = KEYS[1]
  local limit = tonumber(ARGV[1])
  local window = tonumber(ARGV[2])
  
  local now = redis.call('TIME')[1]
  
  redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
  
  local count = redis.call('ZCARD', key)
  
  if count >= limit then
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local reset_time = 0
    if oldest and #oldest > 0 then
      reset_time = tonumber(oldest[2]) + window - now
    end
    return {0, count, limit, reset_time}
  end
  
  local member = now .. ':' .. count
  redis.call('ZADD', key, now, member)
  redis.call('EXPIRE', key, math.ceil(window) + 60)
  
  return {1, count + 1, limit, limit - count - 1}
`;

async function redisOperation(operation) {
  if (isDevelopment) {
    return null;
  }

  try {
    return await operation();
  } catch (error) {
    console.error(`[Upstash] Operation failed: ${error.message}`);
    
    const errorMsg = error.message || '';
    
    if (errorMsg.includes('max daily request limit')) {
      console.log('[Upstash] Daily command limit reached - blocking for 24h');
      
      try {
        await redis.eval(
          REGISTER_UPSTASH_EXHAUSTION_SCRIPT,
          [KEYS.UPSTASH_DAILY_EXHAUSTED],
          ['86400']
        );
      } catch (e) {
        console.error('[Upstash] Cannot register daily exhaustion');
      }
      
      throw new UpstashError('Daily command limit reached', error);
    }
    
    if (errorMsg.includes('max requests limit')) {
      console.log('[Upstash] Monthly command limit reached - blocking until next month');
      
      try {
        const now = new Date();
        const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
        const secondsUntilNextMonth = Math.floor((nextMonth.getTime() - now.getTime()) / 1000);
        
        await redis.eval(
          REGISTER_UPSTASH_EXHAUSTION_SCRIPT,
          [KEYS.UPSTASH_MONTHLY_EXHAUSTED],
          [secondsUntilNextMonth.toString()]
        );
      } catch (e) {
        console.error('[Upstash] Cannot register monthly exhaustion');
      }
      
      throw new UpstashError('Monthly command limit reached', error);
    }
    
    throw new UpstashError('External service unavailable', error);
  }
}

if (isDevelopment) {
  exports.acquireSlot = async () => ({ canProcess: true, retryAfterSeconds: 0 });
  exports.releaseSlot = async () => ({ success: true });
  exports.registerScratchFailure = async () => ({ failCount: 0, backoffSeconds: 0 });
  exports.checkScratchStatus = async () => ({ status: 'ok', retryAfterSeconds: 0 });
  exports.clearScratchFailure = async () => {};
  exports.registerUpstashExhaustion = async () => {};
  exports.checkUpstashStatus = async () => ({ available: true, retryAfterSeconds: 0, type: 'ok' });
  exports.clearUpstashExhaustion = async () => {};
  exports.checkDailyRateLimit = async () => ({
    allowed: true,
    current: 0,
    limit: 25,
    remaining: 25,
    resetInSeconds: 86400
  });
} else {

  exports.acquireSlot = async function acquireSlot(ip) {
    return redisOperation(async () => {
      const hashedIP = hashIP(ip);
      
      const result = await redis.eval(
        ACQUIRE_LOCK_SCRIPT,
        [KEYS.PROCESSING_LOCK],
        [hashedIP, PROCESSING_TIMEOUT.toString()]
      );
      
      return {
        canProcess: result[0] === 1,
        retryAfterSeconds: result[1] || 0
      };
    });
  };

  exports.releaseSlot = async function releaseSlot(ip) {
    return redisOperation(async () => {
      const hashedIP = hashIP(ip);
      
      const result = await redis.eval(
        RELEASE_LOCK_SCRIPT,
        [KEYS.PROCESSING_LOCK],
        [hashedIP]
      );
      
      return {
        success: result[0] === 1
      };
    });
  };

  exports.registerScratchFailure = async function() {
    return redisOperation(async () => {
      const result = await redis.eval(
        REGISTER_SCRATCH_FAILURE_SCRIPT,
        [KEYS.SCRATCH_DOWN_SINCE, KEYS.SCRATCH_FAIL_COUNT],
        []
      );
      return {
        failCount: result[0],
        backoffSeconds: result[1]
      };
    });
  };

  exports.checkScratchStatus = async function() {
    return redisOperation(async () => {
      const result = await redis.eval(
        CHECK_SCRATCH_STATUS_SCRIPT,
        [KEYS.SCRATCH_DOWN_SINCE, KEYS.SCRATCH_FAIL_COUNT],
        []
      );
      return {
        status: result[0] === 1 ? 'ok' : result[0] === 2 ? 'retry_allowed' : 'waiting',
        retryAfterSeconds: result[1] || 0
      };
    });
  };

  exports.clearScratchFailure = async function() {
    return redisOperation(async () => {
      await redis.eval(
        CLEAR_SCRATCH_FAILURE_SCRIPT,
        [KEYS.SCRATCH_DOWN_SINCE, KEYS.SCRATCH_FAIL_COUNT],
        []
      );
    });
  };

  exports.registerUpstashExhaustion = async function(ttlSeconds) {
    return redisOperation(async () => {
      await redis.eval(
        REGISTER_UPSTASH_EXHAUSTION_SCRIPT,
        [KEYS.UPSTASH_DAILY_EXHAUSTED],
        [ttlSeconds.toString()]
      );
    });
  };

  exports.checkUpstashStatus = async function() {
    return redisOperation(async () => {
      const result = await redis.eval(
        CHECK_UPSTASH_STATUS_SCRIPT,
        [KEYS.UPSTASH_DAILY_EXHAUSTED, KEYS.UPSTASH_MONTHLY_EXHAUSTED],
        []
      );
      return {
        available: result[0] === 1,
        retryAfterSeconds: result[1] || 0,
        type: result[2] || 'ok'
      };
    });
  };

  exports.clearUpstashExhaustion = async function() {
    return redisOperation(async () => {
      await redis.eval(
        'DEL',
        [KEYS.UPSTASH_DAILY_EXHAUSTED, KEYS.UPSTASH_MONTHLY_EXHAUSTED],
        []
      );
    });
  };

  exports.checkDailyRateLimit = async function checkDailyRateLimit(ip) {
    return redisOperation(async () => {
      const hashedIP = hashIP(ip);
      const key = `${KEYS.RATE_LIMIT_PREFIX}${hashedIP}`;
      const window = 24 * 60 * 60;
      const limit = 25;
      
      const result = await redis.eval(
        CHECK_DAILY_LIMIT_SCRIPT,
        [key],
        [limit.toString(), window.toString()]
      );
      
      return {
        allowed: result[0] === 1,
        current: result[1],
        limit: result[2],
        remaining: result[3],
        resetInSeconds: result[0] === 0 ? result[3] : window
      };
    });
  };
}