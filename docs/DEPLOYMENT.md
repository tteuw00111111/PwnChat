# PwnChat Deployment Guide

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Database Deployment](#database-deployment)
- [Backend Deployment](#backend-deployment)
- [Desktop Application Distribution](#desktop-application-distribution)
- [Security Hardening](#security-hardening)
- [Monitoring & Logging](#monitoring--logging)
- [Backup & Recovery](#backup--recovery)
- [Scaling Considerations](#scaling-considerations)
- [CI/CD Pipeline](#cicd-pipeline)
- [Troubleshooting](#troubleshooting)

## Overview

This guide covers deploying PwnChat in production environments, from single-server deployments to scalable cloud architectures. The deployment includes:

- PostgreSQL database with encryption at rest
- Node.js backend API server with clustering
- Desktop application distribution across platforms
- SSL/TLS termination and security hardening
- Monitoring, logging, and alerting systems

## Prerequisites

### Infrastructure Requirements

**Minimum Production Server:**
- **CPU**: 2 vCPUs (4 vCPUs recommended)
- **RAM**: 4GB (8GB recommended)
- **Storage**: 50GB SSD (100GB+ recommended)
- **Network**: 1Gbps connection
- **OS**: Ubuntu 22.04 LTS, CentOS 8+, or RHEL 8+

**Recommended Production Setup:**
- **Load Balancer**: HAProxy, nginx, or cloud load balancer
- **Application Servers**: 2+ instances for high availability
- **Database**: PostgreSQL with read replicas
- **Cache**: Redis for session storage and caching
- **Monitoring**: Prometheus + Grafana stack

### Required Software

```bash
# Core dependencies
- Node.js 20.x LTS
- PostgreSQL 16.x
- nginx or Apache HTTP Server
- Docker & Docker Compose (optional)
- Git

# Build tools
- Python 3.11+
- GCC/Clang compiler
- pkg-config
- libsignal-protocol-c development libraries
```

## Environment Setup

### 1. System Preparation

```bash
# Ubuntu/Debian
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget gnupg2 software-properties-common

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install build tools
sudo apt install -y build-essential python3-dev libsignal-protocol-c-dev \
  libssl-dev pkg-config postgresql-client nginx certbot

# CentOS/RHEL
sudo dnf update -y
sudo dnf install -y curl wget epel-release
sudo dnf module enable nodejs:20
sudo dnf install -y nodejs npm gcc-c++ make python3-devel \
  openssl-devel pkg-config postgresql nginx certbot
```

### 2. Create Application User

```bash
# Create dedicated user for security
sudo useradd --system --create-home --shell /bin/bash pwnchat
sudo usermod -aG nginx pwnchat

# Set up directory structure
sudo mkdir -p /opt/pwnchat/{app,logs,data}
sudo chown -R pwnchat:pwnchat /opt/pwnchat
```

### 3. Environment Configuration

```bash
# Create environment file
sudo -u pwnchat tee /opt/pwnchat/.env << 'EOF'
# Server Configuration
NODE_ENV=production
PORT=3001
HOST=0.0.0.0

# Database Configuration
DATABASE_URL=postgresql://pwnchat_user:secure_password@localhost:5432/pwnchat_db
DB_SSL=true
DB_CONNECTION_POOL_MIN=2
DB_CONNECTION_POOL_MAX=10

# JWT Configuration
JWT_SECRET=your-super-secure-jwt-secret-256-bits-minimum
JWT_EXPIRES_IN=1h
JWT_REFRESH_SECRET=your-super-secure-refresh-secret-256-bits
JWT_REFRESH_EXPIRES_IN=7d

# Security Configuration
BCRYPT_ROUNDS=12
CORS_ORIGIN=https://your-domain.com
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100

# SSL/TLS Configuration
HTTPS_KEY=/etc/ssl/private/pwnchat.key
HTTPS_CERT=/etc/ssl/certs/pwnchat.crt
HTTPS_PORT=3443

# Logging Configuration
LOG_LEVEL=info
LOG_FILE=/opt/pwnchat/logs/app.log
LOG_MAX_SIZE=10MB
LOG_MAX_FILES=10

# Redis Configuration (if using)
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=your-redis-password

# Email Configuration (for notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@pwnchat.com
EOF

# Secure the environment file
sudo chmod 600 /opt/pwnchat/.env
```

## Database Deployment

### 1. PostgreSQL Installation & Configuration

```bash
# Install PostgreSQL 16
sudo apt install -y postgresql-16 postgresql-contrib-16

# Configure PostgreSQL
sudo -u postgres psql << 'EOF'
-- Create database and user
CREATE DATABASE pwnchat_db WITH ENCODING 'UTF8';
CREATE USER pwnchat_user WITH ENCRYPTED PASSWORD 'secure_password';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE pwnchat_db TO pwnchat_user;
GRANT USAGE, CREATE ON SCHEMA public TO pwnchat_user;

-- Enable extensions
\c pwnchat_db
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

\q
EOF
```

### 2. Database Security Hardening

```bash
# Edit postgresql.conf
sudo tee -a /etc/postgresql/16/main/postgresql.conf << 'EOF'
# Connection settings
listen_addresses = 'localhost'
port = 5432
max_connections = 100

# Security settings
ssl = on
ssl_cert_file = '/etc/ssl/certs/ssl-cert-snakeoil.pem'
ssl_key_file = '/etc/ssl/private/ssl-cert-snakeoil.key'
password_encryption = scram-sha-256

# Logging
log_min_messages = warning
log_min_error_statement = error
log_connections = on
log_disconnections = on
log_statement = 'mod'

# Performance
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
EOF

# Configure pg_hba.conf for secure access
sudo tee /etc/postgresql/16/main/pg_hba.conf << 'EOF'
# TYPE  DATABASE        USER            ADDRESS                 METHOD
local   all             postgres                                peer
local   all             all                                     peer
host    pwnchat_db      pwnchat_user    127.0.0.1/32           scram-sha-256
host    pwnchat_db      pwnchat_user    ::1/128                scram-sha-256
hostssl all             all             0.0.0.0/0              scram-sha-256
EOF

# Restart PostgreSQL
sudo systemctl restart postgresql
sudo systemctl enable postgresql
```

### 3. Database Migrations

```bash
# Deploy schema and run migrations
sudo -u pwnchat bash << 'EOF'
cd /opt/pwnchat/app

# Run migrations in order
for migration in db-init/*.sql; do
    echo "Running migration: $migration"
    psql $DATABASE_URL -f "$migration"
    if [ $? -eq 0 ]; then
        echo "✅ Migration completed: $migration"
    else
        echo "❌ Migration failed: $migration"
        exit 1
    fi
done
EOF
```

## Backend Deployment

### 1. Application Deployment

```bash
# Clone and build application
sudo -u pwnchat bash << 'EOF'
cd /opt/pwnchat
git clone https://github.com/brucewayne/pwnchat-project.git app
cd app

# Install dependencies
npm ci --only=production
cd backend && npm ci --only=production && cd ..

# Build native modules
npm run build:native

# Build application
npm run build
EOF
```

### 2. Process Management with PM2

```bash
# Install PM2 globally
sudo npm install -g pm2

# Create PM2 ecosystem configuration
sudo -u pwnchat tee /opt/pwnchat/app/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'pwnchat-backend',
      script: './backend/server.js',
      cwd: '/opt/pwnchat/app',
      instances: 'max',
      exec_mode: 'cluster',
      env_file: '/opt/pwnchat/.env',
      error_file: '/opt/pwnchat/logs/error.log',
      out_file: '/opt/pwnchat/logs/out.log',
      log_file: '/opt/pwnchat/logs/combined.log',
      pid_file: '/opt/pwnchat/logs/pwnchat.pid',
      merge_logs: true,
      max_memory_restart: '500M',
      node_args: '--max-old-space-size=512',

      // Auto-restart configuration
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',

      // Health check
      health_check_grace_period: 5000,
      health_check_fatal_exceptions: false,

      // Environment-specific overrides
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001
      }
    }
  ]
};
EOF

# Start application with PM2
sudo -u pwnchat bash << 'EOF'
cd /opt/pwnchat/app
pm2 start ecosystem.config.js --env production
pm2 save
EOF

# Generate PM2 startup script
pm2 startup systemd -u pwnchat --hp /home/pwnchat
# Follow the instructions provided by the command above
```

### 3. nginx Reverse Proxy Configuration

```bash
# Create nginx configuration
sudo tee /etc/nginx/sites-available/pwnchat << 'EOF'
# Rate limiting
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/s;

# Upstream backend servers
upstream pwnchat_backend {
    least_conn;
    server 127.0.0.1:3001 max_fails=3 fail_timeout=30s;
    # Add more servers for load balancing:
    # server 127.0.0.1:3002 max_fails=3 fail_timeout=30s;
    keepalive 32;
}

server {
    listen 80;
    listen [::]:80;
    server_name your-domain.com www.your-domain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name your-domain.com www.your-domain.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # SSL Security
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # HSTS
    add_header Strict-Transport-Security "max-age=63072000" always;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Referrer-Policy "strict-origin-when-cross-origin";
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' wss: https:;";

    # Logging
    access_log /var/log/nginx/pwnchat_access.log;
    error_log /var/log/nginx/pwnchat_error.log warn;

    # Client settings
    client_max_body_size 10M;
    client_body_timeout 30s;
    client_header_timeout 30s;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml application/json;

    # API endpoints
    location /api/ {
        # Rate limiting
        limit_req zone=api burst=20 nodelay;

        # Authentication endpoints have stricter limits
        location ~ ^/api/auth/ {
            limit_req zone=auth burst=5 nodelay;
            proxy_pass http://pwnchat_backend;
            include /etc/nginx/proxy_params;
        }

        proxy_pass http://pwnchat_backend;
        include /etc/nginx/proxy_params;

        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;

        # Timeouts
        proxy_connect_timeout 5s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # WebSocket endpoint
    location /socket.io/ {
        proxy_pass http://pwnchat_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket timeouts
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://pwnchat_backend/api/health;
        access_log off;
    }

    # Static assets (if serving any)
    location /static/ {
        root /opt/pwnchat/app/public;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Block access to sensitive files
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }

    location ~ ^/(\.env|\.git|config|logs)/ {
        deny all;
        access_log off;
        log_not_found off;
    }
}
EOF

# Enable site and test configuration
sudo ln -s /etc/nginx/sites-available/pwnchat /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 4. SSL Certificate Setup

```bash
# Install Certbot and obtain SSL certificate
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Set up automatic renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

## Desktop Application Distribution

### 1. GitHub Releases Setup

The GitHub Actions workflow automatically builds and releases desktop applications. To set up:

```bash
# Create GitHub release
git tag v1.0.0
git push origin v1.0.0

# The workflow will automatically:
# 1. Build applications for Windows, macOS, and Linux
# 2. Create installers and packages
# 3. Upload to GitHub Releases
```

### 2. Manual Distribution Build

```bash
# Build for all platforms (requires appropriate build environment)
npm run build
npm run dist:all

# Build for specific platforms
npm run dist:win    # Windows
npm run dist:mac    # macOS
npm run dist:linux  # Linux
```

### 3. Code Signing (Production)

For production releases, set up code signing:

```bash
# Windows: Add to GitHub Secrets
# - WIN_CSC_LINK (base64 encoded .p12 file)
# - WIN_CSC_KEY_PASSWORD (certificate password)

# macOS: Add to GitHub Secrets
# - CSC_LINK (base64 encoded .p12 file)
# - CSC_KEY_PASSWORD (certificate password)
# - APPLEID (Apple ID for notarization)
# - APPLEIDPASS (app-specific password)
```

## Security Hardening

### 1. Firewall Configuration

```bash
# Configure UFW (Ubuntu Firewall)
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw allow from 127.0.0.1 to any port 5432  # PostgreSQL localhost only
sudo ufw enable

# Check status
sudo ufw status verbose
```

### 2. Fail2Ban Setup

```bash
# Install and configure Fail2Ban
sudo apt install fail2ban

# Create jail configuration
sudo tee /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5
backend = systemd

[nginx-http-auth]
enabled = true

[nginx-limit-req]
enabled = true
filter = nginx-limit-req
action = iptables-multiport[name=ReqLimit, port="http,https", protocol=tcp]
logpath = /var/log/nginx/*error.log
findtime = 600
bantime = 7200
maxretry = 10

[sshd]
enabled = true
port = ssh
logpath = %(sshd_log)s
backend = systemd
maxretry = 3
bantime = 86400
EOF

sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### 3. System Security Updates

```bash
# Enable automatic security updates
sudo apt install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades

# Configure automatic updates
sudo tee /etc/apt/apt.conf.d/50unattended-upgrades << 'EOF'
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}";
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};
Unattended-Upgrade::AutoFixInterruptedDpkg "true";
Unattended-Upgrade::MinimalSteps "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
EOF
```

## Monitoring & Logging

### 1. Prometheus & Node Exporter

```bash
# Install Node Exporter
wget https://github.com/prometheus/node_exporter/releases/download/v1.6.1/node_exporter-1.6.1.linux-amd64.tar.gz
tar xvfz node_exporter-1.6.1.linux-amd64.tar.gz
sudo cp node_exporter-1.6.1.linux-amd64/node_exporter /usr/local/bin/
sudo chown prometheus:prometheus /usr/local/bin/node_exporter

# Create systemd service
sudo tee /etc/systemd/system/node-exporter.service << 'EOF'
[Unit]
Description=Prometheus Node Exporter
After=network.target

[Service]
User=prometheus
Group=prometheus
Type=simple
ExecStart=/usr/local/bin/node_exporter

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable node-exporter
sudo systemctl start node-exporter
```

### 2. Application Monitoring

```bash
# Add PM2 monitoring
sudo -u pwnchat pm2 install pm2-prometheus-exporter

# Configure application metrics endpoint
# Add to backend server.js:
const prometheus = require('prom-client');

// Create metrics
const httpRequestDuration = new prometheus.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code']
});

const activeConnections = new prometheus.Gauge({
  name: 'websocket_active_connections',
  help: 'Number of active WebSocket connections'
});
```

### 3. Log Management

```bash
# Configure log rotation
sudo tee /etc/logrotate.d/pwnchat << 'EOF'
/opt/pwnchat/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    copytruncate
    postrotate
        sudo -u pwnchat pm2 reloadLogs
    endscript
}
EOF

# Configure rsyslog for centralized logging
sudo tee -a /etc/rsyslog.conf << 'EOF'
# PwnChat application logs
$ModLoad imfile
$InputFileName /opt/pwnchat/logs/app.log
$InputFileTag pwnchat:
$InputFileStateFile stat-pwnchat
$InputFileSeverity info
$InputFileFacility local0
$InputRunFileMonitor

local0.*    /var/log/pwnchat.log
& stop
EOF

sudo systemctl restart rsyslog
```

## Backup & Recovery

### 1. Database Backup

```bash
# Create backup script
sudo tee /opt/pwnchat/backup.sh << 'EOF'
#!/bin/bash

BACKUP_DIR="/opt/pwnchat/backups"
BACKUP_FILE="pwnchat_$(date +%Y%m%d_%H%M%S).sql"
RETENTION_DAYS=30

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Create database backup
pg_dump $DATABASE_URL > "$BACKUP_DIR/$BACKUP_FILE"

# Compress backup
gzip "$BACKUP_DIR/$BACKUP_FILE"

# Remove old backups
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete

# Log backup completion
echo "$(date): Database backup completed: $BACKUP_FILE.gz" >> /opt/pwnchat/logs/backup.log
EOF

sudo chmod +x /opt/pwnchat/backup.sh

# Schedule daily backups
sudo -u pwnchat crontab -e
# Add: 0 2 * * * /opt/pwnchat/backup.sh
```

### 2. Application Backup

```bash
# Create application backup script
sudo tee /opt/pwnchat/app-backup.sh << 'EOF'
#!/bin/bash

BACKUP_DIR="/opt/pwnchat/backups/app"
BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
APP_DIR="/opt/pwnchat/app"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Create application backup (excluding node_modules and logs)
tar -czf "$BACKUP_DIR/pwnchat_app_$BACKUP_DATE.tar.gz" \
  --exclude="node_modules" \
  --exclude="logs" \
  --exclude=".git" \
  -C /opt/pwnchat app

# Keep only last 7 application backups
find "$BACKUP_DIR" -name "pwnchat_app_*.tar.gz" -mtime +7 -delete

echo "$(date): Application backup completed: pwnchat_app_$BACKUP_DATE.tar.gz" >> /opt/pwnchat/logs/backup.log
EOF

sudo chmod +x /opt/pwnchat/app-backup.sh
```

### 3. Disaster Recovery Plan

```bash
# Database recovery
psql $DATABASE_URL < backup_file.sql

# Application recovery
cd /opt/pwnchat
tar -xzf backups/app/pwnchat_app_YYYYMMDD_HHMMSS.tar.gz
sudo -u pwnchat pm2 restart pwnchat-backend

# Certificate recovery (if needed)
sudo certbot certificates
sudo certbot renew
```

## Scaling Considerations

### 1. Horizontal Scaling

```bash
# Load balancer configuration for multiple backend instances
upstream pwnchat_backend {
    least_conn;
    server 10.0.1.10:3001 weight=3 max_fails=3 fail_timeout=30s;
    server 10.0.1.11:3001 weight=3 max_fails=3 fail_timeout=30s;
    server 10.0.1.12:3001 weight=2 max_fails=3 fail_timeout=30s;
    keepalive 64;
}

# Redis session store for session sharing
REDIS_URL=redis://redis-cluster.internal:6379
SESSION_STORE=redis
```

### 2. Database Scaling

```sql
-- Read replica configuration
-- Primary: write operations
-- Replica: read operations for message history

-- Connection pooling
DB_POOL_SIZE=20
DB_READ_POOL_SIZE=10

-- Database partitioning for large message volumes
CREATE TABLE messages_2024_01 PARTITION OF messages
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
```

### 3. CDN and Static Assets

```nginx
# Serve static assets via CDN
location /static/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
    # Serve from local filesystem or CDN
    try_files $uri @cdn;
}

location @cdn {
    proxy_pass https://cdn.your-domain.com;
}
```

## CI/CD Pipeline

The GitHub Actions workflow automatically handles:

1. **Testing**: Run tests on multiple platforms
2. **Security Scanning**: Automated vulnerability detection
3. **Building**: Create production builds
4. **Packaging**: Generate platform-specific installers
5. **Release**: Deploy to GitHub Releases

### Manual Deployment

```bash
# Production deployment script
#!/bin/bash
set -e

echo "🚀 Starting PwnChat deployment..."

# Pull latest code
sudo -u pwnchat bash << 'EOF'
cd /opt/pwnchat/app
git pull origin main

# Install dependencies
npm ci --only=production
cd backend && npm ci --only=production && cd ..

# Build application
npm run build
EOF

# Run database migrations
sudo -u pwnchat bash << 'EOF'
cd /opt/pwnchat/app
for migration in db-init/*.sql; do
    psql $DATABASE_URL -f "$migration" 2>/dev/null || echo "Migration already applied: $migration"
done
EOF

# Restart application
sudo -u pwnchat pm2 restart pwnchat-backend

# Verify deployment
sleep 5
curl -f http://localhost:3001/api/health || exit 1

echo "✅ Deployment completed successfully!"
```

## Troubleshooting

### Common Issues

1. **Application won't start**
   ```bash
   # Check logs
   sudo -u pwnchat pm2 logs pwnchat-backend

   # Check environment
   sudo -u pwnchat pm2 env 0

   # Restart with debug
   sudo -u pwnchat DEBUG=* pm2 restart pwnchat-backend
   ```

2. **Database connection issues**
   ```bash
   # Test connection
   sudo -u pwnchat psql $DATABASE_URL -c "SELECT version();"

   # Check PostgreSQL status
   sudo systemctl status postgresql
   sudo tail -f /var/log/postgresql/postgresql-16-main.log
   ```

3. **SSL certificate issues**
   ```bash
   # Check certificate status
   sudo certbot certificates

   # Test SSL configuration
   sudo nginx -t
   openssl s_client -connect your-domain.com:443 -servername your-domain.com
   ```

4. **Performance issues**
   ```bash
   # Monitor system resources
   htop
   iotop
   nethogs

   # Check application metrics
   sudo -u pwnchat pm2 monit

   # Database performance
   sudo -u postgres psql -c "SELECT * FROM pg_stat_activity;"
   ```

### Health Checks

```bash
# Application health check
curl -f http://localhost:3001/api/health

# Database health check
sudo -u pwnchat psql $DATABASE_URL -c "SELECT 1;"

# WebSocket health check
wscat -c ws://localhost:3001/socket.io/?transport=websocket

# SSL certificate expiry check
echo | openssl s_client -servername your-domain.com -connect your-domain.com:443 2>/dev/null | openssl x509 -noout -dates
```

This deployment guide provides a comprehensive production-ready setup for PwnChat with security, monitoring, and scalability considerations.