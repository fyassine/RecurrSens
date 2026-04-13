#!/bin/bash
set -e

echo "=== Running database migrations ==="
python manage.py migrate --noinput

echo "=== Loading exercise fixtures ==="
python manage.py loaddata exercises || echo "Fixtures already loaded or not found"

echo "=== Creating superuser if not exists ==="
python manage.py shell -c "
from django.contrib.auth import get_user_model
import os
User = get_user_model()
username = os.environ.get('DJANGO_SUPERUSER_USERNAME', 'admin')
email = os.environ.get('DJANGO_SUPERUSER_EMAIL', 'admin@example.com')
password = os.environ.get('DJANGO_SUPERUSER_PASSWORD', 'admin')
if not User.objects.filter(username=username).exists():
    User.objects.create_superuser(username, email, password)
    print(f'Superuser created: {username}')
else:
    print('Superuser already exists')
"

echo "=== Collecting static files ==="
python manage.py collectstatic --noinput

echo "=== Starting application ==="
exec "$@"
