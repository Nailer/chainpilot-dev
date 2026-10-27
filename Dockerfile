FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY scripts/worker.js scripts/start-service.js ./scripts/
COPY public ./public
RUN mkdir /app/data && chown -R node:node /app
USER node
ENV HOST=0.0.0.0 PORT=3001 DATA_DIR=/app/data
EXPOSE 3001
CMD ["node", "scripts/start-service.js"]
