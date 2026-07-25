FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p logs

EXPOSE 5000

CMD ["node", "server.js"]
