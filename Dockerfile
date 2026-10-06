FROM node:20-alpine

# git install කරනවා
RUN apk add --no-cache git

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

CMD ["npm", "start"]
