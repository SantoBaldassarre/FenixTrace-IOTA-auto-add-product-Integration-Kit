#!/bin/bash

# PM2 Utility Script for FenixTrace Integration Kit
# This script provides easy management of the PM2 process

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="fenixtrace-integration"
ECOSYSTEM_FILE="ecosystem.config.js"
LOG_LINES=50

# Functions
print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}  FenixTrace PM2 Manager${NC}"
    echo -e "${BLUE}================================${NC}"
}

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_pm2() {
    if ! command -v pm2 &> /dev/null; then
        print_error "PM2 is not installed. Installing..."
        npm install -g pm2
    fi
}

check_ecosystem() {
    if [ ! -f "$ECOSYSTEM_FILE" ]; then
        print_error "Ecosystem file $ECOSYSTEM_FILE not found!"
        exit 1
    fi
}

start_app() {
    print_status "Starting $APP_NAME with PM2..."
    check_pm2
    check_ecosystem
    
    if pm2 describe "$APP_NAME" > /dev/null 2>&1; then
        print_warning "Application $APP_NAME is already running. Use restart instead."
        show_status
    else
        pm2 start "$ECOSYSTEM_FILE"
        print_status "Application started successfully!"
        show_status
    fi
}

stop_app() {
    print_status "Stopping $APP_NAME..."
    if pm2 describe "$APP_NAME" > /dev/null 2>&1; then
        pm2 stop "$APP_NAME"
        print_status "Application stopped successfully!"
    else
        print_warning "Application $APP_NAME is not running."
    fi
}

restart_app() {
    print_status "Restarting $APP_NAME..."
    if pm2 describe "$APP_NAME" > /dev/null 2>&1; then
        pm2 restart "$APP_NAME"
        print_status "Application restarted successfully!"
        show_status
    else
        print_warning "Application $APP_NAME is not running. Starting instead..."
        start_app
    fi
}

reload_app() {
    print_status "Reloading $APP_NAME (zero-downtime)..."
    if pm2 describe "$APP_NAME" > /dev/null 2>&1; then
        pm2 reload "$APP_NAME"
        print_status "Application reloaded successfully!"
        show_status
    else
        print_warning "Application $APP_NAME is not running. Starting instead..."
        start_app
    fi
}

delete_app() {
    print_status "Deleting $APP_NAME from PM2..."
    if pm2 describe "$APP_NAME" > /dev/null 2>&1; then
        pm2 delete "$APP_NAME"
        print_status "Application deleted successfully!"
    else
        print_warning "Application $APP_NAME is not running."
    fi
}

show_status() {
    print_status "Current PM2 status:"
    pm2 status
}

show_logs() {
    print_status "Showing last $LOG_LINES lines of logs for $APP_NAME:"
    if pm2 describe "$APP_NAME" > /dev/null 2>&1; then
        pm2 logs "$APP_NAME" --lines "$LOG_LINES"
    else
        print_warning "Application $APP_NAME is not running."
    fi
}

follow_logs() {
    print_status "Following logs for $APP_NAME (Ctrl+C to exit):"
    if pm2 describe "$APP_NAME" > /dev/null 2>&1; then
        pm2 logs "$APP_NAME" --lines 0
    else
        print_warning "Application $APP_NAME is not running."
    fi
}

show_monitoring() {
    print_status "Opening PM2 monitoring dashboard..."
    pm2 monit
}

show_info() {
    print_status "Detailed information for $APP_NAME:"
    if pm2 describe "$APP_NAME" > /dev/null 2>&1; then
        pm2 describe "$APP_NAME"
    else
        print_warning "Application $APP_NAME is not running."
    fi
}

health_check() {
    print_status "Performing health check..."
    
    if pm2 describe "$APP_NAME" > /dev/null 2>&1; then
        # Check if process is running
        STATUS=$(pm2 jlist | jq -r '.[] | select(.name=="'$APP_NAME'") | .pm2_env.status')
        
        if [ "$STATUS" = "online" ]; then
            print_status "✅ Process is running"
            
            # Check HTTP endpoint
            if curl -s -f http://localhost:3005/health > /dev/null; then
                print_status "✅ HTTP health check passed"
            else
                print_error "❌ HTTP health check failed"
            fi
            
            # Check memory usage
            MEMORY=$(pm2 jlist | jq -r '.[] | select(.name=="'$APP_NAME'") | .monit.memory')
            MEMORY_MB=$((MEMORY / 1024 / 1024))
            print_status "📊 Memory usage: ${MEMORY_MB}MB"
            
            # Check CPU usage
            CPU=$(pm2 jlist | jq -r '.[] | select(.name=="'$APP_NAME'") | .monit.cpu')
            print_status "📊 CPU usage: ${CPU}%"
            
            # Check restart count
            RESTARTS=$(pm2 jlist | jq -r '.[] | select(.name=="'$APP_NAME'") | .pm2_env.restart_time')
            print_status "🔄 Restart count: $RESTARTS"
            
        else
            print_error "❌ Process is not online (status: $STATUS)"
        fi
    else
        print_error "❌ Application $APP_NAME is not managed by PM2"
    fi
}

save_config() {
    print_status "Saving PM2 configuration..."
    pm2 save
    print_status "Configuration saved! Run 'pm2 startup' to enable auto-start on boot."
}

show_help() {
    print_header
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  start     - Start the application"
    echo "  stop      - Stop the application"
    echo "  restart   - Restart the application"
    echo "  reload    - Reload the application (zero-downtime)"
    echo "  delete    - Delete the application from PM2"
    echo "  status    - Show PM2 status"
    echo "  logs      - Show recent logs"
    echo "  follow    - Follow logs in real-time"
    echo "  monit     - Open monitoring dashboard"
    echo "  info      - Show detailed application info"
    echo "  health    - Perform health check"
    echo "  save      - Save PM2 configuration"
    echo "  help      - Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 start"
    echo "  $0 logs"
    echo "  $0 health"
}

# Main script logic
case "$1" in
    start)
        start_app
        ;;
    stop)
        stop_app
        ;;
    restart)
        restart_app
        ;;
    reload)
        reload_app
        ;;
    delete)
        delete_app
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs
        ;;
    follow)
        follow_logs
        ;;
    monit)
        show_monitoring
        ;;
    info)
        show_info
        ;;
    health)
        health_check
        ;;
    save)
        save_config
        ;;
    help|--help|-h)
        show_help
        ;;
    "")
        show_help
        ;;
    *)
        print_error "Unknown command: $1"
        show_help
        exit 1
        ;;
esac
