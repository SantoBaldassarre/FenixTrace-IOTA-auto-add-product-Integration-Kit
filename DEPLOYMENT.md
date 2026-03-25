# Deployment and Production Operations Guide

This guide covers production deployment and operational monitoring for the FenixTrace Integration Kit on IOTA L1.

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
- IOTA connectivity verification
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
  "blockchain": {
    "connected": true,
    "network": "iota-testnet",
    "walletBalance": "100000000"
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
IOTA_PRIVATE_KEY=your_iota_private_key_hex_or_bech32
IOTA_NODE_URL=https://api.testnet.iota.cafe
IOTA_PACKAGE_ID=your_package_id_here
IOTA_MODULE_COMPANY_SUPPLY_CHAIN=your_package_id_here::company_supply_chain
IOTA_COMPANY_OBJECT_ID=your_company_object_id_here
IOTA_CLOCK_OBJECT=0x6
IOTA_GAS_BUDGET=100000000
IOTA_NOTARIZATION_GAS_BUDGET=100000000
IOTA_COIN_TYPE=0x2::iota::IOTA
FENIXTRACE_API_BASE_URL=http://localhost:3000
FENIXTRACE_NOTARIZATION_ENDPOINT=/api/notarization

PINATA_API_KEY=your_pinata_api_key_here
PINATA_SECRET_API_KEY=your_pinata_secret_api_key_here
PINATA_JWT=your_pinata_jwt_token_here
PINATA_API_URL=https://api.pinata.cloud
PINATA_GATEWAY_URL=https://gateway.pinata.cloud/ipfs/

PORT=3005
NODE_ENV=production
AUTO_PROCESS=true
AUTO_PROCESS_INTERVAL_MINUTES=1
```

The integration kit now uses a 2-step publishing flow per product: on-chain `add_product` + on-chain notarization + enqueue on FenixTrace `/api/notarization`.

## 🚨 Troubleshooting

### Common Issues

1. **Process does not start**

   ```bash
   pm2 logs fenixtrace-integration --lines 50
   ```

2. **IOTA connection failed**

   ```bash
   curl http://localhost:3005/health
   ```

3. **Notarization queue failed**

   ```bash
   curl http://localhost:3005/status
   ```

   - Verify `FENIXTRACE_API_BASE_URL`
   - Verify `FENIXTRACE_NOTARIZATION_ENDPOINT`
   - Check frontend logs for `/api/notarization`

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
   - Rotate credentials
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
