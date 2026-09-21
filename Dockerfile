FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY public ./public

EXPOSE 8080

CMD ["npm", "start"]
