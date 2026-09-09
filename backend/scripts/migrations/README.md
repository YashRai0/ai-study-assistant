# Database Migrations

Migrations manage schema changes and ensure consistency across deployments.

## Running Migrations

**Apply all pending migrations:**
```bash
node scripts/migrate.js up
```

**Rollback last migration:**
```bash
node scripts/migrate.js down
```

## Available Migrations

| File | Description |
|------|-------------|
| 001_create_user_streak.js | UserStreak collection + indexes for streak tracking |
| 002_create_misconception_pattern.js | MisconceptionPattern collection for pattern library |
| 003_create_intervention_outcome.js | InterventionOutcome collection for effectiveness tracking |
| 004_create_prompt_usage.js | PromptUsage collection for A/B testing |
| 005_student_concept_indexes.js | StudentConcept spaced-repetition review indexes |

## Migration History

Applied migrations are tracked in `migrations_history` collection. Each record includes:
- `name`: Migration file name
- `direction`: "up" or "down"
- `appliedAt`: Timestamp

## Best Practices

- Run migrations before deploying new code
- Test migrations on staging first
- Never delete old migration files
- Each migration should be idempotent (safe to run multiple times)
- Monitor migration logs for errors
