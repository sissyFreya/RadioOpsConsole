# Build
FROM node:20-alpine AS build
WORKDIR /app

ARG VITE_API_BASE
ARG VITE_AGENT_WS_BASE
ENV VITE_API_BASE=${VITE_API_BASE}
ENV VITE_AGENT_WS_BASE=${VITE_AGENT_WS_BASE}

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN printf "VITE_API_BASE=%s\nVITE_AGENT_WS_BASE=%s\n" "$VITE_API_BASE" "$VITE_AGENT_WS_BASE" > .env.production
RUN npm run build

# Serve
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
