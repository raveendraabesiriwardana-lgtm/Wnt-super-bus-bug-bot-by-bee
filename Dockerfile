FROM node:18-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./

RUN npm config set registry https://registry.npmjs.org/
RUN npm install --legacy-peer-deps

COPY . .

CMD ["node", "index.js"]
