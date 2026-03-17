# Document Virus Scanning

Staffora integrates with [ClamAV](https://www.clamav.net/) to scan uploaded documents for malware before they are accepted into the system. This is an optional security feature that operates in a **fail-open** (degraded) mode when ClamAV is unavailable.

## Architecture

```
Client  -->  Upload file to storage (S3 / local)
        -->  POST /api/v1/documents  (with file_key)
                |
                v
        [Retrieve file from storage]
                |
                v
        [Send to ClamAV via TCP INSTREAM]
                |
          +-----+-----+
          |           |
        Clean      Infected
          |           |
       Create       Delete file
       document     from storage
       record       Return 422
```

### Flow

1. The client uploads the file to storage (via presigned URL or local endpoint) and receives a `file_key`.
2. The client calls `POST /api/v1/documents` (or `POST /api/v1/documents/:id/versions`) with the `file_key`.
3. The API retrieves the file content from storage using the `file_key`.
4. The file buffer is sent to ClamAV via its TCP protocol (`INSTREAM` command).
5. If the file is clean, the document record is created normally.
6. If a virus is detected, the infected file is deleted from storage and the request returns HTTP 422 with error code `VIRUS_DETECTED`.
7. If ClamAV is unavailable, the upload proceeds with a warning logged (degraded mode).

### Endpoints Affected

| Endpoint | Method | Behaviour |
|---|---|---|
| `/api/v1/documents` | POST | Scans file before creating document record |
| `/api/v1/documents/:id/versions` | POST | Scans file before creating version record |

## Setup

### 1. Start ClamAV Container

ClamAV runs as an optional Docker Compose service under the `scanning` profile:

```bash
# Start all services including ClamAV
docker compose -f docker/docker-compose.yml --profile scanning up -d

# Or start just ClamAV
docker compose -f docker/docker-compose.yml --profile scanning up -d clamav
```

The first startup downloads virus definitions (~300 MB) and may take **2-5 minutes** before the service becomes healthy. Subsequent starts are faster because definitions are persisted in the `clamav_data` volume.

### 2. Enable Scanning

Set the following environment variables in `docker/.env`:

```bash
CLAMAV_ENABLED=true
CLAMAV_HOST=clamav      # Docker service name (use 'localhost' outside Docker)
CLAMAV_PORT=3310         # ClamAV clamd TCP port
CLAMAV_TIMEOUT=30000     # Scan timeout in milliseconds
```

Then restart the API:

```bash
docker compose -f docker/docker-compose.yml restart api
```

### 3. Verify

Check that ClamAV is responding:

```bash
# From inside the Docker network
docker exec -it staffora-clamav sh -c 'echo PING | nc localhost 3310'
# Expected: PONG

# Check version
docker exec -it staffora-clamav sh -c 'echo VERSION | nc localhost 3310'
```

## Configuration Reference

| Variable | Default | Description |
|---|---|---|
| `CLAMAV_ENABLED` | `false` | Set to `true` to enable virus scanning |
| `CLAMAV_HOST` | `localhost` | ClamAV hostname (use `clamav` in Docker) |
| `CLAMAV_PORT` | `3310` | ClamAV clamd TCP port |
| `CLAMAV_TIMEOUT` | `30000` | Timeout in milliseconds for scan operations |

## Behaviour Modes

### Scanning Enabled (CLAMAV_ENABLED=true)

| ClamAV Status | File Status | Result |
|---|---|---|
| Available | Clean | Upload proceeds, document created |
| Available | Infected | File deleted, HTTP 422 `VIRUS_DETECTED` returned |
| Unavailable | Any | Upload proceeds (degraded mode), warning logged |

### Scanning Disabled (CLAMAV_ENABLED=false, default)

All uploads proceed without scanning. No ClamAV connection is attempted.

## Error Response

When a virus is detected, the API returns:

```json
{
  "error": {
    "code": "VIRUS_DETECTED",
    "message": "The uploaded file was rejected: virus 'Win.Test.EICAR_HDB-1' detected. Please scan your file with antivirus software and try again.",
    "details": {
      "virusName": "Win.Test.EICAR_HDB-1"
    },
    "requestId": "req_abc123_xyz"
  }
}
```

**HTTP Status**: 422 Unprocessable Entity

The virus name is included in the response to help the user understand what was detected. The infected file is automatically deleted from storage.

## Testing with EICAR

The [EICAR test file](https://www.eicar.org/download-anti-malware-testfile/) is a safe, standardised string that all antivirus engines recognise as a test virus. Use it to verify your setup:

```bash
# Create EICAR test file
echo -n 'X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' > /tmp/eicar.txt

# Upload via your normal upload flow
# The API should return 422 with VIRUS_DETECTED error code
```

## Monitoring

### Logs

Virus scan events are logged with the `virus-scan` component tag:

```
# Successful scan
{"level":"info","component":"virus-scan","fileKey":"tenant-uuid/12345-doc.pdf","msg":"File passed virus scan"}

# Virus detected
{"level":"warn","component":"virus-scan","fileKey":"tenant-uuid/12345-doc.pdf","virusName":"Win.Test.EICAR_HDB-1","msg":"Virus detected in uploaded file"}

# Degraded mode
{"level":"warn","component":"virus-scan","error":"ClamAV connection failed: connect ECONNREFUSED","msg":"ClamAV unavailable, allowing upload in degraded mode"}
```

### Health Check

ClamAV's health is monitored via Docker's healthcheck (PING/PONG protocol). You can also use the programmatic health check:

```typescript
import { pingClamAV, getClamAVVersion } from '../lib/virus-scan';

const healthy = await pingClamAV();     // true/false
const version = await getClamAVVersion(); // "ClamAV 1.4.x/..." or null
```

## Resource Requirements

ClamAV loads its virus definition database into memory on startup:

| Resource | Minimum | Recommended |
|---|---|---|
| RAM | 512 MB | 2 GB |
| CPU | 0.25 cores | 1 core |
| Disk (definitions) | 300 MB | 500 MB |

The Docker Compose configuration limits ClamAV to 2 GB RAM and 1 CPU core.

## Production Considerations

1. **Virus definitions update automatically**: The ClamAV container includes `freshclam` which updates definitions periodically (default: every 2 hours).

2. **Fail-open design**: If ClamAV is down, uploads proceed with a warning. This avoids blocking business operations due to a scanning service outage. Monitor the `virus-scan` component logs for degraded-mode warnings.

3. **Large files**: The default ClamAV `StreamMaxLength` is 25 MB. Files larger than this limit will cause the scan to fail, which triggers degraded mode (upload proceeds). To scan larger files, increase `StreamMaxLength` in the ClamAV configuration.

4. **Scan timeout**: The default timeout is 30 seconds. Extremely large files or a heavily loaded ClamAV instance may require increasing `CLAMAV_TIMEOUT`.

5. **Network security**: ClamAV should only be accessible on the internal Docker network. The port mapping in docker-compose is for development convenience only. In production, remove the port mapping or restrict it to localhost.

6. **GDPR compliance**: Virus scan results (including virus names) are logged but not stored in the database. The infected file is deleted immediately upon detection. No personal data is sent to ClamAV -- only the raw file bytes.
