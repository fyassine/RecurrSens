"""
Production-specific settings.
"""

import warnings

from decouple import Csv, config
from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F401,F403

DEBUG = False

# ==============================================================================
# Secret enforcement — fail loudly rather than boot with insecure defaults.
# base.py keeps dev-friendly defaults so local dev / tests work; production must
# supply real secrets via the environment.
# ==============================================================================
SECRET_KEY = config('DJANGO_SECRET_KEY')
S3_ACCESS_KEY = config('S3_ACCESS_KEY')
S3_SECRET_KEY = config('S3_SECRET_KEY')
ALLOWED_HOSTS = config('ALLOWED_HOSTS', cast=Csv())  # required; no wildcard default

# Re-derive STORAGES so the enforced S3 credentials take effect.
STORAGES['default']['OPTIONS']['access_key'] = S3_ACCESS_KEY  # noqa: F405
STORAGES['default']['OPTIONS']['secret_key'] = S3_SECRET_KEY  # noqa: F405

_INSECURE_VALUES = {
    '',
    'change-me-in-production',
    'django-insecure-dev-key-change-in-production',
    'minioadmin',
}
for _name, _value in (
    ('DJANGO_SECRET_KEY', SECRET_KEY),
    ('S3_ACCESS_KEY', S3_ACCESS_KEY),
    ('S3_SECRET_KEY', S3_SECRET_KEY),
):
    if _value in _INSECURE_VALUES:
        raise ImproperlyConfigured(
            f'{_name} must be set to a secure, non-default value in production.'
        )
if not ALLOWED_HOSTS or '*' in ALLOWED_HOSTS:
    raise ImproperlyConfigured(
        'ALLOWED_HOSTS must be set to explicit hostnames (no wildcard) in production.'
    )

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

# ==============================================================================
# Notification email — production ran for months on the console backend with
# ADMIN_NOTIFICATION_EMAIL left at admin@example.com, so every retention warning
# was written to container stdout and no human ever saw one. Warn loudly rather
# than pretending the notifications are being delivered.
# ==============================================================================
if 'console' in EMAIL_BACKEND or ADMIN_NOTIFICATION_EMAIL.endswith('@example.com'):  # noqa: F405
    warnings.warn(
        'Notification email is not configured (EMAIL_BACKEND='
        f'{EMAIL_BACKEND!r}, ADMIN_NOTIFICATION_EMAIL={ADMIN_NOTIFICATION_EMAIL!r}). '  # noqa: F405
        'Expiry and backup notifications will be discarded to stdout.',
        RuntimeWarning,
        stacklevel=2,
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
