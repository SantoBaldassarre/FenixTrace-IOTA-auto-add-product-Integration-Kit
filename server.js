const express = require('express');
const fs = require('fs');
const path = require('path');
const { IotaClient } = require('@iota/iota-sdk/client');
const { Transaction } = require('@iota/iota-sdk/transactions');
const { Ed25519Keypair } = require('@iota/iota-sdk/keypairs/ed25519');
const { decodeIotaPrivateKey } = require('@iota/iota-sdk/cryptography');
const axios = require('axios');
const FormData = require('form-data');
const logger = require('./logger');
require('dotenv').config();

const app = express();
// Cap JSON bodies at 256 KB: the kit only receives small admin payloads
// (e.g. cleanup options), never arbitrary blobs.
app.use(express.json({ limit: '256kb' }));

// --- Security helpers ---------------------------------------------------
const SAFE_NAME = /^[A-Za-z0-9._-]+$/;
const sanitizeFilename = (value) => {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return null;
    if (raw.length > 128) return null;
    // Reject any separator or parent reference up front.
    if (!SAFE_NAME.test(raw)) return null;
    if (raw === '.' || raw === '..') return null;
    return raw;
};
const clampInt = (value, { min, max, fallback }) => {
    const parsed = typeof value === 'number' ? value : parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, Math.trunc(parsed)));
};

// Middleware for API request logging
app.use((req, res, next) => {
    const startTime = Date.now();
    
    res.on('finish', () => {
        const responseTime = Date.now() - startTime;
        logger.api(req.method, req.originalUrl, res.statusCode, responseTime, {
            userAgent: req.get('User-Agent'),
            ip: req.ip,
            body: req.method === 'POST' ? req.body : undefined
        });
    });
    
    next();
});

// Blockchain configuration
const IOTA_NODE_URL = process.env.IOTA_NODE_URL || process.env.NEXT_PUBLIC_IOTA_NODE_URL || '';
const IOTA_PACKAGE_ID = process.env.IOTA_PACKAGE_ID || process.env.NEXT_PUBLIC_IOTA_PACKAGE_ID || '';
const COMPANY_SUPPLY_CHAIN_MODULE = process.env.IOTA_MODULE_COMPANY_SUPPLY_CHAIN || process.env.IOTA_COMPANY_SUPPLY_CHAIN_MODULE || process.env.NEXT_PUBLIC_IOTA_MODULE_COMPANY_SUPPLY_CHAIN || '';
const COMPANY_SUPPLY_CHAIN_OBJECT_ID = process.env.IOTA_COMPANY_OBJECT_ID || process.env.NEXT_PUBLIC_IOTA_COMPANY_OBJECT_ID || '';
const CLOCK_OBJECT_ID = process.env.IOTA_CLOCK_OBJECT || process.env.NEXT_PUBLIC_IOTA_CLOCK_OBJECT || '0x6';
const IOTA_COIN_TYPE = process.env.IOTA_COIN_TYPE || process.env.NEXT_PUBLIC_IOTA_COIN_TYPE || '0x2::iota::IOTA';
const IOTA_GAS_BUDGET = process.env.IOTA_GAS_BUDGET ? Number(process.env.IOTA_GAS_BUDGET) : null;
const IOTA_NOTARIZATION_GAS_BUDGET = process.env.IOTA_NOTARIZATION_GAS_BUDGET ? Number(process.env.IOTA_NOTARIZATION_GAS_BUDGET) : IOTA_GAS_BUDGET;
const FENIXTRACE_API_BASE_URL = (process.env.FENIXTRACE_API_BASE_URL || process.env.FRONTEND_API_BASE_URL || '').trim().replace(/\/$/, '');
const FENIXTRACE_NOTARIZATION_ENDPOINT = process.env.FENIXTRACE_NOTARIZATION_ENDPOINT || '/api/notarization';
const iotaClient = new IotaClient({ url: IOTA_NODE_URL });

const parseSecretKey = (value) => {
    const trimmed = (value || '').trim();
    if (!trimmed) {
        throw new Error('IOTA private key not configured');
    }
    if (trimmed.startsWith('iotaprivkey')) {
        const decoded = decodeIotaPrivateKey(trimmed);
        return Uint8Array.from(decoded.secretKey);
    }
    const hex = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
    const bytes = Buffer.from(hex, 'hex');
    if (!bytes.length) {
        throw new Error('Invalid IOTA private key');
    }
    return Uint8Array.from(bytes);
};

const getKeypair = () => {
    const key = process.env.IOTA_PRIVATE_KEY || process.env.PRIVATE_KEY || '';
    return Ed25519Keypair.fromSecretKey(parseSecretKey(key));
};

const keypair = getKeypair();

