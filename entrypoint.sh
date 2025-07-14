#!/bin/sh

echo "[STARTUP] Minecraft Monitor container starting..."
echo "[STARTUP] Configuring user permissions (UID: ${UID:-1000}, GID: ${GID:-1000})"

# Set default UID/GID if not provided
USER_ID=${UID:-1000}
GROUP_ID=${GID:-1000}

# Create group and user with specified IDs
addgroup -g ${GROUP_ID} appgroup 2>/dev/null || true
adduser -D -u ${USER_ID} -G appgroup appuser 2>/dev/null || true

echo "[STARTUP] Setting file permissions (this may take a moment)..."
# Change ownership of app directory
chown -R appuser:appgroup /app

echo "[STARTUP] Starting application as user appuser..."
# Switch to the specified user and execute the command
exec su-exec appuser "$@"