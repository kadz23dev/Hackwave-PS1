# Production Dockerfile for KaizenAI / HealTest
# Includes Node.js 22, SQLite C++ bindings, and Playwright Chromium headless engine
FROM node:22-bookworm-slim

# Install OS dependencies for native build tools and Playwright browser execution
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install npm dependencies
RUN npm ci

# Install Playwright Chromium headless browser binaries
RUN npx playwright install --with-deps chromium

# Copy codebase
COPY . .

# Build backend TypeScript and Vite React client
RUN npm run build

# Expose web service port
EXPOSE 4300

# Production environment variables
ENV NODE_ENV=production
ENV PORT=4300
ENV HOST=0.0.0.0

# Start unified API server & React Dashboard
CMD ["npm", "run", "serve"]
