module.exports = {
  apps: [{
    name: 'fenixtrace-integration',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
      PORT: 3005
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3005
    },
    // Error handling and restart configuration
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 4000,
    
    // Logging configuration
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // Advanced PM2 features
    merge_logs: true,
    time: true,
    
    // Health check configuration
    health_check_url: 'http://localhost:3005/health',
    health_check_grace_period: 10000, // 10 seconds
    health_check_interval: 30000, // Check every 30 seconds
    health_check_timeout: 5000, // 5 seconds timeout
    
    // Graceful shutdown
    kill_timeout: 5000,
    listen_timeout: 3000,
    
    // Environment variables from .env file
    env_file: '.env',
    
    // Cron restart (optional - restart every day at 2 AM)
    cron_restart: '0 2 * * *',
    
    // Source map support for better error tracking
    source_map_support: true,
    
    // Ignore specific files/folders for watch mode (if enabled)
    ignore_watch: [
      'node_modules',
      'logs',
      'uploads',
      'processed',
      '.git'
    ],
    
    // Custom restart conditions
    exp_backoff_restart_delay: 100,
    
    // Process monitoring
    pmx: true,
    
    // Custom error handling
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log'
  }]
};
