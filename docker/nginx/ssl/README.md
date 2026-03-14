# SSL Certificates

This directory must contain SSL certificates before starting nginx in production.

## Using Let's Encrypt (recommended)

Install certbot and generate certificates:
```bash
certbot certonly --standalone -d yourdomain.com
cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ./cert.pem
cp /etc/letsencrypt/live/yourdomain.com/privkey.pem ./key.pem
```

## Self-signed (development only)

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout key.pem -out cert.pem \
  -subj "/CN=localhost"
```
