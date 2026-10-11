FROM node:lts-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN env -u GIT_CONFIG_COUNT -u GIT_CONFIG_KEY_0 -u GIT_CONFIG_VALUE_0 git config --global url."https://github.com/".insteadOf "ssh://git@github.com/" && env -u GIT_CONFIG_COUNT -u GIT_CONFIG_KEY_0 -u GIT_CONFIG_VALUE_0 npm install --legacy-peer-deps

COPY . .

CMD ["npm", "start"]
