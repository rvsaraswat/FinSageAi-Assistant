# 🐳 Docker Deployment Guide - FinSageAi Assistant

## Prerequisites

- Docker installed ([Get Docker](https://docs.docker.com/get-docker/))
- Docker Compose installed (included with Docker Desktop)
- Ollama running on your host machine at `http://localhost:11434`
- Zerodha Kite API credentials in `.env` file

## Quick Start

### 1. Build the Docker Image

```bash
docker build -t finsageai-assistant .
```

### 2. Run with Docker Compose (Recommended)

```bash
docker-compose up -d
```

This will:
- Build the image if not already built
- Start the container in detached mode
- Map port 15600 to your host
- Load environment variables from `.env`
- Connect to Ollama on your host machine

### 3. Access the Application

Open your browser: **http://localhost:15600**

## Alternative: Run with Docker Only

```bash
docker run -d \
  --name finsageai-assistant \
  -p 15600:15600 \
  --env-file .env \
  -e OLLAMA_URL=http://host.docker.internal:11434 \
  finsageai-assistant
```

## Environment Configuration

Ensure your `.env` file contains:

```env
PORT=15600
OLLAMA_URL=http://host.docker.internal:11434
KITE_API_KEY=your_api_key_here
KITE_API_SECRET=your_api_secret_here
MCP_REMOTE=1
```

**Note:** `host.docker.internal` allows the Docker container to access services running on your host machine (like Ollama).

## Docker Commands

### View Logs
```bash
docker-compose logs -f
# or
docker logs -f finsageai-assistant
```

### Stop the Application
```bash
docker-compose down
# or
docker stop finsageai-assistant
```

### Restart the Application
```bash
docker-compose restart
# or
docker restart finsageai-assistant
```

### Remove Everything
```bash
docker-compose down -v
docker rmi finsageai-assistant
```

## Health Check

The container includes a health check that runs every 30 seconds. Check status:

```bash
docker ps
# Look for "healthy" in the STATUS column
```

Or check manually:
```bash
curl http://localhost:15600/api/health
```

## Troubleshooting

### Cannot Connect to Ollama

**Problem:** Container can't reach Ollama on host.

**Solutions:**
- **Windows/Mac:** Use `host.docker.internal:11434` (default in docker-compose.yml)
- **Linux:** Add `--add-host=host.docker.internal:host-gateway` to docker run, or use bridge network with host IP

### Port Already in Use

```bash
# Check what's using port 15600
netstat -ano | findstr :15600  # Windows
lsof -i :15600                  # Mac/Linux

# Change port in docker-compose.yml
ports:
  - "16000:15600"  # Use different external port
```

### Access Token Not Persisting

**Problem:** Need to re-authenticate after container restart.

**Solution:** The access token is stored in memory. You'll need to login again after container restarts since tokens expire daily at 6 AM anyway.

## Production Deployment

### Using Docker Hub

1. **Tag and Push:**
```bash
docker tag finsageai-assistant yourusername/finsageai-assistant:latest
docker push yourusername/finsageai-assistant:latest
```

2. **Pull and Run on Server:**
```bash
docker pull yourusername/finsageai-assistant:latest
docker run -d \
  --name finsageai-assistant \
  -p 15600:15600 \
  --env-file .env \
  --restart unless-stopped \
  yourusername/finsageai-assistant:latest
```

### Using Docker Secrets (Production)

For sensitive data, use Docker secrets instead of `.env`:

```bash
echo "your_api_key" | docker secret create kite_api_key -
echo "your_api_secret" | docker secret create kite_api_secret -
```

Update docker-compose.yml to use secrets instead of environment variables.

## Performance Optimization

### Multi-stage Build (Optional)

For smaller images, modify Dockerfile to use multi-stage build:

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
EXPOSE 15600
CMD ["node", "server.js"]
```

### Resource Limits

Add to docker-compose.yml:

```yaml
services:
  finsageai:
    # ... existing config
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
```

## Integration with Ollama Container

If you want to run Ollama in Docker too:

```yaml
services:
  ollama:
    image: ollama/ollama:latest
    container_name: ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama-data:/root/.ollama
    networks:
      - finsageai-network
  
  finsageai:
    # ... existing config
    depends_on:
      - ollama
    environment:
      - OLLAMA_URL=http://ollama:11434

volumes:
  ollama-data:
```

Then pull your models:
```bash
docker exec -it ollama ollama pull gpt-oss:20b
```

## Support

For issues or questions:
- Check logs: `docker-compose logs -f`
- Verify Ollama is running: `curl http://localhost:11434/api/ps`
- Test health endpoint: `curl http://localhost:15600/api/health`

---

**Ready to deploy!** 🚀 Start with `docker-compose up -d` and access at http://localhost:15600
