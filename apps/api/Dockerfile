# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
# Force dev deps to be installed even if NODE_ENV=production leaks in from the host build env.
ENV NODE_ENV=development
COPY package*.json ./
RUN npm install --include=dev --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Development stage
FROM builder AS development
CMD ["npm", "run", "dev"]

# Production stage
FROM node:20-alpine AS production
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=builder /app/dist ./dist
EXPOSE 3001
CMD ["npm", "start"]
