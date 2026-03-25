# SSL Certificates (Legacy)

This directory is retained for backward compatibility. The recommended approach
is to use the automated Let's Encrypt / certbot integration instead.

See `Docs/operations/ssl-certificates.md` for the full setup guide.

## Automated Setup (Recommended)

Certificates are now managed by the certbot container and stored in a shared
Docker volume (`certbot_conf`). Run the init script to provision certificates:

```bash
./scripts/init-letsencrypt.sh
```

## Self-signed (Development Only)

For local development without Let's Encrypt, you can still use self-signed
certificates. Generate them and place them here:

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout key.pem -out cert.pem \
  -subj "/CN=localhost"
```

Then update `nginx.conf` to reference these paths instead of the certbot paths:

```nginx
ssl_certificate /etc/nginx/ssl/cert.pem;
ssl_certificate_key /etc/nginx/ssl/key.pem;
```
