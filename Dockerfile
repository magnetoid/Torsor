# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# Empty by default so the SPA's absolute /api/v1/... paths hit the same origin
# (nginx proxies them to the control plane). api.ts concatenates API_URL + path,
# so a non-empty value here must NOT include /api or requests become /api/api/v1.
# Override only for a cross-origin API (e.g. VITE_API_URL=https://api.example.com).
ARG VITE_API_URL=
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

FROM builder AS development
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

FROM nginx:1.27-alpine AS production
RUN apk add --no-cache wget tini \
    && rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["nginx", "-g", "daemon off;"]
