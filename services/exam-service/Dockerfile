FROM node:20-alpine AS builder

WORKDIR /app

COPY services/exam-service/package.json ./
RUN npm install

COPY proto ./proto
COPY services/exam-service/src ./src
COPY services/exam-service/tsconfig.json ./

RUN npm run build

# ─── Runtime ──────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

COPY --from=builder /app/dist         ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/proto        ./proto

ENV NODE_ENV=production

EXPOSE 50054

CMD ["node", "dist/main"]
