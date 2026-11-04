# Red Horizon's dedicated game server (server/server.js) for Fly.io. It runs the game scripts in
# src/ headless, so it is built from the whole repository: fly deploy (from the repository root).
FROM node:22-slim
WORKDIR /app
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci --omit=dev
COPY src/ src/
COPY server/*.js server/
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["node", "server/server.js"]