const getWalletAddress = () => {
    const pub = keypair.getPublicKey();
    return pub.toIotaAddress?.() || pub.toSuiAddress?.() || pub.toAddress?.() || '';
};

// Pinata configuration
const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_SECRET_API_KEY = process.env.PINATA_SECRET_API_KEY;
const PINATA_JWT = process.env.PINATA_JWT;
const PINATA_API_URL = process.env.PINATA_API_URL;
const PINATA_GATEWAY_URL = process.env.PINATA_GATEWAY_URL;

// Flag to prevent duplicate processes
let isProcessing = false;
let isAutoProcessingActive = false;

/**
 * Controlla se il saldo del wallet è sufficiente per le operazioni
 * @param {number} requiredBaseUnits - Budget richiesto in base units
 * @returns {Promise<{sufficient: boolean, balance: string, required: string, balanceBaseUnits: bigint}>}
 */
async function checkWalletBalance(requiredBaseUnits = 0) {
    try {
        const { balance } = await fetchWalletBalance();
        const estimatedCost = BigInt(requiredBaseUnits || 0);
        
        const sufficient = BigInt(balance) >= estimatedCost;
        
        logger.info('Checking wallet balance', {
            walletAddress: getWalletAddress(),
            balanceBaseUnits: balance.toString(),
            estimatedCostBaseUnits: estimatedCost.toString(),
            sufficient
        });
        
        return {
            sufficient,
            balance: balance.toString(),
            required: estimatedCost.toString(),
            balanceBaseUnits: BigInt(balance)
        };
    } catch (error) {
        logger.error('Error checking balance', error);
        throw error;
    }
}

async function fetchWalletBalance() {
    const owner = getWalletAddress();
    if (!owner) {
        throw new Error('Wallet address not resolved');
    }
    let balanceResult;
    try {
        balanceResult = await iotaClient.getBalance({ owner, coinType: IOTA_COIN_TYPE });
    } catch (error) {
        balanceResult = await iotaClient.getBalance(owner);
    }
    if (typeof balanceResult === 'string' || typeof balanceResult === 'number' || typeof balanceResult === 'bigint') {
        return { balance: balanceResult, raw: balanceResult };
    }
    const total = balanceResult?.totalBalance ?? balanceResult?.balance ?? balanceResult?.amount ?? '0';
    return { balance: total, raw: balanceResult };
}

const normalizeTxHash = (value) => {
    const raw = (value || '').trim();
    if (!raw) return '';
    if (/^0x[0-9a-fA-F]+$/.test(raw)) return raw.toLowerCase();
    return raw;
};

const getNotarizationApiUrl = () => {
    if (!FENIXTRACE_API_BASE_URL) {
        throw new Error('FENIXTRACE_API_BASE_URL not configured');
    }
    const endpoint = FENIXTRACE_NOTARIZATION_ENDPOINT.startsWith('/') ? FENIXTRACE_NOTARIZATION_ENDPOINT : `/${FENIXTRACE_NOTARIZATION_ENDPOINT}`;
    return `${FENIXTRACE_API_BASE_URL}${endpoint}`;
};

async function createNotarizationTransaction(payload) {
    const tx = new Transaction();
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(1)]);
    tx.transferObjects([coin], tx.pure.address(getWalletAddress()));
    if (IOTA_NOTARIZATION_GAS_BUDGET && Number.isFinite(IOTA_NOTARIZATION_GAS_BUDGET)) {
        tx.setGasBudget(IOTA_NOTARIZATION_GAS_BUDGET);
    }
    const result = await iotaClient.signAndExecuteTransaction({
        transaction: tx,
        signer: keypair
    });
    const notarizationTxHash = result?.digest || result?.transactionDigest || result?.effects?.transactionDigest;
    if (!notarizationTxHash) {
        throw new Error('Unable to resolve notarization transaction hash');
    }
    logger.transaction(notarizationTxHash, 'notarization transaction sent', payload);
    return notarizationTxHash;
}

async function enqueueNotarization(payload) {
    const notarizationUrl = getNotarizationApiUrl();
    const response = await axios.post(notarizationUrl, {
        operations: [payload]
    }, {
        headers: {
            'Content-Type': 'application/json'
        },
        timeout: 20000
    });
    const queued = Number(response?.data?.queued || 0);
    if (queued < 1) {
        throw new Error('Notarization API did not queue any operation');
    }
}

