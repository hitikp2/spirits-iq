import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

// Only connect to Redis if REDIS_URL is explicitly configured
function getRedis(): Redis | null {
  if (!process.env.REDIS_URL) return null;
  if (!globalForRedis.redis) {
    globalForRedis.redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      retryStrategy(times) {
        if (times > 3) return null; // Stop retrying after 3 attempts
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });
    globalForRedis.redis.on("error", () => {
      // Suppress unhandled error events to prevent crash
    });
  }
  return globalForRedis.redis;
}

// Proxy that returns no-op results when Redis is unavailable
export const redis = new Proxy({} as Redis, {
  get(_, prop) {
    const instance = getRedis();
    if (!instance) {
      // Return no-op functions when Redis is not configured
      return typeof prop === "string" ? () => Promise.resolve(null) : undefined;
    }
    const value = (instance as any)[prop];
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

// ─── Cache Helpers ────────────────────────────────────────
const DEFAULT_TTL = 300; // 5 minutes

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const cached = await redis.get(`siq:${key}`);
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
}

export async function cacheSet<T>(key: string, data: T, ttl = DEFAULT_TTL): Promise<void> {
  try {
    await redis.setex(`siq:${key}`, ttl, JSON.stringify(data));
  } catch {
    // Fail silently — cache is non-critical
  }
}

export async function cacheDelete(pattern: string): Promise<void> {
  try {
    const keys = await redis.keys(`siq:${pattern}`);
    if (keys.length > 0) await redis.del(...keys);
  } catch {
    // Fail silently
  }
}

// ─── Real-time POS Cart (stored in Redis for multi-device sync) ──
export async function getActiveCart(registerId: string) {
  return cacheGet(`cart:${registerId}`);
}

export async function setActiveCart(registerId: string, cart: unknown) {
  return cacheSet(`cart:${registerId}`, cart, 3600); // 1 hour TTL
}

export async function clearActiveCart(registerId: string) {
  return cacheDelete(`cart:${registerId}`);
}
