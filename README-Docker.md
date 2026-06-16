# FenixTrace Integration Kit - Docker Setup

This guide explains how to run the FenixTrace Integration Kit with Docker.

The kit runs in **API mode**: each product file is uploaded to FenixTrace via `POST /api/v1/products` using your API key. FenixTrace then performs IPFS pinning, the on-chain publish (`add_product`), and notarization server-side. The kit needs no wallet, no gas, and no IPFS keys.

## Prerequisites

- Docker installed on the system
- Docker Compose installed
- `.env` file configured correctly (a FenixTrace API key)

## Configuration

1. **Copy the example configuration file:**

   ```bash
   cp .env.example .env
   ```

2. **Edit the `.env` file with your parameters:**

   - `FENIXTRACE_API_KEY`: Your FenixTrace API key from the dashboard → **Chiavi API** (format `ftrace_<id>_<secret>`)
   - `FENIXTRACE_API_BASE_URL`: Base URL of the FenixTrace app — `https://fenixtrace.com` (prod) or `http://localhost:3000` (dev)

   These two variables are the only required configuration. No wallet, gas, package IDs, or Pinata/IPFS credentials are needed — FenixTrace handles signing, IPFS pinning, and notarization server-side.

## Using Docker

### Option 1: Docker Compose (Recommended)

1. **Start the service:**

   ```bash
   docker-compose up -d
   ```

2. **View logs:**

   ```bash
   docker-compose logs -f
   ```

3. **Stop the service:**

   ```bash
   docker-compose down
   ```

### Option 2: Direct Docker

1. **Build the image:**

   ```bash
   docker build -t fenixtrace-integration .
   ```

2. **Run the container:**

   ```bash
   docker run -d \
     --name fenixtrace-integration-kit \
     -p 3005:3005 \
     --env-file .env \
     -v $(pwd)/uploads:/app/uploads \
     -v $(pwd)/processed:/app/processed \
     -v $(pwd)/logs:/app/logs \
     fenixtrace-integration
   ```

## Volumes and Persistence

The container uses these volumes for data persistence:

- `./uploads:/app/uploads` - JSON files to process
- `./processed:/app/processed` - Processed files
- `./logs:/app/logs` - Application logs

## Available Endpoints

Once the container is running, the application is available at `http://localhost:3005`:

- `GET /` - Main endpoint
- `GET /health` - Docker health check
- `GET /status` - Detailed application status
- `GET /processed` - List of processed products
- `GET /logs` - List of log files
- `POST /process-all` - Process all files in uploads
- `POST /process/:filename` - Process a specific file

Each `process` endpoint uploads the product to FenixTrace, which performs IPFS pinning, on-chain publish, and notarization server-side.

## Monitoring

### Health Check

Docker Compose includes a health check every 30 seconds.

### Logs

To view logs in real time:

```bash
docker-compose logs -f fenixtrace-integration
```

### Container Status

```bash
docker-compose ps
```

## Troubleshooting

### Container does not start

1. Verify the `.env` file is configured correctly
2. Check logs: `docker-compose logs fenixtrace-integration`
3. Verify the port is not already in use

### Cannot reach FenixTrace

1. Verify `FENIXTRACE_API_BASE_URL` points to a running FenixTrace app
2. Check internet connectivity from the container
3. Inspect the health endpoint: `curl http://localhost:3005/health`

### Unauthorized / 401 from FenixTrace

1. Verify `FENIXTRACE_API_KEY` is correct and not revoked in the dashboard
2. Confirm your FenixTrace subscription is active

## Updating

To update the application:

1. **Stop the service:**

   ```bash
   docker-compose down
   ```

2. **Rebuild the image:**

   ```bash
   docker-compose build --no-cache
   ```

3. **Restart the service:**

   ```bash
   docker-compose up -d
   ```

## Backup

To back up important data:

```bash
# Backup configuration
cp .env .env.backup

# Backup processed files
tar -czf processed-backup-$(date +%Y%m%d).tar.gz processed/

# Backup logs
tar -czf logs-backup-$(date +%Y%m%d).tar.gz logs/
```

## Security

- Never commit the `.env` file to version control — it contains your `FENIXTRACE_API_KEY`
- Treat the API key like a password; revoke and regenerate it from the dashboard if it leaks
- Use HTTPS in production (`https://fenixtrace.com`) so the API key travels encrypted
- Consider Docker secrets for the API key in sensitive production setups

## Production

For production, consider:

1. **Reverse Proxy:** Use nginx or traefik in front of the container
2. **SSL/TLS:** Configure SSL certificates
3. **Monitoring:** Integrate with monitoring systems like Prometheus
4. **Automatic backups:** Configure automatic volume backups
5. **Secrets management:** Use Docker secrets or a vault for the API key
