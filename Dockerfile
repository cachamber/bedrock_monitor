FROM node:18-alpine

RUN apk add --no-cache su-exec

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["/entrypoint.sh"]
CMD ["npm", "run", "server"]