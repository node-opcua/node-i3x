FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
COPY packages/core/package.json packages/core/
COPY packages/opcua-connector/package.json packages/opcua-connector/
COPY packages/rest-server/package.json packages/rest-server/
COPY packages/app/package.json packages/app/
RUN npm install --ignore-scripts
COPY . .

FROM node:20-slim
WORKDIR /app
COPY --from=builder /app .
EXPOSE 8000
CMD ["npm", "run", "start"]
