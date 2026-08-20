# Contributing to AgoraX

Thank you for your interest in contributing to AgoraX! This guide will help you get started.

## Code of Conduct

We follow the [Contributor Covenant](https://www.contributor-covenant.org/version/2/0/code_of_conduct/). Please read and follow it.

## Development Setup

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Docker & Docker Compose (optional)

### Local Development

```bash
# Clone the repository
git clone https://github.com/miltosdoc/agoraxdemocracy.git
cd agoraxdemo

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your database credentials

# Start the database
docker-compose up -d postgres

# Run database migrations
DATABASE_URL=postgresql://user:pass@localhost:5432/agorax npx drizzle-kit push

# Start development servers
npm run dev
```

### Project Structure

```
agoraxdemo/
├── server/
│   ├── routers/          # 12 domain-specific routers
│   ├── storage/          # 9 domain repositories
│   ├── utils/            # 19 utility modules
│   └── index.ts          # Express application entry point
├── client/
│   ├── src/
│   │   ├── components/   # 107 TSX components
│   │   ├── pages/        # Page components
│   │   └── i18n/         # en/el translations
│   └── vite.config.ts
├── tests/
│   ├── unit/             # Unit tests
│   ├── integration/      # Integration tests
│   └── e2e/              # Playwright E2E tests
├── docs/                 # Documentation
└── scripts/              # Utility scripts
```

## Making Changes

### 1. Fork and Clone

```bash
git clone https://github.com/YOUR_USERNAME/agoraxdemo.git
cd agoraxdemo
git remote add upstream https://github.com/miltosdoc/agoraxdemocracy.git
```

### 2. Create a Branch

```bash
# Feature branch
git checkout -b feature/your-feature-name

# Bug fix branch
git checkout -b fix/your-bug-fix-name

# Documentation branch
git checkout -b docs/your-docs-name
```

### 3. Make Your Changes

Follow our coding standards:

- **TypeScript**: Strict mode enabled, no `any` types
- **File size**: <400 lines per file
- **JSDoc**: All public APIs must be documented
- **Console.log**: Zero in production code
- **Tests**: All changes must include tests

### 4. Run Tests

```bash
# Unit and integration tests
npm test

# TypeScript compilation
npx tsc --noEmit

# Modularity check
node scripts/check-modularity.cjs

# E2E tests (requires running app)
npx playwright test
```

### 5. Commit Your Changes

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```bash
# Features
git commit -m "feat: add new proposal status"

# Bug fixes
git commit -m "fix: resolve sortition bias issue"

# Documentation
git commit -m "docs: update API reference"

# Refactoring
git commit -m "refactor: split storage layer into domains"

# Testing
git commit -m "test: add E2E tests for voting"

# Performance
git commit -m "perf: optimize proposal list query"

# Security
git commit -m "security: fix XSS vulnerability in comments"
```

### 6. Push and Create Pull Request

```bash
git push origin feature/your-feature-name
```

Then create a PR on GitHub with:
- Clear description of changes
- Screenshots for UI changes
- Test results
- Any breaking changes noted

## Code Review Process

1. **Self-review**: Check your code against our standards
2. **Automated checks**: CI must pass (lint, typecheck, tests)
3. **Manual review**: At least one maintainer approval
4. **Merge**: Squash merge to main branch

## Coding Standards

### TypeScript

```typescript
// ✅ Good: Typed parameters and return values
async function getUser(id: number): Promise<User | null> {
  return await userRepo.getUser(id);
}

// ❌ Bad: Using any
async function getUser(id: any): Promise<any> {
  return await userRepo.getUser(id);
}
```

### JSDoc

```typescript
/**
 * Get a user by ID.
 *
 * @param id - The user's unique identifier
 * @returns The user object or null if not found
 */
async function getUser(id: number): Promise<User | null> {
  // ...
}
```

### Error Handling

```typescript
// ✅ Good: Specific error handling
try {
  await storage.createUser(user);
} catch (error) {
  if (error instanceof UniqueViolationError) {
    throw new ConflictError('User already exists');
  }
  logger.error('Failed to create user', { error });
  throw new InternalError('Database error');
}

// ❌ Bad: Generic catch
try {
  await storage.createUser(user);
} catch (error) {
  console.error(error); // Never use console in production
  throw error;
}
```

### Logging

```typescript
// ✅ Good: Structured logging
import { logger } from '../utils/logger';

logger.info('User created', { userId: user.id, email: user.email });
logger.warn('Rate limit approaching', { userId: user.id, count: 95 });
logger.error('Database connection failed', { error: error.message });

// ❌ Bad: Console logging
console.log('User created:', user); // Never use console in production
```

## Testing Guidelines

### Unit Tests

- Test pure functions and utilities
- Mock external dependencies
- Use descriptive test names

```typescript
describe('calculateDemocracyScore', () => {
  it('should return 100 for perfect community', () => {
    const score = calculateDemocracyScore(perfectCommunity);
    expect(score).toBe(100);
  });
});
```

### Integration Tests

- Test API endpoints
- Test database operations
- Use test database

```typescript
describe('POST /api/proposals', () => {
  it('should create a new proposal', async () => {
    const response = await request(app)
      .post('/api/proposals')
      .send({ title: 'Test', description: 'Test proposal' });
    
    expect(response.status).toBe(201);
    expect(response.body.title).toBe('Test');
  });
});
```

### E2E Tests

- Test critical user flows
- Use Playwright
- Run against running application

```typescript
test('should create a proposal', async ({ page }) => {
  await page.goto('/dashboard');
  await page.getByRole('button', { name: /new proposal/i }).click();
  await page.getByLabel('Title').fill('Test');
  await page.getByRole('button', { name: /submit/i }).click();
  await expect(page).toHaveURL(/\/proposals\/\d+/);
});
```

## Documentation

### When to Update Docs

- Adding new features
- Changing API endpoints
- Modifying configuration
- Fixing bugs with workarounds

### Where to Update

- `docs/API.md` — API endpoint changes
- `docs/ARCHITECTURE.md` — Architecture changes
- `README.md` — High-level changes
- `docs/SECURITY_AUDIT.md` — Security changes
- `docs/PERFORMANCE_OPTIMIZATION.md` — Performance changes

## Release Process

1. **Version bump**: Update `package.json` version
2. **Changelog**: Update `CHANGELOG.md`
3. **Tag**: `git tag -a v1.2.3 -m "Release v1.2.3"`
4. **Push**: `git push origin main --tags`
5. **GitHub Release**: Create release with notes

## Getting Help

- **Issues**: For bugs and feature requests
- **Discussions**: For questions and ideas
- **Discord**: For real-time chat (link in README)

## Recognition

Contributors are recognized in:
- `CONTRIBUTORS.md`
- Release notes
- README contributors section

Thank you for contributing to AgoraX! 🎉
