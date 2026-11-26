FROM oven/bun:1-alpine

WORKDIR /app

RUN apk add --no-cache openssl libc6-compat

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY prisma ./prisma
RUN bunx prisma generate

COPY tsconfig.json ./
COPY src ./src

EXPOSE 3000 8080

ENV PORT=3000
ENV WS_PORT=8080
ENV HOST=0.0.0.0

CMD ["sh", "-c", "bunx prisma db push && bun run prisma/seed.ts && bun run src/index.ts"]
