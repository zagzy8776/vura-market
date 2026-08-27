# Fly.io Deployment Setup for Vura Market

> **Architecture (Aug 2026)**  
> - **Frontend (customers):** [vura-market.vercel.app](https://vura-market.vercel.app)  
> - **API host:** [vura-market.fly.dev](https://vura-market.fly.dev) — proxies `/api/*` to the working API (currently Vercel) until native handlers run on Fly.  
> - Set Fly secrets: `API_ORIGIN`, `FRONTEND_URL`, `CORS_ORIGIN` (see `.env.example`).  
> - On Vercel, leave `VITE_API_BASE_URL` empty until you deliberately point the browser at Fly.

This guide walks through deploying Vura Market to Fly.io for production use.

## Prerequisites

- Fly.io account (you already have one ✅)
- Fly CLI installed (`flyctl`)
- GitHub repository with code committed
- Database (Neon PostgreSQL - already configured)

## Step 1: Login to Fly.io

```bash
flyctl auth login
```

This will open your browser to authenticate. Log in with your Fly.io account.

## Step 2: Create Fly.io App

```bash
# From the vura-market-consolidated directory
flyctl launch --name vura-market-app --region iad --now=false
```

Choose:
- **Region:** iad (US East - Virginia) or pick nearest to your users
- **Database:** No (we use Neon PostgreSQL externally)
- **Do you want to set up Postgresql now?** No

This creates:
- `fly.toml` configuration file ✅ (already created)
- App on Fly.io dashboard

## Step 3: Set Environment Variables

Your app needs database connection and other secrets:

```bash
# Set DATABASE_URL (get from Neon dashboard)
flyctl secrets set DATABASE_URL="postgresql://user:password@host/dbname"

# Set other production secrets
flyctl secrets set NODE_ENV="production"
flyctl secrets set JWT_SECRET="your-secure-random-string-here"
flyctl secrets set VURA_API_KEY="your-api-key"
```

Get your DATABASE_URL from Neon:
1. Go to https://console.neon.tech
2. Select your project
3. Copy the connection string
4. Paste it to: `flyctl secrets set DATABASE_URL="..."`

## Step 4: Deploy

```bash
# Build and deploy to Fly.io
flyctl deploy

# Or with verbose output
flyctl deploy --verbose
```

The first deployment will:
- Build Docker image
- Push to Fly.io registry
- Start 1 shared-cpu machine
- Run health checks
- Enable auto-scaling

## Step 5: Verify Deployment

```bash
# Check app status
flyctl status

# View recent logs
flyctl logs

# Check health endpoint
curl https://vura-market-app.fly.dev/health

# Check admin health (more detailed)
curl https://vura-market-app.fly.dev/api/admin?resource=health
```

## Step 6: Set Custom Domain (Optional)

```bash
# Add your custom domain
flyctl certs create yourdomain.com
flyctl certs create www.yourdomain.com
```

Then update DNS:
1. Add CNAME record pointing to `vura-market-app.fly.dev`
2. Wait for DNS propagation (~24 hours)

## Monitoring & Maintenance

### View Logs

```bash
# Real-time logs
flyctl logs --follow

# Last 100 lines
flyctl logs --lines 100
```

### Scale Your App

```bash
# Scale to 2 machines
flyctl scale count 2

# Scale back to 1
flyctl scale count 1

# View current machines
flyctl machines list
```

### Update Deployment

```bash
# Make code changes, then:
git add .
git commit -m "Your changes"
git push

# Deploy new version
flyctl deploy
```

### Restart Application

```bash
# Restart all machines
flyctl restart

# Or redeploy (recommended)
flyctl deploy --strategy immediate
```

## Configuration Details

### fly.toml Overview

- **app:** Application name (`vura-market-app`)
- **primary_region:** iad (US East Virginia)
- **build:** Uses Paketo buildpacks with Node.js
- **http_service:** Port 3000, HTTPS enforced
- **checks:** Health check every 30s at `/api/health`
- **vm:** shared-cpu-1x with 256MB RAM (free tier)

### Scaling Options

**Current (Free Tier):**
- 1 shared-cpu machine
- 256MB RAM
- ~3,000 requests/day capacity

**When to upgrade:**

| Tier | Cost | RAM | Capacity |
|------|------|-----|----------|
| Shared CPU | Free | 256MB | 3K req/day |
| Performance-1x | $5/mo | 1GB | 100K req/day |
| Performance-2x | $20/mo | 2GB | 500K req/day |

Scale up when:
- Response times > 1s
- Database connections maxed out
- Memory usage > 80%

### Database Connection Pooling

For better performance, consider:

1. **Neon Connection Pooling** (recommended):
   ```bash
   # Use pooler endpoint instead of direct connection
   # postgresql://user:password@host/dbname?sslmode=require
   ```

2. **Enable in Fly.io:**
   ```bash
   flyctl secrets set DATABASE_URL="pooler-endpoint-from-neon"
   ```

## Troubleshooting

### App won't start

```bash
# Check logs
flyctl logs

# Check app status
flyctl status

# Common issues:
# - DATABASE_URL not set: flyctl secrets list
# - Port not listening on 3000
# - Health check failing
```

### Health check failing

```bash
# Test health endpoint locally
curl http://localhost:3000/health

# Test in Fly.io
flyctl ssh console
curl http://localhost:3000/health
```

### High memory usage

```bash
# Current RAM allocation
flyctl status

# Reduce Node.js memory
flyctl secrets set NODE_OPTIONS="--max-old-space-size=256"

# Deploy again
flyctl deploy
```

## Backup & Recovery

### Database Backups (Neon handles this)

Neon automatically backs up your database. To restore:
1. Go to Neon console
2. Select your branch
3. Choose backup point
4. Restore

### Application Rollback

```bash
# List recent deployments
flyctl releases

# Rollback to previous version
flyctl releases rollback
```

## Production Checklist

- [ ] DATABASE_URL set correctly
- [ ] All secrets configured (JWT_SECRET, API keys)
- [ ] Health check passing
- [ ] Logs look clean (no errors)
- [ ] Domain DNS configured (if using custom domain)
- [ ] HTTPS working (automatic with Fly.io)
- [ ] Monitored first 24 hours
- [ ] Error tracking setup (optional: Sentry, Rollbar)

## Next Steps

1. **Deploy first version:**
   ```bash
   flyctl deploy
   ```

2. **Monitor for 24 hours:**
   ```bash
   flyctl logs --follow
   ```

3. **Upgrade if needed:**
   ```bash
   flyctl scale vm performance-1x
   flyctl scale count 2
   ```

## Useful Links

- [Fly.io Dashboard](https://fly.io/dashboard)
- [Fly.io Docs](https://fly.io/docs/)
- [Node.js on Fly.io](https://fly.io/docs/languages-and-frameworks/nodejs/)
- [Custom Domains](https://fly.io/docs/app-guides/custom-domains-automation/)

## Support

For Fly.io issues:
- Docs: https://fly.io/docs
- Community: https://community.fly.io
- Status: https://status.fly.io

For Vura Market issues, check:
- Recent logs: `flyctl logs`
- API health: `https://vura-market-app.fly.dev/api/admin?resource=health`
- GitHub issues

---

**Deployment Date:** August 26, 2026  
**Configuration Version:** 1.0  
**Last Updated:** August 26, 2026
