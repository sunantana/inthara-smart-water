# ==========================================
# Inthara Smart Water ERP - Production Dockerfile
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3080

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY . .

# Ensure data directory exists with write permissions
RUN mkdir -p /app/data && chmod -R 777 /app/data

EXPOSE 3080

CMD ["node", "server.js"]
