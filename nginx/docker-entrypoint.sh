#!/bin/sh
# Entrypoint script for the production nginx container.
# Conditionally enables the staging proxy config if the staging SSL cert exists.

STAGING_CERT="/etc/letsencrypt/live/staging.recurrsens.eu/fullchain.pem"
STAGING_TEMPLATE="/etc/nginx/staging-proxy.conf.template"
STAGING_CONF="/etc/nginx/conf.d/staging.conf"

if [ -f "$STAGING_CERT" ] && [ -f "$STAGING_TEMPLATE" ]; then
    echo "[entrypoint] Staging SSL cert found — enabling staging proxy"
    cp "$STAGING_TEMPLATE" "$STAGING_CONF"
else
    echo "[entrypoint] No staging SSL cert — staging proxy disabled"
    # Create empty file so nginx 'include' directive doesn't error
    : > "$STAGING_CONF"
fi

exec "$@"
