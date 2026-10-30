# Hosted build (Fly.io etc.). Source is copied BEFORE npm ci's postinstall hook
# runs, because that hook executes scripts/bundle-tesseract-assets.mjs.
FROM node:20-slim
WORKDIR /app

COPY package.json package-lock.json ./
# Skip lifecycle scripts here; the copy below makes scripts/ available.
RUN npm ci --ignore-scripts

COPY . .
RUN node scripts/bundle-tesseract-assets.mjs && npm run build

ENV NODE_ENV=production \
    HOSTED=1 \
    STORAGE_DIR=/data \
    PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
