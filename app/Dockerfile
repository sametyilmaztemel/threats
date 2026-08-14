FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# pdfkit AFM fonts for PDF report export (Next standalone tracing misses these)
COPY --from=builder /app/node_modules/pdfkit/js/data ./.next/server/app/reports/export/data
EXPOSE 3000
CMD ["node", "server.js"]
