#!/usr/bin/env bash

# FenixTrace Integration Kit - Docker Utility Script
# Questo script fornisce comandi utili per gestire il container Docker

set -e

# Colori per output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Nome del progetto
PROJECT_NAME="fenixtrace-integration"
CONTAINER_NAME="fenixtrace-integration-kit"

# Funzione per stampare messaggi colorati
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Funzione per verificare se Docker è installato
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker non è installato. Installa Docker prima di continuare."
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose non è installato. Installa Docker Compose prima di continuare."
        exit 1
    fi
}

# Funzione per verificare se il file .env esiste
check_env_file() {
    if [ ! -f ".env" ]; then
        print_warning "File .env non trovato. Copiando .env.example..."
        cp .env.example .env
        print_info "File .env creato. Modifica le configurazioni prima di continuare."
        exit 1
    fi
}

# Funzione per avviare i servizi
start_services() {
    print_info "Avvio dei servizi FenixTrace..."
    docker-compose up -d
    print_success "Services started successfully!"
    print_info "Application is available at: http://localhost:3005"
}

# Funzione per fermare i servizi
stop_services() {
    print_info "Stopping FenixTrace services..."
    docker-compose down
    print_success "Services stopped successfully!"
}

# Funzione per riavviare i servizi
restart_services() {
    print_info "Restarting FenixTrace services..."
    docker-compose down
    docker-compose up -d
    print_success "Services restarted successfully!"
}

# Funzione per visualizzare i logs
show_logs() {
    print_info "Visualizzazione logs in tempo reale (Ctrl+C per uscire)..."
    docker-compose logs -f
}

# Funzione per visualizzare lo status
show_status() {
    print_info "Service status:"
    docker-compose ps
    echo ""
    print_info "Health check:"
    curl -s http://localhost:3005/health && print_success "Service healthy" || print_error "Service unreachable"
}

# Funzione per fare il build
build_image() {
    print_info "Build dell'immagine Docker..."
    docker-compose build --no-cache
    print_success "Build completato con successo!"
}

# Funzione per aggiornare
update_services() {
    print_info "Aggiornamento dei servizi..."
    docker-compose down
    docker-compose build --no-cache
    docker-compose up -d
    print_success "Aggiornamento completato con successo!"
}

# Funzione per pulire
cleanup() {
    print_info "Pulizia risorse Docker..."
    docker-compose down
    docker system prune -f
    print_success "Pulizia completata!"
}

# Funzione per fare backup
backup() {
    BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
    BACKUP_DIR="backup_${BACKUP_DATE}"
    
    print_info "Creazione backup in ${BACKUP_DIR}..."
    mkdir -p "$BACKUP_DIR"
    
    # Backup configurazioni
    cp .env "$BACKUP_DIR/.env.backup"
    
    # Backup dati
    if [ -d "processed" ]; then
        cp -r processed "$BACKUP_DIR/"
    fi
    
    if [ -d "logs" ]; then
        cp -r logs "$BACKUP_DIR/"
    fi
    
    # Crea archivio
    tar -czf "${BACKUP_DIR}.tar.gz" "$BACKUP_DIR"
    rm -rf "$BACKUP_DIR"
    
    print_success "Backup creato: ${BACKUP_DIR}.tar.gz"
}

# Funzione per entrare nel container
shell() {
    print_info "Accesso al container..."
    docker-compose exec $CONTAINER_NAME sh
}

# Funzione per mostrare l'help
show_help() {
    echo "FenixTrace Integration Kit - Docker Utility"
    echo ""
    echo "Uso: $0 [comando]"
    echo ""
    echo "Comandi disponibili:"
    echo "  start     - Avvia i servizi"
    echo "  stop      - Ferma i servizi"
    echo "  restart   - Riavvia i servizi"
    echo "  logs      - Mostra i logs in tempo reale"
    echo "  status    - Mostra lo status dei servizi"
    echo "  build     - Ricostruisce l'immagine Docker"
    echo "  update    - Aggiorna e riavvia i servizi"
    echo "  cleanup   - Pulisce le risorse Docker"
    echo "  backup    - Crea un backup dei dati"
    echo "  shell     - Accede al container"
    echo "  help      - Mostra questo messaggio"
    echo ""
}

# Main script
main() {
    check_docker
    
    case "${1:-help}" in
        start)
            check_env_file
            start_services
            ;;
        stop)
            stop_services
            ;;
        restart)
            restart_services
            ;;
        logs)
            show_logs
            ;;
        status)
            show_status
            ;;
        build)
            build_image
            ;;
        update)
            check_env_file
            update_services
            ;;
        cleanup)
            cleanup
            ;;
        backup)
            backup
            ;;
        shell)
            shell
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            print_error "Comando non riconosciuto: $1"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
