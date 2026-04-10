# Optional / later: containerized deploy. Preferred path for this repo is nginx + static dist/
# (see deploy/nginx-kalyan-auth.conf). Vite bakes VITE_* at build — pass build-args (or compose).
# Example:
#   docker build -t kalyan-auth \
#     --build-arg VITE_FRAPPE_BASE_URL=https://erp.example.com \
#     --build-arg VITE_KEYCLOAK_URL=https://sso.example.com \
#     --build-arg VITE_KEYCLOAK_REALM=my-realm \
#     --build-arg VITE_KEYCLOAK_CLIENT_ID=my-client \
#     .

FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Defaults are empty; override at build time for a real deployment.
ARG VITE_FRAPPE_URL=
ARG VITE_FRAPPE_BASE_URL=
ARG VITE_FRAPPE_LOGIN_URL=
ARG VITE_FRAPPE_ENABLE_SOCKET=
ARG VITE_SOCKET_PORT=
ARG VITE_SITE_NAME=
ARG VITE_KEYCLOAK_URL=
ARG VITE_KEYCLOAK_REALM=
ARG VITE_KEYCLOAK_CLIENT_ID=
ARG VITE_KEYCLOAK_REDIRECT_URI=
ARG VITE_KEYCLOAK_POST_LOGOUT_REDIRECT_URI=
ARG VITE_APP_HR_URL=
ARG VITE_APP_WAREHOUSE_URL=
ARG VITE_APP_SALES_URL=
ARG VITE_APP_FINANCE_URL=

ENV VITE_FRAPPE_URL=$VITE_FRAPPE_URL \
    VITE_FRAPPE_BASE_URL=$VITE_FRAPPE_BASE_URL \
    VITE_FRAPPE_LOGIN_URL=$VITE_FRAPPE_LOGIN_URL \
    VITE_FRAPPE_ENABLE_SOCKET=$VITE_FRAPPE_ENABLE_SOCKET \
    VITE_SOCKET_PORT=$VITE_SOCKET_PORT \
    VITE_SITE_NAME=$VITE_SITE_NAME \
    VITE_KEYCLOAK_URL=$VITE_KEYCLOAK_URL \
    VITE_KEYCLOAK_REALM=$VITE_KEYCLOAK_REALM \
    VITE_KEYCLOAK_CLIENT_ID=$VITE_KEYCLOAK_CLIENT_ID \
    VITE_KEYCLOAK_REDIRECT_URI=$VITE_KEYCLOAK_REDIRECT_URI \
    VITE_KEYCLOAK_POST_LOGOUT_REDIRECT_URI=$VITE_KEYCLOAK_POST_LOGOUT_REDIRECT_URI \
    VITE_APP_HR_URL=$VITE_APP_HR_URL \
    VITE_APP_WAREHOUSE_URL=$VITE_APP_WAREHOUSE_URL \
    VITE_APP_SALES_URL=$VITE_APP_SALES_URL \
    VITE_APP_FINANCE_URL=$VITE_APP_FINANCE_URL

RUN npm run build

FROM nginx:alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
