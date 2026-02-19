FROM node:20-alpine AS builder

WORKDIR /app

COPY services/rag-service/package.json ./
RUN npm install

COPY proto ./proto
COPY services/rag-service/src ./src
COPY services/rag-service/tsconfig.json ./

RUN npm run build

# ─── Runtime ──────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/proto ./proto
COPY services/rag-service/prompts ./prompts

ENV NODE_ENV=production

EXPOSE 50052

CMD ["node", "dist/main"]
