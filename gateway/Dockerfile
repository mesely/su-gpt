FROM node:20-alpine AS builder

WORKDIR /app

COPY gateway/package.json ./
RUN npm install

# Proto dosyaları
COPY proto ./proto

# Kaynak kodu
COPY gateway/src ./src
COPY gateway/tsconfig.json ./

RUN npm run build

# ─── Runtime ──────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/proto ./proto

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/main"]
