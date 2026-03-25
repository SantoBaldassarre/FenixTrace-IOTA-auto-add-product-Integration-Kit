# FenixTrace Integration Kit - Docker Setup

This guide explains how to run the FenixTrace Integration Kit with Docker on IOTA L1.

The runtime flow is aligned with frontend: each product file is processed with on-chain publish (`add_product`) and notarization (`/api/notarization` queue).

## Prerequisites

- Docker installed on the system
- Docker Compose installed
- `.env` file configured correctly

## Configuration

1. **Copy the example configuration file:**

   ```bash
   cp .env.example .env
   ```

2. **Edit the `.env` file with your parameters:**

   - `IOTA_PRIVATE_KEY`: Your IOTA wallet private key (hex)
   - `IOTA_NODE_URL`: IOTA node URL (e.g. testnet)
   - `IOTA_PACKAGE_ID`: Published package ID
   - `IOTA_MODULE_COMPANY_SUPPLY_CHAIN`: Module path (e.g. `<package>::company_supply_chain`)
   - `IOTA_COMPANY_OBJECT_ID`: Company object ID provided by FenixTrace
   - `IOTA_NOTARIZATION_GAS_BUDGET`: Gas budget for notarization transaction
   - `FENIXTRACE_API_BASE_URL`: Base URL of the FenixTrace app exposing `/api/notarization`
   - `FENIXTRACE_NOTARIZATION_ENDPOINT`: Notarization endpoint path (default: `/api/notarization`)
   - `PINATA_API_KEY`, `PINATA_SECRET_API_KEY`, `PINATA_JWT`: Pinata credentials

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

Each `process` endpoint executes both publish and notarization steps.

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

### IOTA connectivity issues

1. Verify `IOTA_NODE_URL` in `.env`
2. Check that the private key is valid
3. Verify the wallet balance

### Notarization queue issues

1. Verify `FENIXTRACE_API_BASE_URL` points to a running FenixTrace app
2. Verify `FENIXTRACE_NOTARIZATION_ENDPOINT` is correct
3. Check the FenixTrace app logs for `/api/notarization` errors

### IPFS issues

1. Verify Pinata credentials in `.env`
2. Check internet connectivity

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

- Never commit the `.env` file to version control
- Keep the private key secure and never share it
- Use HTTPS in production
- Consider Docker secrets for sensitive production data

## Production

For production, consider:

1. **Reverse Proxy:** Use nginx or traefik in front of the container
2. **SSL/TLS:** Configure SSL certificates
3. **Monitoring:** Integrate with monitoring systems like Prometheus
4. **Automatic backups:** Configure automatic volume backups
5. **Secrets management:** Use Docker secrets or a vault for sensitive keys
