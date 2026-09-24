# Pub System API — build then run. Kept single-stage on purpose: the seed uses
# tsx (a dev dependency), so we don't prune devDeps for this demo image.
FROM node:22-alpine

WORKDIR /app

# Install deps first for better layer caching.
COPY package.json package-lock.json* ./
RUN npm install

# Prisma client needs the schema at generate time.
COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

EXPOSE 4000
CMD ["node", "dist/index.js"]
