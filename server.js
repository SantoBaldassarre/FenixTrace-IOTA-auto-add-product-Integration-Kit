const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const logger = require('./logger');
require('dotenv').config();

// --- FenixTrace API configuration --------------------------------------
// The kit is a PURE API CLIENT: it watches uploads/ for product JSON and
// POSTs each product to FenixTrace. FenixTrace does IPFS + on-chain
// add_product + notarization server-side. No local wallet, gas, or IPFS.
const FENIXTRACE_API_KEY = (process.env.FENIXTRACE_API_KEY || '').trim();
const FENIXTRACE_API_BASE_URL = (process.env.FENIXTRACE_API_BASE_URL || process.env.FRONTEND_API_BASE_URL || '').trim().replace(/\/$/, '');
const FENIXTRACE_PRODUCTS_ENDPOINT = process.env.FENIXTRACE_PRODUCTS_ENDPOINT || '/api/v1/products';

if (!FENIXTRACE_API_KEY || !FENIXTRACE_API_BASE_URL) {
    console.error('❌ Missing required configuration: set both FENIXTRACE_API_KEY and FENIXTRACE_API_BASE_URL in the environment before starting the kit.');
    process.exit(1);
}

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

// Flag to prevent duplicate processes
let isProcessing = false;
let isAutoProcessingActive = false;

/**
 * Registers a product with the FenixTrace API. FenixTrace handles IPFS
 * upload, on-chain add_product signing and notarization server-side.
 * @param {string} productName - Product name
 * @param {object} productData - Raw product data read from the JSON file
 * @returns {Promise<string>} - Transaction digest returned by the API
 */
async function addProductToBlockchain(productName, productData) {
    const startTime = Date.now();
    try {
        logger.info(`Registering product via FenixTrace API`, { productName });
        console.log(`🔗 Registering product ${productName} via FenixTrace API...`);

        const response = await axios.post(
            `${FENIXTRACE_API_BASE_URL}${FENIXTRACE_PRODUCTS_ENDPOINT}`,
            { name: productName, data: productData },
            { headers: { Authorization: `Bearer ${FENIXTRACE_API_KEY}` } },
        );

        const digest = response.data.digest;
        logger.transaction(digest, 'addProduct via FenixTrace API', {
            productName,
            executionTime: `${Date.now() - startTime}ms`
        });
        console.log(`✅ Product ${productName} registered + notarized via FenixTrace API. Digest: ${digest}`);
        return digest;
    } catch (error) {
        const executionTime = Date.now() - startTime;
        logger.error(`Error registering product via FenixTrace API`, error, {
            productName,
            executionTime: `${executionTime}ms`,
            errorDetails: {
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data
            }
        });
        console.error(`❌ Error registering product ${productName}:`, error.response?.data || error.message);
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
        // Read file content to get product name and data
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

        // Register the product with FenixTrace (IPFS + sign + notarize server-side)
        const txHash = await addProductToBlockchain(productName, productData);

        const processingTime = Date.now() - startTime;
        const result = {
            productName,
            fileName,
            txHash,
            success: true
        };

        // Move file to processed folder with upload metadata
        const processedDir = path.join(__dirname, 'processed');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const processedFileNameWithTimestamp = `${timestamp}_${fileName}`;
        const processedFilePathWithTimestamp = path.join(processedDir, processedFileNameWithTimestamp);

        try {
            // Add upload metadata to the head of the JSON
            const uploadMetadata = {
                uploadDetails: {
                    productName: productName,
                    transactionHash: txHash,
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
                txHash
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
        console.log(`📝 Transaction Hash: ${txHash}`);

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
        txHash: r.txHash || null
    })));

    logger.info(`Final batch processing statistics`, {
        total: jsonFiles.length,
        successful,
        failed,
        processingTime: `${processingTime}ms`,
        averageTimePerProduct: jsonFiles.length ? `${Math.round(processingTime / jsonFiles.length)}ms` : '0ms'
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
            '/status': 'GET - Server status'
        }
    });
});

app.get('/status', async (req, res) => {
    res.json({
        status: 'healthy',
        api: {
            baseUrl: FENIXTRACE_API_BASE_URL,
            productsEndpoint: FENIXTRACE_PRODUCTS_ENDPOINT
        }
    });
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

        health.api = {
            baseUrlConfigured: Boolean(FENIXTRACE_API_BASE_URL),
            productsEndpoint: FENIXTRACE_PRODUCTS_ENDPOINT
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
        apiBaseUrl: FENIXTRACE_API_BASE_URL,
        productsEndpoint: FENIXTRACE_PRODUCTS_ENDPOINT,
        nodeEnv: process.env.NODE_ENV || 'development'
    });

    console.log(`\n🚀 FenixTrace Integration Kit Server started!`);
    console.log(`📡 Server listening on port ${PORT}`);
    console.log(`🌐 FenixTrace API: ${FENIXTRACE_API_BASE_URL}`);
    console.log(`📋 Products endpoint: ${FENIXTRACE_PRODUCTS_ENDPOINT}`);
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
