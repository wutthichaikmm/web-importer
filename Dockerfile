FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js scraper.js ./
COPY public ./public

USER node
EXPOSE 8787
CMD ["node", "--input-type=module", "-e", "import { createApp } from './server.js'; const port = Number(process.env.PORT || 8787); createApp().listen(port, '0.0.0.0', () => console.log('Web Importer listening on port ' + port));"]
