FROM node:22-alpine
WORKDIR /app
COPY server/package.json ./server/
RUN cd server && npm install --omit=dev --no-audit --no-fund || true
COPY server ./server
COPY client ./client
ENV NODE_ENV=production DATA_DIR=/data PORT=8080 STATIC_DIR=/app/client
VOLUME ["/data"]
EXPOSE 8080
CMD ["node", "--no-warnings", "server/src/index.js"]
