FROM nginx:stable-alpine

ARG NGX_FILE=nginx.conf
ADD deployments/nginx/${NGX_FILE} /etc/nginx/conf.d/default.conf
COPY dist /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
