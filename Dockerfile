FROM node:20

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y python3 make g++ sqlite3 --no-install-recommends && rm -rf /var/lib/apt/lists/*

# Copy backend package files
COPY package*.json ./
RUN npm ci --only=production

# Copy and build frontend
COPY frontend/package*.json ./frontend/
WORKDIR /app/frontend
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Back to app root
WORKDIR /app

# Copy backend source
COPY src/ ./src/
COPY config/ ./config/

# Create data directory
RUN mkdir -p data

# Expose ports
EXPOSE 3000 3001

# Run migrations and start server
CMD ["sh", "-c", "node src/db/migrate.js && node src/utils/seed-sources.js && node src/server.js"]