FROM node@sha256:968df39aedcea65eeb078fb336ed7191baf48f972b4479711397108be0966920 AS builder
WORKDIR /usr/src/app

# La API comparte el origen de cada subdominio del tenant a traves de Kong.
# Solo un despliegue con gateway separado debe fijar una URL explicita.
ARG VITE_API_BASE_URL=
ARG VITE_TENANT_BASE_DOMAIN=restoapp.pe

COPY package.json package-lock.json nx.json tsconfig.base.json ./
COPY apps/pwa-cliente/package.json ./apps/pwa-cliente/package.json

RUN npm install --ignore-scripts

COPY libs/ ./libs/
COPY apps/pwa-cliente ./apps/pwa-cliente
# Vite hornea import.meta.env.VITE_* desde .env.production (root = apps/pwa-cliente).
# Lo reescribimos con la URL del gateway de este entorno antes de compilar.
RUN printf 'VITE_API_BASE_URL=%s\nVITE_WS_PATH=/notificaciones/socket.io\nVITE_TENANT_BASE_DOMAIN=%s\n' "$VITE_API_BASE_URL" "$VITE_TENANT_BASE_DOMAIN" > apps/pwa-cliente/.env.production
RUN cd apps/pwa-cliente && npx vite build

FROM nginxinc/nginx-unprivileged@sha256:0c79d56aee561a1d81c63f00eee5fb5fe29279560cdc55e91425133104c7fbe6
COPY --from=builder /usr/src/app/apps/pwa-cliente/dist /usr/share/nginx/html
COPY apps/pwa-cliente/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
