# Database Migration Strategy

## Overview

AgoraX uses Drizzle ORM with PostgreSQL. Migrations are managed via `drizzle-kit` with the following workflow:

## Migration Workflow

### Development

1. **Modify schema** in `shared/schema.ts`
2. **Generate migration**:
   ```bash
   DATABASE_URL=postgresql://... npx drizzle-kit generate
   ```
3. **Review migration** in `migrations/` directory
4. **Apply migration**:
   ```bash
   DATABASE_URL=postgresql://... npx drizzle-kit push
   ```

### Production

1. **Generate migration** locally
2. **Review migration** SQL in PR
3. **Merge PR** with migration file
4. **Deploy** with migration auto-applied via Docker entrypoint

## Migration Safety

### Backward Compatibility

- **Never drop columns** without deprecation period
- **Never rename tables** without alias creation
- **Always add NOT NULL columns** with default values
- **Use two-phase migrations** for breaking changes:
  1. Add new column, backfill data
  2. Remove old column in subsequent migration

### Rollback Strategy

- **Keep last 3 migration versions** for rollback capability
- **Test migrations** against production snapshot before deploying
- **Use transactions** for all migrations (Drizzle default)

## Migration Commands

```bash
# Generate new migration
DATABASE_URL=postgresql://user:pass@localhost:5432/agorax npx drizzle-kit generate

# Apply migrations
DATABASE_URL=postgresql://user:pass@localhost:5432/agorax npx drizzle-kit push

# Create migration SQL file
DATABASE_URL=postgresql://user:pass@localhost:5432/agorax npx drizzle-kit up

# Drop all tables (development only!)
DATABASE_URL=postgresql://user:pass@localhost:5432/agorax npx drizzle-kit drop
```

## CI/CD Integration

Migrations are automatically applied during deployment via Docker entrypoint:

```dockerfile
# Dockerfile
RUN npx drizzle-kit push
```

## Monitoring

- **Migration duration** logged in application startup
- **Schema version** tracked in `drizzle_migrations` table
- **Health check** verifies schema compatibility

## Best Practices

1. **One migration per change** — keep migrations atomic
2. **Name migrations descriptively** — `add_user_location_column.sql`
3. **Test migrations** against empty and populated databases
4. **Review migration SQL** before merging
5. **Document breaking changes** in release notes
