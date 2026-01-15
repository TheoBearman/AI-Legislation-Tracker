# Deployment Guide: Ubuntu Server

This guide covers deploying the AI Legislation Dashboard to an Ubuntu server with automated daily updates.

## Prerequisites

- Ubuntu 20.04+ server with SSH access
- Domain name (optional, for production)
- MongoDB Atlas account OR local MongoDB installation

## 1. Server Setup

### Install Node.js 20+

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should be v20.x or higher
npm --version
```

### Install PM2 (Process Manager)

```bash
sudo npm install -g pm2
```

### Install Git

```bash
sudo apt install -y git
```

## 2. Clone and Configure Application

### Clone Repository

```bash
cd ~
git clone https://github.com/YOUR_USERNAME/state-pulse.git
cd state-pulse
```

### Install Dependencies

```bash
npm install
```

### Configure Environment Variables

Create `.env.local` file:

```bash
nano .env.local
```

Add the following (replace with your actual values):

```env
# MongoDB Connection
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/state-pulse?retryWrites=true&w=majority

# API Keys
OPENSTATES_API_KEY=your_openstates_api_key
US_CONGRESS_API_KEY=your_congress_api_key

# Next.js Configuration
NEXTAUTH_URL=http://your-server-ip:3000
NEXTAUTH_SECRET=generate_random_secret_here

# Optional: Google OAuth (if using authentication)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

**Generate NEXTAUTH_SECRET:**
```bash
openssl rand -base64 32
```

### Build Application

```bash
npm run build
```

## 3. Run Application with PM2

### Start the Application

```bash
pm2 start npm --name "state-pulse" -- start
```

### Configure PM2 to Start on Boot

```bash
pm2 startup
# Follow the instructions printed by the command above

pm2 save
```

### Useful PM2 Commands

```bash
# View logs
pm2 logs state-pulse

# Restart application
pm2 restart state-pulse

# Stop application
pm2 stop state-pulse

# Monitor status
pm2 status
```

## 4. Set Up Daily Update Script

### Create Cron Job

```bash
crontab -e
```

Add the following line to run daily at 3 AM UTC:

```cron
0 3 * * * cd /home/YOUR_USERNAME/state-pulse && /usr/bin/npx tsx src/scripts/dailyUpdate.ts >> /home/YOUR_USERNAME/state-pulse/logs/daily-update.log 2>&1
```

**Or** use PM2 cron (recommended):

```bash
# Create a PM2 ecosystem file
nano ecosystem.config.js
```

Add:

```javascript
module.exports = {
  apps: [
    {
      name: 'state-pulse',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'daily-update',
      script: 'npx',
      args: 'tsx src/scripts/dailyUpdate.ts',
      cron_restart: '0 3 * * *',  // Run at 3 AM daily
      autorestart: false,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
```

Start with ecosystem file:

```bash
pm2 delete all  # Clear existing processes
pm2 start ecosystem.config.js
pm2 save
```

### Create Logs Directory

```bash
mkdir -p ~/state-pulse/logs
```

### Manual Test Run

```bash
cd ~/state-pulse
npx tsx src/scripts/dailyUpdate.ts
```

## 5. Configure Firewall

```bash
# Allow SSH (if not already allowed)
sudo ufw allow 22/tcp

# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow Next.js port (temporary, use reverse proxy for production)
sudo ufw allow 3000/tcp

# Enable firewall
sudo ufw enable
```

## 6. Set Up Nginx Reverse Proxy (Production)

### Install Nginx

```bash
sudo apt install -y nginx
```

### Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/state-pulse
```

Add:

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/state-pulse /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Install SSL Certificate (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

Update `.env.local`:
```env
NEXTAUTH_URL=https://your-domain.com
```

Restart application:
```bash
pm2 restart state-pulse
```

## 7. Monitoring and Maintenance

### View Application Logs

```bash
# Real-time logs
pm2 logs state-pulse

# Daily update logs
tail -f ~/state-pulse/logs/daily-update.log
```

### Monitor System Resources

```bash
pm2 monit
```

### Update Application

```bash
cd ~/state-pulse
git pull origin main
npm install
npm run build
pm2 restart state-pulse
```

### Database Backup (if using local MongoDB)

```bash
# Create backup script
nano ~/backup-mongo.sh
```

Add:

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
mongodump --uri="$MONGODB_URI" --out="/home/YOUR_USERNAME/backups/mongo_$DATE"
# Keep only last 7 days of backups
find /home/YOUR_USERNAME/backups -type d -mtime +7 -exec rm -rf {} +
```

Make executable and add to cron:

```bash
chmod +x ~/backup-mongo.sh
crontab -e
# Add: 0 2 * * * /home/YOUR_USERNAME/backup-mongo.sh
```

## 8. Troubleshooting

### Application Won't Start

```bash
# Check logs
pm2 logs state-pulse --lines 100

# Check if port 3000 is in use
sudo lsof -i :3000

# Verify environment variables
cat .env.local
```

### Daily Update Script Fails

```bash
# Check logs
cat ~/state-pulse/logs/daily-update.log

# Test manually
cd ~/state-pulse
npx tsx src/scripts/dailyUpdate.ts

# Verify API keys
echo $OPENSTATES_API_KEY
```

### Database Connection Issues

```bash
# Test MongoDB connection
mongosh "$MONGODB_URI"

# Check network connectivity
ping cluster.mongodb.net
```

## 9. Performance Optimization

### Enable Node.js Production Mode

Already set in ecosystem.config.js, but verify:

```bash
pm2 env state-pulse | grep NODE_ENV
```

### Configure Memory Limits

Edit `ecosystem.config.js`:

```javascript
{
  name: 'state-pulse',
  script: 'npm',
  args: 'start',
  max_memory_restart: '1G',  // Restart if memory exceeds 1GB
  env: {
    NODE_ENV: 'production'
  }
}
```

### Monitor Database Performance

- Set up MongoDB Atlas alerts for slow queries
- Review indexes in MongoDB Compass
- Monitor daily update script execution time

## Quick Reference

```bash
# Start application
pm2 start ecosystem.config.js

# View logs
pm2 logs state-pulse

# Restart after code changes
git pull && npm install && npm run build && pm2 restart state-pulse

# Run daily update manually
npx tsx src/scripts/dailyUpdate.ts

# Check cron jobs
crontab -l

# Monitor all processes
pm2 monit
```

## Security Checklist

- [ ] Firewall configured (ufw)
- [ ] SSL certificate installed
- [ ] Environment variables secured (not in git)
- [ ] MongoDB authentication enabled
- [ ] SSH key-based authentication enabled
- [ ] Regular system updates scheduled
- [ ] Database backups automated
- [ ] API keys rotated periodically
