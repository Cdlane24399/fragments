#!/bin/bash
set -euo pipefail

export NEXT_PUBLIC_POSTHOG_KEY=""
export NEXT_PUBLIC_POSTHOG_HOST=""
export NEXT_TELEMETRY_DISABLED=1

while [ ! -f /tmp/fragments-ready ]; do
  sleep 0.1
done

cd /home/user
exec npx next dev --turbo --hostname 0.0.0.0 --port 3000
