#!/bin/sh

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$SCRIPT_DIR"

# Store all subprocess PIDs
pids=""

# Cleanup function: gracefully shutdown all services
cleanup() {
    echo ""
    echo "🛑 Shutting down all services..."

    # Send SIGTERM signal to all subprocesses
    for pid in $pids; do
        if kill -0 "$pid" 2>/dev/null; then
            service_name=$(ps -p "$pid" -o comm= 2>/dev/null || echo "unknown")
            echo "   Shutting down process $pid ($service_name)..."
            kill -TERM "$pid" 2>/dev/null
        fi
    done

    # Wait for all processes to exit (max 5 seconds)
    sleep 1
    for pid in $pids; do
        if kill -0 "$pid" 2>/dev/null; then
            # If still running, wait up to 4 seconds
            timeout=4
            while [ $timeout -gt 0 ] && kill -0 "$pid" 2>/dev/null; do
                sleep 1
                timeout=$((timeout - 1))
            done
            # If still running, force kill
            if kill -0 "$pid" 2>/dev/null; then
                echo "   Force killing process $pid..."
                kill -KILL "$pid" 2>/dev/null
            fi
        fi
    done

    echo "✅ All services shut down"
    exit 0
}

echo "🚀 Starting all services..."
echo ""

# Switch to build directory
cd "$BUILD_DIR" || exit 1

ls -lah

# Initialize database (if exists)
if [ -d "./next-service-dist/db" ] && [ "$(ls -A ./next-service-dist/db 2>/dev/null)" ] && [ -d "/db" ]; then
    echo "🗄️  Initializing database from ./next-service-dist/db to /db..."
    cp -r ./next-service-dist/db/* /db/ 2>/dev/null || echo "  ⚠️  Cannot copy to /db, skipping database initialization"
    echo "✅ Database initialization complete"
fi

# Start Next.js server
if [ -f "./next-service-dist/server.js" ]; then
    echo "🚀 Starting Next.js server..."
    cd next-service-dist/ || exit 1

    # Set environment variables
    export NODE_ENV=production
    export PORT=${PORT:-3000}
    export HOSTNAME=${HOSTNAME:-0.0.0.0}

    # Start Next.js in background
    bun server.js &
    NEXT_PID=$!
    pids="$NEXT_PID"

    # Wait briefly to check if process started successfully
    sleep 1
    if ! kill -0 "$NEXT_PID" 2>/dev/null; then
        echo "❌ Next.js server failed to start"
        exit 1
    else
        echo "✅ Next.js server started (PID: $NEXT_PID, Port: $PORT)"
    fi

    cd ../
else
    echo "⚠️  Next.js server file not found: ./next-service-dist/server.js"
fi

# Start mini-services
if [ -f "./mini-services-start.sh" ]; then
    echo "🚀 Starting mini-services..."

    # Run startup script (executed from root, script handles mini-services-dist directory internally)
    sh ./mini-services-start.sh &
    MINI_PID=$!
    pids="$pids $MINI_PID"

    # Wait briefly to check if process started successfully
    sleep 1
    if ! kill -0 "$MINI_PID" 2>/dev/null; then
        echo "⚠️  mini-services may have failed to start, but continuing..."
    else
        echo "✅ mini-services started (PID: $MINI_PID)"
    fi
elif [ -d "./mini-services-dist" ]; then
    echo "⚠️  mini-services startup script not found, but directory exists"
else
    echo "ℹ️  mini-services directory does not exist, skipping"
fi

# Start Caddy (if Caddyfile exists)
echo "🚀 Starting Caddy..."

# Caddy runs as foreground process (main process)
echo "✅ Caddy started (running in foreground)"
echo ""
echo "🎉 All services started!"
echo ""
echo "💡 Press Ctrl+C to stop all services"
echo ""

# Run Caddy as main process
exec caddy run --config Caddyfile --adapter caddyfile
