FROM node:20-slim

WORKDIR /app

COPY backend/package*.json ./
RUN npm config set registry https://registry.npmmirror.com && npm install --production

COPY backend/ ./
COPY shared/ /shared/

EXPOSE 3001

CMD ["node", "src/app.js"]
