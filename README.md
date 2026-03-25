# FenixTrace Integration Kit

Standalone Node.js server that lets you register products on the **IOTA L1** blockchain and pin metadata to **IPFS** — fully automated.
Drop a JSON file into the `uploads/` folder (or call the REST API) and the kit handles everything: IPFS upload, on-chain `add_product` transaction, and notarization via the FenixTrace platform.

> **Built by [Fenix Software Labs](https://www.fenixsoftwarelabs.com)** — the team behind FenixTrace.

---

## How It Works

```
 Your System          Integration Kit              IOTA L1 + IPFS
 ──────────           ───────────────              ───────────────
  JSON file   ──►  1. Upload to IPFS (Pinata)  ──►  IPFS CID
                   2. add_product on-chain     ──►  Tx Hash
                   3. Notarize on-chain        ──►  Notarization Tx
                   4. Move file to processed/
```

Each product gets:

- An **IPFS CID** (immutable content hash)
- A **blockchain transaction** on IOTA L1
- A **notarization transaction** proving integrity
- A public page on the **FenixTrace Scanner**

---

## Prerequisites

| Requirement                       | Details                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------- |
| **Node.js**                 | v16+ (v18 LTS recommended)                                                    |
| **FenixTrace Subscription** | Active plan on[trace.fenixsoftwarelabs.com](https://trace.fenixsoftwarelabs.com) |
| **IOTA Wallet**             | Generated via `node generate-wallet.js`                                     |
| **Delegate Access**         | Your wallet must be added as a delegate from the FenixTrace Company Dashboard |
| **Pinata Account**          | Your own API keys from[app.pinata.cloud](https://app.pinata.cloud)               |
| **IOTA Tokens**             | Testnet faucet or mainnet IOTA for gas fees                                   |

---

## Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/SantoBaldassarre/FenixTrace-IOTA-auto-add-product-Integration-Kit.git
cd FenixTrace-IOTA-auto-add-product-Integration-Kit
npm install
```

### 2. Generate a Wallet

```bash
node generate-wallet.js
```

This creates `wallet-keys.json` with your address, mnemonic, and private key.
**Keep this file safe — never commit it to version control.**

### 3. Add Wallet as Delegate

Go to your **FenixTrace Company Dashboard** → **Delegate Management** tab → **Add Delegate**.
Enter the wallet address from `wallet-keys.json`.

### 4. Get Testnet Tokens (Testnet Only)

Request free test IOTA tokens from the faucet:

```bash
curl -X POST "https://faucet.testnet.iota.cafe/gas" \
  -H "Content-Type: application/json" \
  -d '{"FixedAmountRequest":{"recipient":"YOUR_WALLET_ADDRESS"}}'
```

Replace `YOUR_WALLET_ADDRESS` with the address from `wallet-keys.json`.

You should receive **10 IOTA** (10,000,000,000 base units). Each product costs ~0.2 IOTA (two transactions), so 10 IOTA covers ~50 products.

**Verify your balance:**

```bash
# After starting the server:
curl http://localhost:3005/balance
```

### 5. Configure Environment

```bash
cp .env.example .env
```

Open `.env` and fill in:

| Variable                             | Where to Find It                                                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `IOTA_PRIVATE_KEY`                 | `wallet-keys.json` → `privateKeyBech32` field                                                                     |
| `IOTA_PACKAGE_ID`                  | FenixTrace Dashboard or provided during onboarding                                                                     |
| `IOTA_MODULE_COMPANY_SUPPLY_CHAIN` | Same package ID +`::company_supply_chain`                                                                            |
| `IOTA_COMPANY_OBJECT_ID`           | FenixTrace Dashboard → Company Settings, or via API:`curl https://trace.fenixsoftwarelabs.com/api/public/companies` |
| `PINATA_API_KEY`                   | [app.pinata.cloud](https://app.pinata.cloud) → API Keys                                                                  |
| `PINATA_SECRET_API_KEY`            | Same page on Pinata                                                                                                    |
| `PINATA_JWT`                       | Same page on Pinata                                                                                                    |
| `FENIXTRACE_API_BASE_URL`          | `http://localhost:3000` (dev) or `https://trace.fenixsoftwarelabs.com` (prod)                                      |

### 6. Start the Server

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

# Check wallet balance (optionally estimate cost for N files)
curl "http://localhost:3005/balance?files=20"

# View processed products
curl http://localhost:3005/processed
```

### Method 3: CRM / External System Integration

Your CRM or ERP can write JSON files to the `uploads/` folder (via shared volume, SFTP, or API) and the kit processes them automatically.

---

## Product JSON Format

Each JSON file represents one product to register on-chain.

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

> **Only `name` is required.** All other fields are optional and stored as metadata on IPFS.

### Supported Templates

`generic` · `agro` · `pharma` · `fashion` · `logistics` · `electronics` · `art` · `automotive` · `cosmetics` · `chemicals` · `machinery` · `custom`

---

## API Reference

| Method   | Endpoint               | Description                                                   |
| -------- | ---------------------- | ------------------------------------------------------------- |
| `GET`  | `/`                  | Server info and available endpoints                           |
| `GET`  | `/status`            | Wallet address, balance, contract config                      |
| `GET`  | `/health`            | Full health check (blockchain, filesystem, memory)            |
| `GET`  | `/ping`              | Simple liveness check (returns `pong`)                      |
| `GET`  | `/balance`           | Wallet balance. Add `?files=N` to estimate cost for N files |
| `POST` | `/process-all`       | Process all JSON files in `uploads/`                        |
| `POST` | `/process/:filename` | Process a single file by name                                 |
| `GET`  | `/processed`         | List all processed products with metadata                     |
| `GET`  | `/logs`              | View available log files                                      |
| `GET`  | `/logs/:filename`    | View a specific log file                                      |
| `POST` | `/logs/cleanup`      | Clean up old log files                                        |

---

## Docker

### Production

```bash
# 1. Configure
cp .env.example .env
# Edit .env with your values

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

# Check balance inside container
docker exec fenixtrace-integration-kit wget -qO- http://localhost:3005/balance
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

## Testnet Faucet Guide

The IOTA testnet faucet provides free tokens for testing.

### Request Tokens

```bash
curl -X POST "https://faucet.testnet.iota.cafe/gas" \
  -H "Content-Type: application/json" \
  -d '{
    "FixedAmountRequest": {
      "recipient": "0xYOUR_WALLET_ADDRESS"
    }
  }'
```

### Expected Response

```json
{
  "transferredGasObjects": [
    {
      "amount": 10000000000,
      "id": "0x...",
      "transferTxDigest": "..."
    }
  ],
  "error": null
}
```

### Cost Estimation

| Operation                   | Cost (base units)      | Cost (IOTA)    |
| --------------------------- | ---------------------- | -------------- |
| `add_product` transaction | ~100,000,000           | ~0.1           |
| Notarization transaction    | ~100,000,000           | ~0.1           |
| **Total per product** | **~200,000,000** | **~0.2** |
| 10 products                 | ~2,000,000,000         | ~2.0           |
| 50 products                 | ~10,000,000,000        | ~10.0          |

One faucet request (10 IOTA) covers ~50 products.

### Check Balance

```bash
curl http://localhost:3005/balance?files=20
```

Response:

```json
{
  "wallet": {
    "address": "0x...",
    "balance": "10000000000"
  },
  "estimation": {
    "filesCount": 20,
    "totalEstimatedCost": "4000000000",
    "sufficient": true
  }
}
```

---

## Troubleshooting

### "Insufficient balance"

Request tokens from the faucet (see above). Each product needs ~0.2 IOTA.

### "Company object ID not configured"

Set `IOTA_COMPANY_OBJECT_ID` in `.env`. Find it via:

```bash
curl https://trace.fenixsoftwarelabs.com/api/public/companies
```

Look for your company's `contractAddress` field.

### "IOTA private key not configured"

Generate a wallet: `node generate-wallet.js`
Copy `privateKeyBech32` from `wallet-keys.json` to `IOTA_PRIVATE_KEY` in `.env`.

### "Pinata upload failed"

Verify your Pinata credentials at [app.pinata.cloud](https://app.pinata.cloud).
Test with:

```bash
curl -X POST "https://api.pinata.cloud/pinning/pinJSONToIPFS" \
  -H "Authorization: Bearer YOUR_PINATA_JWT" \
  -H "Content-Type: application/json" \
  -d '{"pinataContent": {"test": true}}'
```

### "Transaction failed" / "Wallet not authorized"

Your wallet must be a **delegate** of the company on FenixTrace.
Go to Company Dashboard → Delegate Management → Add your wallet address.

### Docker: "Container unhealthy"

```bash
docker compose logs -f
docker exec fenixtrace-integration-kit wget -qO- http://localhost:3005/health
```

---

## File Structure

```
.
├── server.js              # Main server (Express + IOTA SDK)
├── logger.js              # Structured logging
├── generate-wallet.js     # IOTA wallet generator
├── ecosystem.config.js    # PM2 configuration
├── package.json
├── .env.example           # Environment template
├── .env                   # Your configuration (git-ignored)
├── wallet-keys.json       # Generated wallet (git-ignored)
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

- **Never commit** `.env` or `wallet-keys.json` to version control
- **Use your own** Pinata IPFS keys — FenixTrace does not provide IPFS storage
- **Delegate wallets** can only add products, not manage the company
- **Testnet tokens** have no real value — use them freely for testing
- **Mainnet**: ensure your wallet has sufficient IOTA balance before processing

---

## Links

- [FenixTrace Platform](https://trace.fenixsoftwarelabs.com)
- [FenixTrace Scanner](https://trace.fenixsoftwarelabs.com/scanner)
- [FenixTrace API Docs](https://trace.fenixsoftwarelabs.com/docs/api)
- [FenixTrace Integration Docs](https://trace.fenixsoftwarelabs.com/docs/integration-gateway)
- [Plugin Odoo](https://github.com/SantoBaldassarre/FenixTrace-IOTA-Plugin-Odoo)
- [Plugin WooCommerce](https://github.com/SantoBaldassarre/FenixTrace-IOTA-Plugin-WooCommerce)
- [Plugin PrestaShop](https://github.com/SantoBaldassarre/FenixTrace-IOTA-Plugin-PrestaShop)
- [Fenix Software Labs](https://www.fenixsoftwarelabs.com)
- [IOTA Testnet Faucet](https://faucet.testnet.iota.cafe)
- [Pinata IPFS](https://app.pinata.cloud)
- [IOTA Explorer (Testnet)](https://explorer.iota.cafe)

---

## License

MIT — [Fenix Software Labs](https://www.fenixsoftwarelabs.com)
