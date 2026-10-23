FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*

RUN git config --global url."https://github.com/".insteadOf "ssh://git@github.com/" \
 && git config --global --add url."https://github.com/".insteadOf "git+ssh://git@github.com/" \
 && git config --global --add url."https://github.com/".insteadOf "git@github.com:" \
 && git config --global --add url."https://github.com/".insteadOf "git://github.com/"

COPY package.json ./

RUN npm install --legacy-peer-deps

COPY . .

CMD ["node", "index.js"]
