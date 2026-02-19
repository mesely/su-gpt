FROM node:20-alpine AS builder

WORKDIR /app

# Bağımlılıkları önce kur (cache optimizasyonu)
COPY services/course-service/package.json ./
RUN npm install

# Proto dosyaları (root context'ten gelir)
COPY proto ./proto

# Servis kaynak kodunu kopyala
COPY services/course-service/src ./src
COPY services/course-service/tsconfig.json ./

RUN npm run build

# ─── Runtime ──────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/proto ./proto
COPY services/course-service/data ./data

ENV NODE_ENV=production

EXPOSE 50051

CMD ["node", "dist/main"]
