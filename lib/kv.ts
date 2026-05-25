import { Redis } from '@upstash/redis'

// Lazy singleton Redis client. We don't construct it eagerly because the
// surrounding code guards on `KV_REST_API_URL` / `KV_REST_API_TOKEN` being
// defined, and `Redis.fromEnv()` throws when they are missing. Construct on
// first use so unconfigured environments (e.g. local dev without KV) still
// boot. The two env vars are the same ones Vercel KV used, so no env changes
// are needed when migrating from @vercel/kv.
let _redis: Redis | undefined

export function getRedis(): Redis {
  if (!_redis) {
    _redis = Redis.fromEnv()
  }
  return _redis
}
