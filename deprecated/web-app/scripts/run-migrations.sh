#!/bin/sh

# Wait for PostgreSQL to be ready
until pg_isready -h postgres -U $POSTGRES_USER -d $POSTGRES_DB; do
  echo "PostgreSQL is unavailable - sleeping"
  sleep 1
done

echo "PostgreSQL is up - executing command"

# Apply Prisma migrations
./node_modules/.bin/prisma migrate deploy