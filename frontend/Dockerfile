FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# The client is served on 5173, the port the backend's origin allow-list expects.
RUN sed -i 's/listen\s*80;/listen 5173;/; s/listen\s*\[::\]:80;/listen [::]:5173;/' /etc/nginx/conf.d/default.conf
EXPOSE 5173
