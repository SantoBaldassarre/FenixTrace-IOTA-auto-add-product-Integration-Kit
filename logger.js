const fs = require('fs');
const path = require('path');

/**
 * Logger class for handling application logging with file persistence
 * Provides structured logging with different levels and specialized methods
 */
class Logger {
    /**
     * Initialize the logger with logs directory setup
     */
    constructor() {
        this.logsDir = path.join(__dirname, 'logs');
        this.ensureLogsDirectory();
    }

    /**
     * Ensure the logs directory exists, create if it doesn't
     */
    ensureLogsDirectory() {
        if (!fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir, { recursive: true });
        }
    }

    /**
     * Generate log file name based on current date
     * @returns {string} Full path to the log file
     */
    getLogFileName() {
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        return path.join(this.logsDir, `fenixtrace-${dateStr}.log`);
    }

    /**
     * Format log message with timestamp, level, and optional data
     * @param {string} level - Log level (INFO, ERROR, etc.)
     * @param {string} message - Log message
     * @param {Object} data - Optional data to include
     * @returns {string} Formatted log entry
     */
    formatMessage(level, message, data = null) {
        const timestamp = new Date().toISOString();
        let logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
        
        if (data) {
            logEntry += ` | Data: ${JSON.stringify(data, null, 2)}`;
        }
        
        return logEntry;
    }

    /**
     * Write message to log file
     * @param {string} message - Formatted message to write
     */
    writeToFile(message) {
        const logFile = this.getLogFileName();
        fs.appendFileSync(logFile, message + '\n');
    }

    /**
     * Log informational message
     * @param {string} message - Message to log
     * @param {Object} data - Optional data to include
     */
    info(message, data = null) {
        const formattedMessage = this.formatMessage('INFO', message, data);
        console.log(`ℹ️  ${message}`);
        if (data) console.log('   Data:', data);
        this.writeToFile(formattedMessage);
    }

    /**
     * Log success message
     * @param {string} message - Message to log
     * @param {Object} data - Optional data to include
     */
    success(message, data = null) {
        const formattedMessage = this.formatMessage('SUCCESS', message, data);
        console.log(`✅ ${message}`);
        if (data) console.log('   Data:', data);
        this.writeToFile(formattedMessage);
    }

    /**
     * Log error message with optional error object and data
     * @param {string} message - Error message
     * @param {Error} error - Optional error object
     * @param {Object} data - Optional additional data
     */
    error(message, error = null, data = null) {
        const errorData = error ? {
            message: error.message,
            stack: error.stack,
            ...data
        } : data;
        
        const formattedMessage = this.formatMessage('ERROR', message, errorData);
        console.error(`❌ ${message}`);
        if (error) {
            console.error('   Error:', error.message);
            if (error.stack) console.error('   Stack:', error.stack);
        }
        if (data) console.error('   Data:', data);
        this.writeToFile(formattedMessage);
    }

    /**
     * Log warning message
     * @param {string} message - Warning message
     * @param {Object} data - Optional data to include
     */
    warn(message, data = null) {
        const formattedMessage = this.formatMessage('WARN', message, data);
        console.warn(`⚠️  ${message}`);
        if (data) console.warn('   Data:', data);
        this.writeToFile(formattedMessage);
    }

    /**
     * Log debug message (only shown in development mode)
     * @param {string} message - Debug message
     * @param {Object} data - Optional data to include
     */
    debug(message, data = null) {
        const formattedMessage = this.formatMessage('DEBUG', message, data);
        if (process.env.NODE_ENV === 'development') {
            console.log(`🔍 ${message}`);
            if (data) console.log('   Data:', data);
        }
        this.writeToFile(formattedMessage);
    }

    /**
     * Log blockchain transaction information
     * @param {string} txHash - Transaction hash
     * @param {string} operation - Operation description
     * @param {Object} data - Optional additional transaction data
     */
    transaction(txHash, operation, data = null) {
        const message = `Transaction ${operation}: ${txHash}`;
        const txData = {
            txHash,
            operation,
            timestamp: new Date().toISOString(),
            ...data
        };
        
        this.success(message, txData);
    }

    /**
     * Log IPFS operation information
     * @param {string} ipfsHash - IPFS hash of the file
     * @param {string} fileName - Name of the file
     * @param {string} operation - Operation type (upload, download, etc.)
     * @param {Object} data - Optional additional IPFS data
     */
    ipfs(ipfsHash, fileName, operation = 'upload', data = null) {
        const message = `IPFS ${operation}: ${fileName} -> ${ipfsHash}`;
        const ipfsData = {
            ipfsHash,
            fileName,
            operation,
            timestamp: new Date().toISOString(),
            ...data
        };
        
        this.success(message, ipfsData);
    }

    /**
     * Log gas usage information for blockchain operations
     * @param {number} gasUsed - Amount of gas used
     * @param {number} gasPrice - Gas price in gwei
     * @param {string} operation - Operation description
     * @param {Object} data - Optional additional gas data
     */
    gas(gasUsed, gasPrice, operation, data = null) {
        const message = `Gas usage for ${operation}: ${gasUsed} units at ${gasPrice} gwei`;
        const gasData = {
            gasUsed,
            gasPrice,
            operation,
            cost: (gasUsed * gasPrice) / 1e9, // ETH
            timestamp: new Date().toISOString(),
            ...data
        };
        
        this.info(message, gasData);
    }

    /**
     * Log API request/response information
     * @param {string} method - HTTP method
     * @param {string} endpoint - API endpoint
     * @param {number} statusCode - HTTP status code
     * @param {number} responseTime - Response time in milliseconds
     * @param {Object} data - Optional additional API data
     */
    api(method, endpoint, statusCode, responseTime, data = null) {
        const message = `API ${method} ${endpoint} - ${statusCode} (${responseTime}ms)`;
        const apiData = {
            method,
            endpoint,
            statusCode,
            responseTime,
            timestamp: new Date().toISOString(),
            ...data
        };
        
        if (statusCode >= 200 && statusCode < 300) {
            this.success(message, apiData);
        } else if (statusCode >= 400) {
            this.error(message, null, apiData);
        } else {
            this.info(message, apiData);
        }
    }

    /**
     * Log operation summary with success/failure statistics
     * @param {string} operation - Operation name
     * @param {Array} results - Array of operation results with success property
     */
    summary(operation, results) {
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        const total = results.length;
        
        const message = `${operation} completed: ${successful}/${total} successful, ${failed} failed`;
        const summaryData = {
            operation,
            total,
            successful,
            failed,
            results,
            timestamp: new Date().toISOString()
        };
        
        if (failed === 0) {
            this.success(message, summaryData);
        } else {
            this.warn(message, summaryData);
        }
    }

    /**
     * Get list of all log files with metadata
     * @returns {Array} Array of log file objects with name, path, size, and modified date
     */
    getLogFiles() {
        try {
            const files = fs.readdirSync(this.logsDir)
                .filter(file => file.endsWith('.log'))
                .map(file => ({
                    name: file,
                    path: path.join(this.logsDir, file),
                    size: fs.statSync(path.join(this.logsDir, file)).size,
                    modified: fs.statSync(path.join(this.logsDir, file)).mtime
                }))
                .sort((a, b) => b.modified - a.modified);
            
            return files;
        } catch (error) {
            this.error('Failed to get log files', error);
            return [];
        }
    }

    /**
     * Read contents of a specific log file
     * @param {string} fileName - Name of the log file to read
     * @returns {string|null} File contents or null if error
     */
    readLogFile(fileName) {
        try {
            const filePath = path.join(this.logsDir, fileName);
            return fs.readFileSync(filePath, 'utf8');
        } catch (error) {
            this.error(`Failed to read log file: ${fileName}`, error);
            return null;
        }
    }

    /**
     * Clean up old log files older than specified days
     * @param {number} daysToKeep - Number of days to keep log files (default: 7)
     */
    clearOldLogs(daysToKeep = 7) {
        try {
            const files = this.getLogFiles();
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
            
            let deletedCount = 0;
            files.forEach(file => {
                if (file.modified < cutoffDate) {
                    fs.unlinkSync(file.path);
                    deletedCount++;
                    this.info(`Deleted old log file: ${file.name}`);
                }
            });
            
            if (deletedCount > 0) {
                this.info(`Cleaned up ${deletedCount} old log files`);
            }
        } catch (error) {
            this.error('Failed to clean up old logs', error);
        }
    }
}

// Export singleton instance of Logger
module.exports = new Logger();
