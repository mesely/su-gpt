FROM node:20-alpine AS builder

WORKDIR /app

COPY services/instructor-service/package.json ./
RUN npm install

COPY proto ./proto
COPY services/instructor-service/src ./src
COPY services/instructor-service/tsconfig.json ./

RUN npm run build

# ─── Runtime ──────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

COPY --from=builder /app/dist         ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/proto        ./proto

ENV NODE_ENV=production

EXPOSE 50053

CMD ["node", "dist/main"]
