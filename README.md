# FenixTrace Integration Kit

Standalone Node.js server that registers your products on **FenixTrace** — fully automated.
Drop a JSON file into the `uploads/` folder (or call the REST API) and the kit uploads it to FenixTrace with your **API key**. FenixTrace then handles everything server-side: IPFS pinning, the on-chain `add_product` transaction, and notarization.

> **Built by [Fenix Software Labs](https://www.fenixsoftwarelabs.com)** — the team behind FenixTrace.

---

## How It Works

```
 Your System          Integration Kit              FenixTrace (server-side)
 ──────────           ───────────────              ────────────────────────
  JSON file   ──►  1. Read from uploads/      ──►  IPFS pinning (CID)
                   2. POST /api/v1/products    ──►  on-chain add_product (Tx)
                      (with FENIXTRACE_API_KEY)──►  notarization (Tx)
                   3. Move file to processed/
```

The kit holds **no wallet, no private key, no gas, and no IPFS keys**. It only authenticates with your FenixTrace API key and forwards product data. FenixTrace performs signing, IPFS, and notarization for you.

Each product gets:

- An **IPFS CID** (immutable content hash)
- A **blockchain transaction** on IOTA L1
- A **notarization transaction** proving integrity
- A public page on the **FenixTrace Scanner**

---

## Prerequisites

| Requirement                 | Details                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| **Node.js**                 | v16+ (v18 LTS recommended)                                                               |
| **FenixTrace Subscription** | Active plan on [fenixtrace.com](https://fenixtrace.com)                                  |
| **FenixTrace API Key**      | Generated from the dashboard → **Chiavi API** (format `ftrace_<id>_<secret>`)            |

No wallet, no gas, and no Pinata/IPFS account are required on your side — FenixTrace handles signing, IPFS pinning, and notarization server-side.

---

## Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/SantoBaldassarre/FenixTrace-IOTA-auto-add-product-Integration-Kit.git
cd FenixTrace-IOTA-auto-add-product-Integration-Kit
npm install
```

### 2. Generate an API Key

Log in to your **FenixTrace Dashboard** → **Chiavi API** → **Generate API Key**.
Copy the key — it looks like `ftrace_<id>_<secret>`. The secret is shown only once, so store it safely.

### 3. Configure Environment

```bash
cp .env.example .env
```

Open `.env` and fill in:

| Variable                  | Where to Find It                                                              |
| ------------------------- | ---------------------------------------------------------------------------- |
| `FENIXTRACE_API_KEY`      | FenixTrace Dashboard → **Chiavi API** (format `ftrace_<id>_<secret>`)        |
| `FENIXTRACE_API_BASE_URL` | `https://fenixtrace.com` (prod) or `http://localhost:3000` (dev)             |

That's the entire required configuration. The kit needs nothing else to run.

### 4. Start the Server

```bash
npm start
```

The server starts on port **3005** and begins auto-processing files in `uploads/`.

---

## Usage

### Method 1: Drop JSON Files

Place a `.json` file in the `uploads/` folder. The kit auto-detects it and processes it within 1 minute.

```bash
cp my-product.json uploads/
# Wait for auto-processing, or trigger manually:
curl -X POST http://localhost:3005/process-all
```

### Method 2: REST API

```bash
# Process all files in uploads/
curl -X POST http://localhost:3005/process-all

# Process a specific file
curl -X POST http://localhost:3005/process/my-product.json

# Check status
curl http://localhost:3005/status

# View processed products
curl http://localhost:3005/processed
```

### Method 3: CRM / External System Integration

Your CRM or ERP can write JSON files to the `uploads/` folder (via shared volume, SFTP, or API) and the kit processes them automatically.

---

## Product JSON Format

Each JSON file represents one product to register on FenixTrace.

```json
{
  "name": "Annurca Apple",
  "company": "Your Company Name",
  "template": "agro",
  "batchId": "BATCH-2026-001",
  "product": {
    "name": "Annurca Apple",
    "variety": "Annurca IGP",
    "category": "Fresh Fruit",
    "organicCertified": true,
    "certifications": ["GlobalGAP", "IGP Campania"],
    "weightKg": 12.5,
    "packagingType": "Cardboard box 30x40"
  },
  "origin": {
    "region": "Campania",
    "province": "Avellino",
    "municipality": "Montella",
    "farmName": "Azienda Agricola Rossi"
  },
  "cultivation": {
    "harvestDate": "2026-03-10",
    "harvestMethod": "Hand-picked",
    "pesticidesFree": true
  },
  "processing": {
    "facilityName": "OP Processing Center",
    "qualityGrade": "Extra",
    "storageTemperature": "2-4 C"
  },
  "logistics": {
    "transportCompany": "Logistics Express",
    "temperatureControlled": true,
    "departureDate": "2026-03-12"
  },
  "delivery": {
    "gdoPartner": "Conad",
    "distributionCenter": "Milan DC",
    "receivedDate": "2026-03-13",
    "qualityCheckPassed": true
  },
  "qualityControl": {
    "brixLevel": "14.2",
    "residueTestPassed": true,
    "testLabName": "Lab Analysis SRL"
  }
}
```

> **Only `name` is required.** All other fields are optional and stored as metadata; FenixTrace pins them to IPFS server-side.

### Supported Templates

`generic` · `agro` · `pharma` · `fashion` · `logistics` · `electronics` · `art` · `automotive` · `cosmetics` · `chemicals` · `machinery` · `custom`

---

## API Reference

| Method | Endpoint             | Description                                        |
| ------ | -------------------- | -------------------------------------------------- |
| `GET`  | `/`                  | Server info and available endpoints                |
| `GET`  | `/status`            | Kit status and FenixTrace API configuration        |
| `GET`  | `/health`            | Full health check (API reachability, filesystem, memory) |
| `GET`  | `/ping`              | Simple liveness check (returns `pong`)             |
| `POST` | `/process-all`       | Process all JSON files in `uploads/`               |
| `POST` | `/process/:filename` | Process a single file by name                      |
| `GET`  | `/processed`         | List all processed products with metadata          |
| `GET`  | `/logs`              | View available log files                           |
| `GET`  | `/logs/:filename`    | View a specific log file                           |
| `POST` | `/logs/cleanup`      | Clean up old log files                             |

---

## Docker

### Production

```bash
# 1. Configure
cp .env.example .env
# Edit .env with your FENIXTRACE_API_KEY and FENIXTRACE_API_BASE_URL

# 2. Build and start
docker compose up -d

# 3. Check health
docker compose ps
curl http://localhost:3005/health

# 4. View logs
docker compose logs -f

# 5. Process products
cp my-product.json uploads/
curl -X POST http://localhost:3005/process-all
```

### Development (hot-reload)

```bash
docker compose -f docker-compose.dev.yml up
```

### Useful Commands

```bash
# Stop
docker compose down

# Rebuild after code changes
docker compose up -d --build

# View real-time logs
docker compose logs -f --tail=50

# Shell into container
docker exec -it fenixtrace-integration-kit sh

# Check health inside container
docker exec fenixtrace-integration-kit wget -qO- http://localhost:3005/health
```

---

## PM2 (Process Manager)

For production without Docker:

```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start ecosystem.config.js

# Monitor
pm2 monit

# View logs
pm2 logs fenixtrace-integration

# Restart
pm2 restart fenixtrace-integration

# Auto-start on system boot
pm2 startup
pm2 save
```

---

## Troubleshooting

### "API key not configured"

Set `FENIXTRACE_API_KEY` in `.env`. Generate one from the FenixTrace Dashboard → **Chiavi API**.
The key must be in the format `ftrace_<id>_<secret>`.

### "Unauthorized" / 401 from FenixTrace

- Verify `FENIXTRACE_API_KEY` is correct and not revoked in the dashboard.
- Verify `FENIXTRACE_API_BASE_URL` points to the right environment (`https://fenixtrace.com` for prod, `http://localhost:3000` for local dev).
- Confirm your FenixTrace subscription is active.

### "Cannot reach FenixTrace" / connection errors

```bash
curl http://localhost:3005/health
```

Check that `FENIXTRACE_API_BASE_URL` is reachable from the kit and that the FenixTrace app is running.

### Docker: "Container unhealthy"

```bash
docker compose logs -f
docker exec fenixtrace-integration-kit wget -qO- http://localhost:3005/health
```

---

## File Structure

```
.
├── server.js              # Main server (Express + FenixTrace API client)
├── logger.js              # Structured logging
├── ecosystem.config.js    # PM2 configuration
├── package.json
├── .env.example           # Environment template
├── .env                   # Your configuration (git-ignored)
├── Dockerfile
├── docker-compose.yml     # Production Docker
├── docker-compose.dev.yml # Development Docker
├── uploads/               # Drop JSON files here for processing
├── processed/             # Processed files with metadata
└── logs/                  # Application logs
```

---

## CRM & eCommerce Plugins

Ready-to-use plugins that connect your platform directly to the Integration Kit:

| Plugin | Platform | Repository |
|---|---|---|
| **FenixTrace for Odoo** | Odoo 16/17 | [GitHub](https://github.com/SantoBaldassarre/FenixTrace-IOTA-Plugin-Odoo) |
| **FenixTrace for WooCommerce** | WordPress + WooCommerce | [GitHub](https://github.com/SantoBaldassarre/FenixTrace-IOTA-Plugin-WooCommerce) |
| **FenixTrace for PrestaShop** | PrestaShop 1.7 / 8.x | [GitHub](https://github.com/SantoBaldassarre/FenixTrace-IOTA-Plugin-PrestaShop) |

Each plugin handles:
- Product JSON payload generation
- HTTP POST to the Integration Kit API
- State tracking (draft → queued → synced / error)
- Single product sync, batch sync, and auto-sync

---

## Security Notes

- **Never commit** `.env` to version control — it contains your `FENIXTRACE_API_KEY`.
- **Treat the API key like a password.** Revoke and regenerate it from the dashboard if it leaks.
- **No wallet, no private key, no gas, and no Pinata/IPFS keys** are stored by the kit — FenixTrace handles signing, IPFS pinning, and notarization server-side.
- **Use HTTPS in production** (`https://fenixtrace.com`) so the API key travels encrypted.

---

## Links

- [FenixTrace Platform](https://fenixtrace.com)
- [FenixTrace Scanner](https://fenixtrace.com/scanner)
- [FenixTrace API Docs](https://fenixtrace.com/docs/api)
- [FenixTrace Integration Docs](https://fenixtrace.com/docs/integration-gateway)
- [Plugin Odoo](https://github.com/SantoBaldassarre/FenixTrace-IOTA-Plugin-Odoo)
- [Plugin WooCommerce](https://github.com/SantoBaldassarre/FenixTrace-IOTA-Plugin-WooCommerce)
- [Plugin PrestaShop](https://github.com/SantoBaldassarre/FenixTrace-IOTA-Plugin-PrestaShop)
- [Fenix Software Labs](https://www.fenixsoftwarelabs.com)

---

## License

MIT — [Fenix Software Labs](https://www.fenixsoftwarelabs.com)
