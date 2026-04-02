#!/bin/bash
set -e

echo "=== Running database migrations ==="
python manage.py migrate --noinput

echo "=== Loading exercise fixtures ==="
python manage.py loaddata exercises || echo "Fixtures already loaded or not found"

echo "=== Creating superuser if not exists ==="
python manage.py shell -c "
from django.contrib.auth import get_user_model
User = get_user_model()
if not User.objects.filter(username='admin').exists():
    User.objects.create_superuser('admin', 'admin@example.com', 'admin')
    print('Superuser created: admin / admin')
else:
    print('Superuser already exists')
"

echo "=== Collecting static files ==="
python manage.py collectstatic --noinput

echo "=== Starting application ==="
exec "$@"
