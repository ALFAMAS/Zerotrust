export function dockerComposeTemplate(projectName: string): string {
  const safe = projectName.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return `version: "3.9"

name: ${safe}

services:
  mongodb:
    image: mongo:7.0
    container_name: ${safe}-mongodb
    restart: unless-stopped
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: password
      MONGO_INITDB_DATABASE: zeroauth
    volumes:
      - mongodb_data:/data/db
    ports:
      - "27017:27017"
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7.2-alpine
    container_name: ${safe}-redis
    restart: unless-stopped
    command: redis-server --requirepass redispass --appendonly yes
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "redispass", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.13.4
    container_name: ${safe}-elasticsearch
    restart: unless-stopped
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
      - ES_JAVA_OPTS=-Xms512m -Xmx512m
    volumes:
      - elasticsearch_data:/usr/share/elasticsearch/data
    ports:
      - "9200:9200"
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:9200/_cluster/health | grep -q '\"status\":\"green\"\\|\"status\":\"yellow\"'"]
      interval: 20s
      timeout: 10s
      retries: 10

  kibana:
    image: docker.elastic.co/kibana/kibana:8.13.4
    container_name: ${safe}-kibana
    restart: unless-stopped
    environment:
      - ELASTICSEARCH_HOSTS=http://elasticsearch:9200
      - XPACK_SECURITY_ENABLED=false
    ports:
      - "5601:5601"
    depends_on:
      elasticsearch:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:5601/api/status | grep -q 'available'"]
      interval: 30s
      timeout: 10s
      retries: 10

  zeroauth:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: ${safe}-api
    restart: unless-stopped
    env_file: .env
    environment:
      - MONGO_URI=mongodb://admin:password@mongodb:27017/zeroauth?authSource=admin
      - REDIS_URI=redis://:redispass@redis:6379
      - ELASTICSEARCH_HOST=elasticsearch
      - ELASTICSEARCH_PORT=9200
      - ELASTICSEARCH_ENABLED=true
    ports:
      - "\${PORT:-3000}:3000"
    depends_on:
      mongodb:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:3000/healthz | grep -q 'ok'"]
      interval: 15s
      timeout: 5s
      retries: 5

volumes:
  mongodb_data:
  redis_data:
  elasticsearch_data:
`;
}
