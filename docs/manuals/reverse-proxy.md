# Reverse proxy для Remnawave



**Раздел:** remnawave  

**Адрес:** /manual/remnawave/reverse-proxy



Выберите один вариант публикации панели: Caddy с автоматическим TLS или Nginx с acme.sh.



## Твои данные

Заполни поля в форме на сайте: их значения подставляются в примеры по всей инструкции. Примеры ниже показывают поля и подсказки.

| Переменная | Поле | Пример | Подсказка |
| --- | --- | --- | --- |
| PANEL_DOMAIN | Домен панели | panel.example.com | Используется в DNS, TLS и конфигурации прокси. |
| LE_EMAIL | Почта сертификата | mail@example.com | Адрес уведомлений acme.sh. |
| PANEL_DIR | Каталог Panel | /opt/remnawave | Каталог установки панели на сервере. |

Reverse proxy принимает запросы по домену и передаёт их панели внутри Docker-сети. Сначала установи панель по [Мануалу 1](/manual/remnawave/panel-install), затем выбери **один** вариант ниже. Не запускай Nginx и Caddy одновременно на портах `80` и `443`.

## Перед настройкой

• Создай DNS-запись домена панели, например `{{PANEL_DOMAIN}}`, на публичный IP сервера.

• Проверь, что DNS уже указывает на нужный сервер.

• Разреши входящие соединения на `80` и `443` в firewall сервера и панели хостинга.

• Примеры ниже подключают прокси к панели по имени `remnawave:3000` во внешней Docker-сети `remnawave-network`, созданной compose-файлом Remnawave.

## Вариант A. Caddy с автоматическим TLS

Caddy сам получает и продлевает публичный TLS-сертификат. DNS должен указывать на сервер, а порты `80` и `443` должны быть доступны извне.

**1. Создать Caddyfile**

```bash
sudo mkdir -p {{PANEL_DIR}}/caddy
cd {{PANEL_DIR}}/caddy
sudo nano Caddyfile
```

Вставь конфигурацию, заменив `{{PANEL_DOMAIN}}` на свой домен:

```caddyfile
https://{{PANEL_DOMAIN}} {
    encode
    reverse_proxy * http://remnawave:3000
}

:443 {
    tls internal
    respond 204
}
```

**2. Создать compose-файл Caddy**

```bash
sudo nano {{PANEL_DIR}}/caddy/docker-compose.yml
```

```yaml
services:
  caddy:
    image: caddy:2.9
    container_name: caddy
    hostname: caddy
    restart: always
    ports:
      - '0.0.0.0:443:443'
      - '0.0.0.0:80:80'
    networks:
      - remnawave-network
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy-ssl-data:/data

networks:
  remnawave-network:
    name: remnawave-network
    driver: bridge
    external: true

volumes:
  caddy-ssl-data:
    driver: local
    name: caddy-ssl-data
```

**3. Запустить и проверить**

```bash
cd {{PANEL_DIR}}/caddy
sudo docker compose up -d
sudo docker compose logs -f -t
```

Открой `https://{{PANEL_DOMAIN}}`. Должна появиться страница входа Remnawave.

## Вариант B. Nginx и сертификат acme.sh

В этом варианте сертификат выпускается через `acme.sh` в standalone-режиме. Для выпуска и последующего продления должен быть доступен и свободен порт `8443`. Официальное руководство Remnawave предупреждает, что ZeroSSL не поддерживает зоны `.ru`, `.su` и `.рф` в описанном способе выпуска.

**1. Установить зависимости и acme.sh**

```bash
sudo apt-get update
sudo apt-get install -y cron socat
curl https://get.acme.sh | sh -s email={{LE_EMAIL}}
source ~/.bashrc
sudo mkdir -p {{PANEL_DIR}}/nginx
sudo chown "$USER":"$USER" {{PANEL_DIR}}/nginx
cd {{PANEL_DIR}}/nginx
```

Замени `EMAIL` на действующий адрес и `{{PANEL_DOMAIN}}` на домен панели:

```bash
acme.sh --issue --standalone -d '{{PANEL_DOMAIN}}' \
  --key-file {{PANEL_DIR}}/nginx/privkey.key \
  --fullchain-file {{PANEL_DIR}}/nginx/fullchain.pem \
  --alpn --tlsport 8443 \
  --reloadcmd "docker exec remnawave-nginx nginx -s reload"

acme.sh --install-cert -d '{{PANEL_DOMAIN}}' \
  --key-file {{PANEL_DIR}}/nginx/privkey.key \
  --fullchain-file {{PANEL_DIR}}/nginx/fullchain.pem \
  --reloadcmd "docker exec remnawave-nginx nginx -s reload"
```

**2. Создать конфигурацию Nginx**

```bash
sudo nano {{PANEL_DIR}}/nginx/nginx.conf
```

```nginx
upstream remnawave {
    server remnawave:3000;
}

map $http_upgrade $connection_upgrade {
    default upgrade;
    "" close;
}

server {
    server_name {{PANEL_DOMAIN}};
    listen 443 ssl reuseport;
    listen [::]:443 ssl reuseport;
    http2 on;

    location / {
        proxy_http_version 1.1;
        proxy_pass http://remnawave;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
    }

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_timeout 1d;
    ssl_session_cache shared:MozSSL:10m;
    ssl_session_tickets off;
    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.key;
    ssl_trusted_certificate /etc/nginx/ssl/fullchain.pem;
}

server {
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    server_name _;
    ssl_reject_handshake on;
}
```

**3. Создать compose-файл Nginx**

```bash
sudo nano {{PANEL_DIR}}/nginx/docker-compose.yml
```

```yaml
services:
  remnawave-nginx:
    image: nginx:1.30
    container_name: remnawave-nginx
    hostname: remnawave-nginx
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ./fullchain.pem:/etc/nginx/ssl/fullchain.pem:ro
      - ./privkey.key:/etc/nginx/ssl/privkey.key:ro
    restart: always
    ports:
      - '0.0.0.0:443:443'
    networks:
      - remnawave-network

networks:
  remnawave-network:
    name: remnawave-network
    driver: bridge
    external: true
```

**4. Запустить и проверить Nginx**

```bash
cd {{PANEL_DIR}}/nginx
sudo docker compose up -d
sudo docker exec remnawave-nginx nginx -t
sudo docker compose logs -f -t
```

Открой `https://{{PANEL_DOMAIN}}`. При изменениях конфигурации проверяй её через `docker exec remnawave-nginx nginx -t` перед перезапуском.

## Проверка результата

• Панель открывается по домену через HTTPS и показывает страницу входа.

• Сертификат выдан на правильное доменное имя и действителен.

• Служебные порты контейнеров панели не опубликованы напрямую в интернет.

• Для варианта Nginx порт `8443` доступен для выпуска и автоматического продления сертификата.

Remnawave не следует публиковать из подкаталога вида `/remnawave`. Используй корень домена или отдельный поддомен.

## Официальные материалы

• [Обзор reverse proxy](https://docs.rw/install/reverse-proxies/)

• [Reverse proxy на Caddy](https://docs.rw/install/reverse-proxies/caddy/)

• [Reverse proxy на Nginx](https://docs.rw/install/reverse-proxies/nginx/)

• [Установка Remnawave Panel](https://docs.rw/install/remnawave-panel/)
