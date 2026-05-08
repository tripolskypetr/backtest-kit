FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache curl

COPY scripts/install.mjs .
COPY package.json .

RUN node ./install.mjs

COPY scripts/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
