FROM node:18-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*

# SSH වෙනුවට HTTPS පාවිච්චි කරන්න git වලට කියනවා (මේකෙන් npm install error එක හදාගන්න පුලුවන්)
RUN git config --global url."https://github.com/".insteadOf "ssh://git@github.com/" \
 && git config --global --add url."https://github.com/".insteadOf "git+ssh://git@github.com/" \
 && git config --global --add url."https://github.com/".insteadOf "git@github.com:" \
 && git config --global --add url."https://github.com/".insteadOf "git://github.com/"

COPY package.json ./

RUN npm install --legacy-peer-deps

COPY . .

CMD ["node", "index.js"]
