"""
Production-specific settings.
"""
from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F401,F403

DEBUG = False

# ==============================================================================
# Database backup — GPG encryption is mandatory whenever enabled, since the
# nightly dump contains real patient data. Fail loudly at boot rather than
# silently uploading an unencrypted dump.
# ==============================================================================
if DB_BACKUP_ENABLED and not (DB_BACKUP_GPG_RECIPIENT and DB_BACKUP_GPG_PUBLIC_KEY):  # noqa: F405
    raise ImproperlyConfigured(
        'DB_BACKUP_ENABLED=true requires both GPG_RECIPIENT_KEY and '
        'GPG_PUBLIC_KEY to be set (database backups must be encrypted).'
    )

# Security settings
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
X_FRAME_OPTIONS = 'DENY'
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# Behind nginx reverse proxy — trust X-Forwarded-Proto so Django knows the
# request is HTTPS, otherwise CSRF rejects HTTPS Origin headers
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
USE_X_FORWARDED_HOST = True

# Only JSON renderer in production (no browsable API)
REST_FRAMEWORK['DEFAULT_RENDERER_CLASSES'] = [  # noqa: F405
    'rest_framework.renderers.JSONRenderer',
]

# Logging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'WARNING',
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': 'WARNING',
            'propagate': False,
        },
        'patients': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}