async function notarizeProductDeposit({ sourceTransactionHash, productName, ipfsHash }) {
    const normalizedSourceTxHash = normalizeTxHash(sourceTransactionHash);
    if (!normalizedSourceTxHash) {
        throw new Error('Invalid source transaction hash for notarization');
    }
    const notarizationTxHash = await createNotarizationTransaction({
        action: 'label_creation',
        entityType: 'label',
        sourceTransactionHash: normalizedSourceTxHash,
        productName
    });
    try {
        await enqueueNotarization({
            entityType: 'label',
            operationType: 'label_creation',
            sourceTransactionHash: normalizedSourceTxHash,
            entityReference: normalizedSourceTxHash,
            notarizationTransactionHash: notarizationTxHash,
            actorAddress: getWalletAddress(),
            metadata: {
                companyContract: COMPANY_SUPPLY_CHAIN_OBJECT_ID,
                productName,
                ipfsHash,
                source: 'integration-kit'
            }
        });
    } catch (enqueueError) {
        logger.warn(`Notarization enqueue to FenixTrace API failed (non-blocking)`, enqueueError, {
            notarizationTxHash,
            productName,
            apiUrl: getNotarizationApiUrl()
        });
        console.warn(`⚠️  FenixTrace API enqueue failed (notarization tx already on-chain: ${notarizationTxHash})`);
    }
    return notarizationTxHash;
}

/**
 * Uploads a file to IPFS via Pinata
 * @param {string} filePath - Path of the file to upload
 * @param {string} fileName - File name
 * @returns {Promise<string>} - IPFS hash of the uploaded file
 */
