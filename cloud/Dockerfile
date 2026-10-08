FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app

COPY backend/package*.json ./
RUN npm install --omit=dev

COPY backend/src ./src
COPY backend/sql ./sql
COPY frontend/public ./public

USER node
EXPOSE 8080
CMD ["node","src/server.mjs"]
