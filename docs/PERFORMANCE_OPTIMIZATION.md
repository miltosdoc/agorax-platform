# Performance Optimization Guide

## Database Optimization

### Indexing Strategy

```sql
-- High-traffic queries
CREATE INDEX idx_proposals_community_id ON proposals(community_id);
CREATE INDEX idx_proposals_status ON proposals(status);
CREATE INDEX idx_proposals_created_at ON proposals(created_at DESC);

-- Sortition queries
CREATE INDEX idx_sortition_members_body_id ON sortition_members(body_id);
CREATE INDEX idx_sortition_members_status ON sortition_members(status);

-- Voting queries
CREATE INDEX idx_votes_proposal_id ON votes(proposal_id);
CREATE INDEX idx_votes_user_id ON votes(user_id);
CREATE INDEX idx_votes_created_at ON votes(created_at DESC);

-- Community queries
CREATE INDEX idx_communities_slug ON communities(slug);
CREATE INDEX idx_communities_created_at ON communities(created_at DESC);
```

### Query Optimization

- Use `SELECT` with specific columns instead of `SELECT *`
- Avoid N+1 queries with eager loading
- Use pagination with cursor-based approach
- Cache frequently accessed data (Redis)

### Connection Pooling

```typescript
// Drizzle connection pool configuration
const pool = new Pool({
  max: 20, // Maximum connections
  idleTimeoutMillis: 30000, // 30s idle timeout
  connectionTimeoutMillis: 2000, // 2s connection timeout
});
```

## API Optimization

### Caching Strategy

```typescript
// Response caching with Redis
const cache = new RedisCache({
  ttl: 300, // 5 minutes
  prefix: 'agorax:',
});

// Cache community data
await cache.set(`community:${id}`, community, 300);

// Cache proposal list
await cache.set(`proposals:${communityId}`, proposals, 60);
```

### Compression

```typescript
// Enable gzip compression
app.use(compression({
  level: 6, // Compression level (1-9)
  threshold: 1024, // Only compress responses > 1KB
}));
```

### Rate Limiting

```typescript
// Tiered rate limiting
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
}));

app.use('/api/auth/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // 10 requests per window (login attempts)
}));

app.use('/api/votes/', rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 votes per minute
}));
```

## Frontend Optimization

### Code Splitting

```typescript
// Lazy load components
const ProposalDetail = lazy(() => import('./ProposalDetail'));
const SortitionPanel = lazy(() => import('./SortitionPanel'));
const VotingPanel = lazy(() => import('./VotingPanel'));
```

### Asset Optimization

```typescript
// Vite configuration
export default defineConfig({
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          ui: ['@radix-ui/react-*'],
        },
      },
    },
  },
});
```

### Image Optimization

```typescript
// Use WebP format with fallback
<img src="image.webp" type="image/webp" />
<img src="image.jpg" type="image/jpeg" />
```

## Infrastructure Optimization

### Docker Optimization

```dockerfile
# Multi-stage build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### CDN Configuration

```nginx
# Nginx configuration for static assets
location /static/ {
    expires 30d;
    add_header Cache-Control "public, immutable";
    add_header Content-Type $content_type;
}

# API responses
location /api/ {
    proxy_pass http://localhost:3000;
    add_header Cache-Control "no-cache, no-store, must-revalidate";
}
```

### Database Connection Pooling

```yaml
# Docker Compose
services:
  postgres:
    environment:
      POSTGRES_MAX_CONNECTIONS: "100"
      POSTGRES_SHARED_BUFFERS: "256MB"
      POSTGRES_EFFECTIVE_CACHE_SIZE: "1GB"
      POSTGRES_WORK_MEM: "4MB"
```

## Monitoring & Alerting

### Performance Metrics

```typescript
// Request timing middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 500) {
      logger.warn(`Slow request: ${req.method} ${req.path} (${duration}ms)`);
    }
  });
  next();
});
```

### Health Check

```typescript
// Health check endpoint
app.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    uptime: process.uptime(),
    memory: {
      rss: process.memoryUsage().rss,
      heapUsed: process.memoryUsage().heapUsed,
    },
    database: await checkDatabase(),
    redis: await checkRedis(),
  };
  res.json(health);
});
```

## Load Testing

### Running Load Tests

```bash
# Basic load test
node scripts/load-test.js

# Custom configuration
DURATION=120 USERS=100 RPS=20 node scripts/load-test.js

# With custom base URL
BASE_URL=http://staging.agorax.example.com node scripts/load-test.js
```

### Interpreting Results

- **RPS (Requests Per Second)**: Higher is better
- **Avg Latency**: Lower is better (<100ms ideal)
- **Error Rate**: Should be <1%
- **P95 Latency**: 95th percentile latency (<200ms ideal)

## Optimization Checklist

- [ ] Database indexes created for high-traffic queries
- [ ] Connection pooling configured
- [ ] Response caching implemented
- [ ] Gzip compression enabled
- [ ] Rate limiting configured
- [ ] Frontend code splitting implemented
- [ ] Asset optimization configured
- [ ] Docker multi-stage build
- [ ] CDN configuration
- [ ] Performance monitoring in place
- [ ] Load testing completed
- [ ] Performance benchmarks documented
