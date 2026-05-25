import { Duration } from './duration'
import { getRedis } from './kv'
import { Ratelimit } from '@upstash/ratelimit'

export default async function ratelimit(
  key: string | null,
  maxRequests: number,
  window: Duration,
) {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    const ratelimit = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(maxRequests, window),
    })

    const { success, limit, reset, remaining } = await ratelimit.limit(
      `ratelimit_${key}`,
    )

    if (!success) {
      return {
        amount: limit,
        reset,
        remaining,
      }
    }
  }
}
