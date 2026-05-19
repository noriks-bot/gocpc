# goCPC

Noriks Google Ads campaign creation + monitoring app.

**URL:** https://gocpc.noriks.com
**Server:** firma_appi (3.79.235.43)
**Port:** 3011
**PM2:** `gocpc`
**Path:** `~/apps/gocpc`

## Dev

```bash
npm install
cp .env.example .env
npm run dev
```

## Deploy

```bash
ssh -i ~/.ssh/firma_appi.pem ec2-user@3.79.235.43 \
  "cd ~/apps/gocpc && git stash && GIT_SSH_COMMAND='ssh -i ~/.ssh/github_noriks' git pull && pm2 restart gocpc"
```

## Status

🚧 Demo skeleton. Google Ads API integration pending.