async function uploadToPinata(filePath, fileName) {
    const startTime = Date.now();
    try {
        logger.info(`Starting Pinata IPFS upload for ${fileName}`, { filePath, fileName });
        
        const formData = new FormData();
        const fileStream = fs.createReadStream(filePath);
        
        formData.append('file', fileStream);
        
        const metadata = JSON.stringify({
            name: fileName,
            keyvalues: {
                uploadedAt: new Date().toISOString(),
                type: 'product-data'
            }
        });
        formData.append('pinataMetadata', metadata);
        
        const options = JSON.stringify({
            cidVersion: 0,
        });
        formData.append('pinataOptions', options);
        
        logger.debug('Sending request to Pinata API', {
            url: `${PINATA_API_URL}/pinning/pinFileToIPFS`,
            metadata: JSON.parse(metadata)
        });
        
        const response = await axios.post(
            `${PINATA_API_URL}/pinning/pinFileToIPFS`,
            formData,
            {
                maxBodyLength: 'Infinity',
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${formData._boundary}`,
                    'Authorization': `Bearer ${PINATA_JWT}`
                }
            }
        );
        
        const uploadTime = Date.now() - startTime;
        logger.ipfs(response.data.IpfsHash, fileName, 'upload', {
            provider: 'pinata',
            uploadTime: `${uploadTime}ms`,
            fileSize: fs.statSync(filePath).size,
            pinataResponse: response.data
        });
        
        console.log(`✅ File ${fileName} uploaded to IPFS via Pinata with hash: ${response.data.IpfsHash}`);
        return response.data.IpfsHash;
    } catch (error) {
        const uploadTime = Date.now() - startTime;
        logger.error(`Error uploading to Pinata IPFS for ${fileName}`, error, {
            filePath,
            fileName,
            uploadTime: `${uploadTime}ms`,
            errorDetails: {
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data
            }
        });
        console.error(`❌ Error uploading to Pinata IPFS for ${fileName}:`, error.response?.data || error.message);
        throw error;
    }
}

/**
 * Get the appropriate IPFS gateway URL based on the provider
 * @param {string} ipfsHash - IPFS hash
 * @returns {string} - Complete IPFS URL
 */
function getIPFSUrl(ipfsHash) {
    return `${PINATA_GATEWAY_URL}/ipfs/${ipfsHash}`;
}

/**
 * Uploads a file to IPFS using the configured provider
 * @param {string} filePath - Path of the file to upload
 * @param {string} fileName - File name
 * @returns {Promise<string>} - IPFS hash of the uploaded file
 */
async function uploadToIPFS(filePath, fileName) {
    logger.info(`Using IPFS provider: pinata`);
    return await uploadToPinata(filePath, fileName);
}

/**
 * Adds a product to the CompanySupplyChain contract
 * @param {string} productName - Product name
 * @param {string} ipfsHash - IPFS hash of the product file
 * @returns {Promise<string>} - Transaction hash
 */
async function addProductToBlockchain(productName, ipfsHash) {
    const startTime = Date.now();
    try {
        logger.info(`Starting product addition to blockchain`, {
            productName,
            ipfsHash
        });
        
        console.log(`🔗 Adding product ${productName} to blockchain...`);
        
        if (!IOTA_NODE_URL) {
            throw new Error('IOTA node URL not configured');
        }
        if (!COMPANY_SUPPLY_CHAIN_OBJECT_ID) {
            throw new Error('Company object ID not configured');
        }
        const moduleTarget = COMPANY_SUPPLY_CHAIN_MODULE || (IOTA_PACKAGE_ID ? `${IOTA_PACKAGE_ID}::company_supply_chain` : '');
        if (!moduleTarget) {
            throw new Error('Company supply chain module not configured');
        }

        const tx = new Transaction();
        tx.moveCall({
            target: `${moduleTarget}::add_product`,
            arguments: [
                tx.object(COMPANY_SUPPLY_CHAIN_OBJECT_ID),
                tx.pure.string(productName),
                tx.pure.string(ipfsHash),
                tx.object(CLOCK_OBJECT_ID)
            ]
        });
        if (IOTA_GAS_BUDGET && Number.isFinite(IOTA_GAS_BUDGET)) {
            tx.setGasBudget(IOTA_GAS_BUDGET);
        }

        const result = await iotaClient.signAndExecuteTransaction({
            transaction: tx,
            signer: keypair
        });

        const txHash = result?.digest || result?.transactionDigest || result?.effects?.transactionDigest;

        logger.transaction(txHash, 'addProduct sent', {
            productName,
            ipfsHash
        });

        console.log(`📝 Transaction sent: ${txHash}`);

        const executionTime = Date.now() - startTime;
        
        logger.transaction(txHash, 'addProduct transaction sent', {
            productName,
            ipfsHash,
            executionTime: `${executionTime}ms`,
            note: 'Transaction sent, confirmation pending'
        });
        
        console.log(`✅ Transaction for ${productName} sent to blockchain! Hash: ${txHash}`);
        console.log(`⏳ Confirmation will happen in background, continuing with next file...`);
        
        return txHash;
    } catch (error) {
        const executionTime = Date.now() - startTime;
        logger.error(`Error adding product to blockchain`, error, {
            productName,
            ipfsHash,
            executionTime: `${executionTime}ms`,
            errorDetails: {
                code: error.code,
                reason: error.reason,
                transaction: error.transaction
            }
        });
        console.error(`❌ Error adding product ${productName} to blockchain:`, error.message);
        throw error;
    }
}

/**
 * Processes a single JSON file from the uploads folder
 * @param {string} fileName - Name of the file to process
 */
async function processProductFile(fileName) {
    const filePath = path.join(__dirname, 'uploads', fileName);
    const startTime = Date.now();
    
    try {
        // Read file content to get product name
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const productData = JSON.parse(fileContent);
        const productName = productData.name || fileName.replace('.json', '');
        
        logger.info(`Starting product processing`, {
            fileName,
            productName,
            filePath
        });
        
        console.log(`\n🚀 Processing product: ${productName}`);
        console.log(`📁 File: ${fileName}`);
        
        // 1. Upload file to IPFS
        const ipfsHash = await uploadToIPFS(filePath, fileName);
        
        // 2. Add product to blockchain
        const txHash = await addProductToBlockchain(productName, ipfsHash);
        
        const notarizationTxHash = await notarizeProductDeposit({
            sourceTransactionHash: txHash,
            productName,
            ipfsHash
        });

        const processingTime = Date.now() - startTime;
        const result = {
            productName,
            fileName,
            ipfsHash,
            txHash,
            notarizationTxHash,
            ipfsUrl: getIPFSUrl(ipfsHash),
            success: true
        };
        
        // Move file to processed folder with upload metadata
        const processedDir = path.join(__dirname, 'processed');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const processedFileNameWithTimestamp = `${timestamp}_${fileName}`;
        const processedFilePathWithTimestamp = path.join(processedDir, processedFileNameWithTimestamp);
        
        try {
            // Aggiungi i metadati del caricamento all'inizio del JSON
            const uploadMetadata = {
                uploadDetails: {
                    productName: productName,
                    ipfsCid: ipfsHash,
                    transactionHash: txHash,
                    notarizationTransactionHash: notarizationTxHash,
                    ipfsUrl: getIPFSUrl(ipfsHash),
                    uploadedAt: new Date().toISOString(),
                    processingTime: `${Date.now() - startTime}ms`
                },
                originalData: productData
            };
            
            // Write file with metadata to processed folder
            fs.writeFileSync(processedFilePathWithTimestamp, JSON.stringify(uploadMetadata, null, 2));
            
            // Remove original file from uploads folder
            fs.unlinkSync(filePath);
            
            logger.info(`File processed and moved to processed folder with metadata`, {
                originalPath: filePath,
                newPath: processedFilePathWithTimestamp,
                productName,
                ipfsHash,
                txHash,
                notarizationTxHash
            });
            console.log(`📁 File processed and moved to: processed/${processedFileNameWithTimestamp}`);
        } catch (moveError) {
            logger.warn(`Error moving file`, moveError, {
                originalPath: filePath,
                targetPath: processedFilePathWithTimestamp,
                productName
            });
            console.warn(`⚠️  Unable to move file: ${moveError.message}`);
        }
        
        logger.success(`Product processed successfully`, {
            ...result,
            processingTime: `${processingTime}ms`,
            movedToProcessed: processedFileNameWithTimestamp
        });
        
        console.log(`\n✅ Product ${productName} processed successfully!`);
        console.log(`🔗 IPFS Hash: ${ipfsHash}`);
        console.log(`📝 Transaction Hash: ${txHash}`);
        console.log(`🖋️ Notarization Transaction Hash: ${notarizationTxHash}`);
        console.log(`🌐 IPFS URL: ${getIPFSUrl(ipfsHash)}`);
        
        return result;
        
    } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`Error processing product`, error, {
            fileName,
            processingTime: `${processingTime}ms`,
            errorStep: error.step || 'unknown'
        });
        
        console.error(`❌ Error processing ${fileName}:`, error.message);
        return {
            fileName,
            error: error.message,
            success: false
        };
    }
}

/**
 * Processes all JSON files in the uploads folder
 */
async function processAllProducts() {
    // Check if processing is already in progress
    if (isProcessing) {
        const message = 'Processing already in progress, operation ignored';
        console.log(`⚠️  ${message}`);
        logger.warn(message);
        return [];
    }
    
    // Set processing flag
    isProcessing = true;
    
    try {
        const uploadsDir = path.join(__dirname, 'uploads');
        const processedDir = path.join(__dirname, 'processed');

    // Create processed folder if it doesn't exist
    if (!fs.existsSync(processedDir)) {
        fs.mkdirSync(processedDir, { recursive: true });
        logger.info('Processed folder created', { path: processedDir });
    }
    const files = fs.readdirSync(uploadsDir);
    const jsonFiles = files.filter(file => file.endsWith('.json') && file !== '.gitkeep');
    const startTime = Date.now();
    
    logger.info(`Starting batch processing of all products`, {
        totalFiles: jsonFiles.length,
        files: jsonFiles
    });
    
    console.log(`📦 Found ${jsonFiles.length} files to process:`);
    jsonFiles.forEach(file => console.log(`   - ${file}`));
    
    // Check balance before starting processing
    if (jsonFiles.length > 0) {
        console.log(`\n💰 Checking wallet balance...`);
        const estimatedBudgetPerFile = (IOTA_GAS_BUDGET || 0) + (IOTA_NOTARIZATION_GAS_BUDGET || 0);
        const totalEstimatedBudget = estimatedBudgetPerFile * jsonFiles.length;
        
        const balanceCheck = await checkWalletBalance(totalEstimatedBudget);
        
        if (!balanceCheck.sufficient) {
            const errorMsg = `Insufficient balance to process ${jsonFiles.length} files. Required: ${balanceCheck.required} base units, Available: ${balanceCheck.balance} base units`;
            console.error(`❌ ${errorMsg}`);
            logger.error('Insufficient balance for batch processing', {
                filesCount: jsonFiles.length,
                required: balanceCheck.required,
                available: balanceCheck.balance
            });
            throw new Error(errorMsg);
        }
        
        console.log(`✅ Sufficient balance: ${balanceCheck.balance} base units (estimated required: ${balanceCheck.required} base units)`);
    }
    
    const results = [];
    
    for (const file of jsonFiles) {
        const result = await processProductFile(file);
        results.push(result);
        
        // 2-second pause between transactions to avoid nonce issues
        if (jsonFiles.indexOf(file) < jsonFiles.length - 1) {
            console.log('⏳ 2-second pause before next product...');
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const processingTime = Date.now() - startTime;
    
    logger.summary('Batch processing completed', results.map(r => ({
        fileName: r.fileName,
        success: r.success,
        error: r.error || null,
        ipfsHash: r.ipfsHash || null,
        txHash: r.txHash || null
    })));
    
    logger.info(`Final batch processing statistics`, {
        total: jsonFiles.length,
        successful,
        failed,
        processingTime: `${processingTime}ms`,
        averageTimePerProduct: `${Math.round(processingTime / jsonFiles.length)}ms`
    });
    
        return results;
    } finally {
        // Reset processing flag
        isProcessing = false;
    }
}

// API Routes
app.get('/', (req, res) => {
    res.json({
        message: 'FenixTrace Integration Kit Server',
        status: 'running',
        endpoints: {
            '/process-all': 'POST - Process all files in uploads folder',
            '/process/:filename': 'POST - Process a specific file',
            '/status': 'GET - Server status',
            '/balance': 'GET - Check wallet balance (optional: ?files=N to estimate cost for N files)'
        }
    });
});

app.get('/status', async (req, res) => {
    try {
        const balance = await fetchWalletBalance();
        
        res.json({
            status: 'healthy',
            wallet: {
                address: getWalletAddress(),
                balanceBaseUnits: balance.balance.toString()
            },
            contracts: {
                companySupplyChain: COMPANY_SUPPLY_CHAIN_OBJECT_ID,
                module: COMPANY_SUPPLY_CHAIN_MODULE,
                packageId: IOTA_PACKAGE_ID
            },
            notarization: {
                apiBaseUrl: FENIXTRACE_API_BASE_URL,
                endpoint: FENIXTRACE_NOTARIZATION_ENDPOINT
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// Enhanced health check endpoint for Docker and PM2
app.get('/health', async (req, res) => {
    try {
        const startTime = Date.now();
        
        // Basic health indicators
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
                external: Math.round(process.memoryUsage().external / 1024 / 1024)
            },
            cpu: {
                usage: process.cpuUsage()
            },
            environment: {
                nodeEnv: process.env.NODE_ENV || 'development',
                nodeVersion: process.version,
                platform: process.platform
            }
        };
        
        // Check blockchain connectivity
        try {
            const balance = await fetchWalletBalance();
            
            health.blockchain = {
                connected: true,
                node: IOTA_NODE_URL,
                walletBalanceBaseUnits: balance.balance.toString()
            };
        } catch (blockchainError) {
            health.blockchain = {
                connected: false,
                error: blockchainError.message
            };
            health.status = 'degraded';
        }

        health.notarization = {
            apiBaseUrlConfigured: Boolean(FENIXTRACE_API_BASE_URL),
            endpoint: FENIXTRACE_NOTARIZATION_ENDPOINT
        };
        
        // Check file system access
        try {
            const uploadsDir = path.join(__dirname, 'uploads');
            const processedDir = path.join(__dirname, 'processed');
            const logsDir = path.join(__dirname, 'logs');
            
            health.filesystem = {
                uploadsAccessible: fs.existsSync(uploadsDir),
                processedAccessible: fs.existsSync(processedDir),
                logsAccessible: fs.existsSync(logsDir)
            };
        } catch (fsError) {
            health.filesystem = {
                error: fsError.message
            };
            health.status = 'degraded';
        }
        
        // Check processing status
        health.processing = {
            isProcessing: isProcessing,
            isAutoProcessingActive: isAutoProcessingActive,
            autoProcessEnabled: process.env.AUTO_PROCESS === 'true'
        };
        
        // Response time
        health.responseTime = Date.now() - startTime;
        
        // Determine HTTP status code
        const statusCode = health.status === 'healthy' ? 200 : 503;
        
        res.status(statusCode).json(health);
        
    } catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
});

// Simple health check endpoint for basic monitoring
app.get('/ping', (req, res) => {
    res.status(200).send('pong');
});

app.get('/balance', async (req, res) => {
    try {
        const filesCount = clampInt(req.query.files, { min: 1, max: 10000, fallback: 1 });
        const estimatedBudgetPerFile = (IOTA_GAS_BUDGET || 0) + (IOTA_NOTARIZATION_GAS_BUDGET || 0);
        const totalEstimatedBudget = estimatedBudgetPerFile * filesCount;
        
        const balanceCheck = await checkWalletBalance(totalEstimatedBudget);
        
        res.json({
            wallet: {
                address: getWalletAddress(),
                balance: balanceCheck.balance,
                balanceBaseUnits: balanceCheck.balanceBaseUnits.toString()
            },
            estimation: {
                filesCount,
                estimatedCostPerFile: estimatedBudgetPerFile.toString(),
                totalEstimatedCost: balanceCheck.required,
                sufficient: balanceCheck.sufficient
            },
            status: balanceCheck.sufficient ? 'sufficient' : 'insufficient'
        });
    } catch (error) {
        res.status(500).json({
            error: 'Error checking balance',
            message: error.message
        });
    }
});

app.post('/process-all', async (req, res) => {
    try {
        logger.info('Request to process all products via API');
        console.log('\n🎯 Starting processing of all products...');
        const results = await processAllProducts();
        
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        
        const response = {
            message: 'Processing completed',
            summary: {
                total: results.length,
                successful,
                failed
            },
            results
        };
        
        logger.success('API processing completed successfully', {
            summary: response.summary,
            endpoint: '/process-all'
        });
        
        res.json(response);
    } catch (error) {
        logger.error('Error in API processing', error, {
            endpoint: '/process-all'
        });
        console.error('❌ Error in processing:', error.message);
        res.status(500).json({
            error: 'Error in processing',
            message: error.message
        });
    }
});

app.post('/process/:filename', async (req, res) => {
    try {
        const filename = sanitizeFilename(req.params.filename);

        if (!filename || !filename.endsWith('.json')) {
            logger.warn('Attempt to process invalid or non-JSON filename', {
                filename: req.params.filename,
            });
            return res.status(400).json({
                error: 'Invalid file',
                message: 'Filename must contain only [A-Za-z0-9._-] and end with .json',
            });
        }

        logger.info('Request to process single product via API', {
            filename,
            endpoint: '/process/:filename'
        });

        const uploadsDir = path.resolve(__dirname, 'uploads');
        const filePath = path.resolve(uploadsDir, filename);
        if (!filePath.startsWith(uploadsDir + path.sep)) {
            logger.warn('Attempt to process file outside uploads dir', { filename });
            return res.status(400).json({
                error: 'Invalid path',
                message: 'File must live inside the uploads directory',
            });
        }
        if (!fs.existsSync(filePath)) {
            logger.warn('Attempt to process non-existent file', { filename });
            return res.status(404).json({
                error: 'File not found',
                message: `File ${filename} does not exist in uploads folder`
            });
        }

        console.log(`\n🎯 Processing single product: ${filename}`);
        const result = await processProductFile(filename);
        
        if (result.success) {
            logger.success('Single product processing completed via API', {
                filename,
                result
            });
            res.json({
                message: 'Product processed successfully',
                result
            });
        } else {
            logger.error('Single product processing failed via API', null, {
                filename,
                result
            });
            res.status(500).json({
                error: 'Error processing product',
                result
            });
        }
    } catch (error) {
        logger.error('Error processing single product via API', error, {
            filename: req.params.filename,
            endpoint: '/process/:filename'
        });
        console.error('❌ Error processing single product:', error.message);
        res.status(500).json({
            error: 'Error in processing',
            message: error.message
        });
    }
});

// Endpoint to view processed products
app.get('/processed', (req, res) => {
    try {
        const processedDir = path.join(__dirname, 'processed');
        const processedFiles = fs.readdirSync(processedDir)
            .filter(file => file.endsWith('.json'))
            .map(file => {
                const filePath = path.join(processedDir, file);
                const stats = fs.statSync(filePath);
                return {
                    fileName: file,
                    originalName: file.substring(20), // Remove timestamp
                    processedAt: stats.mtime,
                    size: stats.size
                };
            })
            .sort((a, b) => b.processedAt - a.processedAt);
        
        res.json({
            message: 'Processed products',
            count: processedFiles.length,
            files: processedFiles
        });
    } catch (error) {
        logger.error('Error retrieving processed products', error);
        res.status(500).json({
            error: 'Error retrieving processed products',
            message: error.message
        });
    }
});

// Endpoint to view logs
app.get('/logs', (req, res) => {
    try {
        const logFiles = logger.getLogFiles();
        res.json({
            message: 'Available log files',
            files: logFiles
        });
    } catch (error) {
        logger.error('Error retrieving log files', error);
        res.status(500).json({
            error: 'Error retrieving logs',
            message: error.message
        });
    }
});

// Endpoint to read a specific log file
app.get('/logs/:filename', (req, res) => {
    try {
        const filename = sanitizeFilename(req.params.filename);
        if (!filename || !filename.endsWith('.log')) {
            return res.status(400).json({
                error: 'Invalid filename',
                message: 'Filename must contain only [A-Za-z0-9._-] and end with .log',
            });
        }

        const logContent = logger.readLogFile(filename);
        if (!logContent) {
            return res.status(404).json({
                error: 'Log file not found',
                message: `File ${filename} does not exist`
            });
        }

        let content = logContent;
        if (req.query.lines !== undefined) {
            const numLines = clampInt(req.query.lines, { min: 1, max: 10000, fallback: 500 });
            const logLines = content.split('\n');
            content = logLines.slice(-numLines).join('\n');
        }

        res.json({
            filename,
            content,
            totalLines: logContent.split('\n').length
        });
    } catch (error) {
        logger.error('Error reading log file', error, {
            filename: req.params.filename
        });
        res.status(500).json({
            error: 'Error reading log',
            message: error.message
        });
    }
});

// Endpoint to clean old logs
app.post('/logs/cleanup', (req, res) => {
    try {
        const daysToKeep = clampInt(req.body?.daysToKeep, { min: 1, max: 3650, fallback: 7 });
        logger.clearOldLogs(daysToKeep);
        res.json({
            message: `Logs older than ${daysToKeep} days successfully deleted`
        });
    } catch (error) {
        logger.error('Error cleaning logs', error);
        res.status(500).json({
            error: 'Error cleaning logs',
            message: error.message
        });
    }
});

// Server startup
const PORT = process.env.PORT || 3005;
const server = app.listen(PORT, () => {
    logger.info('FenixTrace Integration Kit Server started', {
        port: PORT,
        walletAddress: getWalletAddress(),
        network: IOTA_NODE_URL,
        contractAddress: COMPANY_SUPPLY_CHAIN_OBJECT_ID,
        nodeEnv: process.env.NODE_ENV || 'development'
    });
    
    console.log(`\n🚀 FenixTrace Integration Kit Server started!`);
    console.log(`📡 Server listening on port ${PORT}`);
    console.log(`🔗 Wallet Address: ${getWalletAddress()}`);
    console.log(`🌐 Network: ${IOTA_NODE_URL}`);
    console.log(`📋 Company Object ID: ${COMPANY_SUPPLY_CHAIN_OBJECT_ID}`);
    console.log(`🧩 Module: ${COMPANY_SUPPLY_CHAIN_MODULE || (IOTA_PACKAGE_ID ? `${IOTA_PACKAGE_ID}::company_supply_chain` : '')}`);
    console.log(`\n📚 Available endpoints:`);
    console.log(`   GET  http://localhost:${PORT}/`);
    console.log(`   GET  http://localhost:${PORT}/status`);
    console.log(`   GET  http://localhost:${PORT}/processed`);
    console.log(`   GET  http://localhost:${PORT}/logs`);
    console.log(`   GET  http://localhost:${PORT}/logs/:filename`);
    console.log(`   POST http://localhost:${PORT}/process-all`);
    console.log(`   POST http://localhost:${PORT}/process/:filename`);
    console.log(`   POST http://localhost:${PORT}/logs/cleanup`);
    console.log(`\n💡 To process all products: curl -X POST http://localhost:${PORT}/process-all`);
    console.log(`💡 To view processed products: curl http://localhost:${PORT}/processed`);
    console.log(`💡 To view logs: curl http://localhost:${PORT}/logs`);
    
    // Automatic log cleanup on startup
    logger.clearOldLogs(7);
    
    // Start automatic processing if requested
    if (process.env.AUTO_PROCESS === 'true') {
        setTimeout(async () => {
            try {
                await processAllProducts();
            } catch (error) {
                console.error('❌ Error in automatic processing:', error.message);
            }
        }, 2000);
    }
    
    // Periodic automatic monitoring
    if (process.env.AUTO_PROCESS === 'true') {
        const intervalMinutes = parseInt(process.env.AUTO_PROCESS_INTERVAL_MINUTES) || 5;
        console.log(`🔄 Automatic monitoring active every ${intervalMinutes} minutes`);
        
        global.autoProcessInterval = setInterval(async () => {
            if (isAutoProcessingActive || isProcessing) {
                console.log('⏭️  Automatic monitoring skipped: processing already in progress');
                return;
            }
            
            isAutoProcessingActive = true;
            
            try {
                const uploadsDir = path.join(__dirname, 'uploads');
                const files = fs.readdirSync(uploadsDir);
                const jsonFiles = files.filter(file => file.endsWith('.json') && file !== '.gitkeep');
                
                console.log(`\n🔍 Automatic check: ${jsonFiles.length} files found`);
                
                if (jsonFiles.length > 0) {
                    console.log('🚀 Starting automatic processing...');
                    await processAllProducts();
                } else {
                    console.log('📭 No files to process');
                }
            } catch (error) {
                console.error('❌ Error in automatic monitoring:', error.message);
                logger.error('Error in automatic monitoring', error);
            } finally {
                isAutoProcessingActive = false;
            }
        }, intervalMinutes * 60 * 1000);
    }
});

// Graceful shutdown handling for PM2
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('SIGUSR2', gracefulShutdown); // PM2 reload signal

function gracefulShutdown(signal) {
    console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
    logger.info(`Graceful shutdown initiated by ${signal}`);
    
    // Stop automatic processing if active
    if (global.autoProcessInterval) {
        clearInterval(global.autoProcessInterval);
        console.log('⏹️  Automatic processing stopped');
    }
    
    // Close server
    if (server) {
        server.close((err) => {
            if (err) {
                console.error('❌ Error during server shutdown:', err);
                logger.error('Error during server shutdown', err);
                process.exit(1);
            }
            
            console.log('✅ Server closed successfully');
            logger.info('Server shutdown completed');
            process.exit(0);
        });
        
        // Force close after 10 seconds
        setTimeout(() => {
            console.log('⚠️  Forcing shutdown after timeout');
            process.exit(1);
        }, 10000);
    } else {
        process.exit(0);
    }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    logger.error('Uncaught Exception', error);
    gracefulShutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    logger.error('Unhandled Rejection', { reason, promise });
    gracefulShutdown('unhandledRejection');
});

module.exports = app;
