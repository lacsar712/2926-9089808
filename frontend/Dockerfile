FROM node:20-slim AS builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm config set registry https://registry.npmmirror.com && npm ci

COPY frontend/ ./
COPY shared/ /app/shared/
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
