FROM node:20-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN mkdir -p /app/uploads/videos

EXPOSE 3070

USER node

CMD ["npm", "start"]
