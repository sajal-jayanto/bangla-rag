FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
  PORT=3000

# OCR: tesseract with Bangla + English models, and poppler (pdfinfo, pdftoppm) to rasterise PDFs.
RUN apk add --no-cache tesseract-ocr tesseract-ocr-data-ben tesseract-ocr-data-eng poppler-utils

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY migrations ./migrations

USER node
EXPOSE 3000

CMD ["node", "dist/server.js"]
