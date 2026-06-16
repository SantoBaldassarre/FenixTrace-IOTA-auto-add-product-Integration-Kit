# Deployment and Production Operations Guide

This guide covers production deployment and operational monitoring for the FenixTrace Integration Kit.

The kit runs in **API mode**: it authenticates with a FenixTrace API key and uploads product data to FenixTrace via `POST /api/v1/products`. FenixTrace then performs IPFS pinning, the on-chain `add_product` transaction, and notarization server-side. The kit holds no wallet, no gas, and no IPFS keys.

## ✅ Crash Prevention and Reliability

The project uses PM2 for process resilience and monitoring.

### 1) Process Manager (PM2)
- Auto-restart on crash
- Cluster mode support
- Memory monitoring
- Centralized log management
- Graceful shutdown

### 2) Health Checks
- `/health` full status check
- `/ping` lightweight check
- `/process-all` and `/process/:filename` operational endpoints
- FenixTrace API reachability verification
- Filesystem checks for uploads/processed/logs
- Basic performance metrics

### 3) Error Handling
- SIGINT/SIGTERM/SIGUSR2 graceful shutdown
- Uncaught exceptions captured
- Unhandled promise rejections handled
- Automatic recovery with restart limits

## 🚀 Production Start (PM2)

```bash
# Install PM2 globally
npm install -g pm2

# Start the application
npm run pm2:start

# Check status
pm2 list

# Persist PM2 startup on boot
pm2 save
pm2 startup
```

## 📊 Monitoring Commands

```bash
# Real-time monitoring
pm2 monit

# View logs
pm2 logs fenixtrace-integration

# Health check
curl http://localhost:3005/health

# Utility script
./pm2-utils.sh health
```

## 🔁 Process Management

```bash
# Zero-downtime reload
pm2 reload fenixtrace-integration

# Full restart
pm2 restart fenixtrace-integration

# Stop the app
pm2 stop fenixtrace-integration

# Remove the process
pm2 delete fenixtrace-integration
```

## 📊 Health Response Example

```json
{
  "status": "healthy",
  "timestamp": "2026-03-02T12:00:00.000Z",
  "uptime": 3600,
  "memory": {
    "used": 85,
    "total": 128,
    "external": 12
  },
  "fenixtrace": {
    "apiReachable": true,
    "baseUrl": "https://fenixtrace.com"
  },
  "filesystem": {
    "uploadsAccessible": true,
    "processedAccessible": true,
    "logsAccessible": true
  },
  "processing": {
    "isProcessing": false,
    "isAutoProcessingActive": true,
    "autoProcessEnabled": true
  },
  "responseTime": 45
}
```

## 🔧 Environment Checklist

```bash
# FenixTrace API (required)
FENIXTRACE_API_KEY=ftrace_<id>_<secret>
FENIXTRACE_API_BASE_URL=https://fenixtrace.com

# Server / processing (optional, with defaults)
PORT=3005
NODE_ENV=production
AUTO_PROCESS=true
AUTO_PROCESS_INTERVAL_MINUTES=1
```

These two FenixTrace variables are the only required configuration. The kit uploads each product to FenixTrace, which performs IPFS pinning, the on-chain `add_product` transaction, and notarization server-side — no wallet, gas, or IPFS keys are configured on the kit.

## 🚨 Troubleshooting

### Common Issues

1. **Process does not start**

   ```bash
   pm2 logs fenixtrace-integration --lines 50
   ```

2. **Cannot reach FenixTrace**

   ```bash
   curl http://localhost:3005/health
   ```

   - Verify `FENIXTRACE_API_BASE_URL` is reachable from the kit
   - Confirm the FenixTrace app is running

3. **Unauthorized / 401 from FenixTrace**

   ```bash
   curl http://localhost:3005/status
   ```

   - Verify `FENIXTRACE_API_KEY` is correct and not revoked in the dashboard
   - Confirm your FenixTrace subscription is active

4. **Filesystem not accessible**

   ```bash
   ls -la uploads/ processed/ logs/
   chmod 755 uploads/ processed/ logs/
   ```

## ✅ Best Practices

1. **Continuous Monitoring**
   - Set alerts for CPU > 80%
   - Watch memory usage
   - Check `/health` periodically

2. **Log Management**
   - Rotate logs regularly
   - Archive logs weekly
   - Review errors frequently

3. **Backups**
   - Backup PM2 configuration
   - Backup processed files
   - Document recovery procedures

4. **Security**
   - Rotate the API key periodically (revoke + regenerate from the dashboard)
   - Use HTTPS in production
   - Do not commit `.env`

## 🔄 Deployment Workflow

```bash
# 1) Prepare
git pull origin main
npm install

# 2) Validate
npm run pm2:stop
npm run pm2:start
curl http://localhost:3005/health

# 3) Deploy (zero-downtime)
pm2 reload fenixtrace-integration

# 4) Verify
./pm2-utils.sh health
pm2 logs fenixtrace-integration --lines 20

# 5) Monitor
pm2 monit
```
