# Self-steal



**Раздел:** protocols  

**Адрес:** /manual/protocols/selfsteal



Пошаговая настройка REALITY с локальным nginx, сертификатом и собственной страницей для fallback.



## Твои данные

Заполни поля в форме на сайте: их значения подставляются в примеры по всей инструкции. Примеры ниже показывают поля и подсказки.

| Переменная | Поле | Пример | Подсказка |
| --- | --- | --- | --- |
| NODE_DOMAIN | Домен ноды | node.example.com | A-запись должна указывать на публичный IPv4 сервера. Для DNS only отключи проксирование Cloudflare. |
| SITE_NAME | Название сайта | Например, Мои заметки | Короткое название для собственной страницы-заглушки. |
| LE_EMAIL | Почта сертификата | mail@example.com | Адрес для уведомлений о TLS-сертификате Let’s Encrypt. |

<details>
<summary>Как это работает</summary>

На внешнем порту 443 работает Xray с REALITY. Клиент, прошедший проверку ключа, получает VPN-соединение. Обычный HTTPS-запрос Xray перенаправляет на локальный nginx, который отдаёт твой сайт с настоящим сертификатом.

</details>

## Что происходит на порту 443

Клиент с правильными параметрами проходит проверку REALITY и подключается к VPN. Обычный запрос браузера Xray передаёт локальному nginx. Снаружи виден сайт на привычном HTTPS-порту, а сам nginx слушает только 127.0.0.1:8443.

![Схема: проверенный REALITY-клиент получает VPN, обычный HTTPS-запрос попадает в локальный nginx.](/assets/selfsteal-flow.svg)

В параметрах REALITY указывают домен назначения и разрешённые имена SNI. Обычно это один домен, сертификат которого подходит для такого имени. В этой схеме Xray перенаправляет неподходящие запросы на свой локальный nginx:8443, а nginx предъявляет сертификат Let’s Encrypt для {{NODE_DOMAIN}}.

> **Не путай адреса**  
dest — это локальный адрес nginx, например 127.0.0.1:8443. serverNames — имя домена в TLS-рукопожатии, например {{NODE_DOMAIN}}. Не указывай в dest публичный IP или домен:443, иначе запрос может вернуться в Xray и зациклиться.

## Почему простой заглушки недостаточно

Пустая страница или стандартная «Welcome to nginx!» выглядит незавершённо. Настрой собственный небольшой сайт, HTTPS, нормальную главную и страницу 404. Не копируй чужой сайт целиком: чужие ссылки и бренд быстро устареют, а полная копия может нарушать права владельца.

Проверяй доступность снаружи, а не только с самой ноды: HTTP-редирект, главная страница, случайный адрес и TLS-сертификат должны вести себя предсказуемо. Это не гарантирует незаметность или обход любых проверок — это просто корректно настроенный веб-сервер на fallback.

<details>
<summary>Подробнее: что проверить на сайте</summary>

Главная страница должна открываться по HTTPS. Несуществующий путь должен возвращать 404, HTTP — перенаправлять на HTTPS, а robots.txt и favicon могут быть частью твоего сайта. Избегай чужих брендов, чужой аналитики и внешних шрифтов. Сервер должен отдавать именно твой контент, а не пустую страницу.

</details>

## Что нужно до начала

Подготовь VPS с Ubuntu 22.04 или 24.04, доступом sudo/root и уже работающим Xray/Remnawave. Для домена создай A-запись на IPv4 сервера. Если IPv6 не настроен на VPS, не добавляй AAAA-запись. В Cloudflare поставь DNS only, чтобы сертификат и сайт выдавал непосредственно сервер.

![Требования: домен указывает на сервер, Cloudflare работает в режиме DNS only, доступны порты 80 и 443.](/assets/selfsteal-requirements.svg)

Порт 80 понадобится Certbot для проверки владения доменом по HTTP-01. Порт 443 оставь Xray. Nginx займёт только локальный адрес 127.0.0.1:8443, поэтому его нельзя будет открыть из интернета. Сначала проверь, какие процессы уже слушают эти порты.

```bash
sudo ss -ltnp | grep -E ":(80|443|8443)\b" || true
```

> **Проверь существующую установку**  
Если установщик Remnawave уже занял порт 80 или 443, не останавливай контейнеры наугад. Выясни, что именно запущено, и используй существующую схему веб-сервера либо сначала освободи порты с пониманием последствий.

## Веб-сервер и сертификат

## Установи nginx и подготовь каталог сайта

Nginx будет обслуживать HTTP-проверку Certbot на 80-м порту и сайт для fallback на локальном 8443. Установи пакеты и создай каталог для сайта. Не отключай другие активные конфигурации, пока не проверишь, что они обслуживают.

```bash
sudo apt update
sudo apt install -y nginx certbot
sudo install -d -m 0755 /var/www/selfsteal
```

На время выпуска сертификата создай HTTP-конфигурацию. Не добавляй её поверх другого сайта, который уже использует тот же домен и порт.

Открой новый конфигурационный файл в редакторе nano, вставь следующий блок, сохрани его сочетанием Ctrl+O, Enter и выйди сочетанием Ctrl+X.

```bash
sudo nano /etc/nginx/sites-available/selfsteal
```

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name {{NODE_DOMAIN}};

    root /var/www/selfsteal;
    location ^~ /.well-known/acme-challenge/ {
        default_type text/plain;
        try_files $uri =404;
    }
    location / { return 200 "Проверка домена для TLS"; }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/selfsteal /etc/nginx/sites-enabled/selfsteal
sudo nginx -t && sudo systemctl reload nginx
```

Сначала создай файл конфигурации по указанному пути, затем включи его символьной ссылкой и проверь ответ по HTTP. Если nginx сообщает об ошибке или занятом порте — остановись и исправь конфликт до запроса сертификата.

```bash
curl -I http://{{NODE_DOMAIN}}/
```

## Получи сертификат и настрой продление

Certbot положит challenge-файл в webroot, а Let’s Encrypt проверит его через публичный порт 80. Домен должен уже разрешаться в IP VPS, входящий HTTP должен быть разрешён firewall и у хостера.

```bash
sudo certbot certonly --webroot -w /var/www/selfsteal -d {{NODE_DOMAIN}} --agree-tos -m {{LE_EMAIL}} --non-interactive
```

После успешного выпуска проверь, что появились fullchain.pem и privkey.pem. Настрой deploy-hook: он выполнит nginx -t и перезагрузит nginx только после фактического обновления сертификата.

```bash
sudo install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy
sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx >/dev/null <<'HOOK'
#!/bin/sh
nginx -t && systemctl reload nginx
HOOK
sudo chmod 0750 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx
sudo certbot renew --dry-run
```

> **Проверка продления**  
Команда certbot renew --dry-run должна завершиться успешно. Не запускай certbot в режиме standalone, если nginx уже слушает 80-й порт: используй webroot, как в примере.

## Настрой nginx для постоянной работы

HTTP оставь для challenge и редиректа на HTTPS. Локальный HTTPS-сервер привяжи только к 127.0.0.1:8443 и укажи сертификат домена. Xray будет передавать ему запросы, которые не прошли проверку REALITY.

Открой /etc/nginx/sites-available/selfsteal и выбери вкладку под установленную версию nginx. Проверить её можно командой nginx -v. Замени содержимое файла целиком конфигурацией из выбранной вкладки, сохрани Ctrl+O и выйди Ctrl+X.

### nginx 1.25.1 и новее

Для новых версий включи HTTP/2 отдельной директивой http2 on;.

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name {{NODE_DOMAIN}};
    root /var/www/selfsteal;

    location ^~ /.well-known/acme-challenge/ {
        default_type text/plain;
        try_files $uri =404;
    }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 127.0.0.1:8443 ssl;
    http2 on;
    server_name {{NODE_DOMAIN}};
    root /var/www/selfsteal;
    index index.html;

    ssl_certificate /etc/letsencrypt/live/{{NODE_DOMAIN}}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/{{NODE_DOMAIN}}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    error_page 404 /404.html;
    location / { try_files $uri $uri/ =404; }
}
```

### nginx 1.24 и старше

В старом синтаксисе включи HTTP/2 параметром http2 внутри директивы listen.

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name {{NODE_DOMAIN}};
    root /var/www/selfsteal;

    location ^~ /.well-known/acme-challenge/ {
        default_type text/plain;
        try_files $uri =404;
    }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 127.0.0.1:8443 ssl http2;
    server_name {{NODE_DOMAIN}};
    root /var/www/selfsteal;
    index index.html;

    ssl_certificate /etc/letsencrypt/live/{{NODE_DOMAIN}}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/{{NODE_DOMAIN}}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    error_page 404 /404.html;
    location / { try_files $uri $uri/ =404; }
}
```

```bash
sudo nginx -v
sudo nginx -t && sudo systemctl reload nginx
sudo ss -ltnp | grep -E ":(80|443|8443)\b" || true
```

Ожидаемая схема: Xray занимает публичный 443, nginx принимает публичный 80 и локальный 127.0.0.1:8443. Проверь локальный сайт с правильными Host и SNI:

```bash
curl -fsS --resolve {{NODE_DOMAIN}}:8443:127.0.0.1 https://{{NODE_DOMAIN}}:8443/ -o /dev/null -w "HTTP %{http_code}
"
```

> **Не публикуй 8443**  
В конфигурации nginx должен стоять адрес 127.0.0.1:8443, а не 0.0.0.0:8443. Не добавляй 8443 в UFW или firewall панели VPS.

## Собственный сайт

## Выбери простой формат страницы

Подойдёт личная страница, документация или короткая визитка с внутренними ссылками. Выбери тему и наполнение, которое действительно относится к тебе. Иллюстрации ниже — авторские варианты оформления, а не копии чужих сайтов.

![Шесть авторских макетов: личные заметки, домашняя кофейня, веб-студия, планер, документация и фотодневник.](/assets/selfsteal-sites.svg)

## Создай страницу и страницу 404

Собери небольшой статический сайт без сторонних скриптов и внешних ресурсов. Пример создаёт главную и понятную страницу ошибки; замени тексты на собственные.

```bash
sudo tee /var/www/selfsteal/index.html >/dev/null <<'HTML'
<!doctype html>
<html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{{SITE_NAME}}</title>
<style>body{max-width:760px;margin:12vh auto;padding:24px;font:18px/1.7 system-ui;color:#20332d;background:#f4f7f4}h1{font-size:clamp(2rem,7vw,4rem)}a{color:#19765d}</style>
<h1>{{SITE_NAME}}</h1><p>Личная страница о проектах, заметках и полезных материалах.</p>
<p><a href="/about.html">О проекте</a></p></html>
HTML
sudo tee /var/www/selfsteal/about.html >/dev/null <<'HTML'
<!doctype html><html lang="ru"><meta charset="utf-8"><title>О проекте</title>
<h1>О проекте</h1><p>Здесь можно рассказать о сайте и его авторе.</p><a href="/">На главную</a></html>
HTML
sudo tee /var/www/selfsteal/404.html >/dev/null <<'HTML'
<!doctype html><html lang="ru"><meta charset="utf-8"><title>Страница не найдена</title>
<h1>404</h1><p>Такой страницы нет.</p><a href="/">Вернуться на главную</a></html>
HTML
sudo chmod -R a=rX,u+w /var/www/selfsteal
```

Если меняешь каталог, он должен совпадать с root в обеих nginx-конфигурациях. После создания файлов повтори nginx -t и проверь главную и случайный адрес.

```bash
curl -fsS --resolve {{NODE_DOMAIN}}:8443:127.0.0.1 https://{{NODE_DOMAIN}}:8443/ | head -n 5
curl -sS -o /dev/null -w "HTTP %{http_code}
" --resolve {{NODE_DOMAIN}}:8443:127.0.0.1 https://{{NODE_DOMAIN}}:8443/no-such-page
```

> **Ожидаемый ответ**  
Главная должна вернуть 200, несуществующая страница — 404. Если видишь стандартную страницу nginx, проверь root и содержимое index.html.

## Подключи REALITY

## Проверь доступность Xray

Сначала убедись, что Xray уже слушает публичный порт 443. Если порт занят другим веб-сервером, не перезапускай службы вслепую — найди конфликт и выбери одну схему владения портом.

```bash
sudo ss -ltnp | grep ":443" || true
sudo systemctl status nginx --no-pager
```

## Добавь inbound в Remnawave

В Config Profile добавь inbound VLESS с REALITY. Порт оставь 443. Сгенерируй privateKey и shortId средствами панели и используй именно эти значения. В поле назначения укажи локальный nginx:8443, а serverNames — имя, которое подходит для сертификата и сайта.

```json
{
  "tag": "VLESS_SELFSTEAL",
  "port": 443,
  "protocol": "vless",
  "settings": { "clients": [], "decryption": "none" },
  "streamSettings": {
    "network": "tcp",
    "security": "reality",
    "realitySettings": {
      "show": false,
      "dest": "127.0.0.1:8443",
      "xver": 0,
      "serverNames": ["{{NODE_DOMAIN}}"],
      "privateKey": "СГЕНЕРИРУЙ_В_ПАНЕЛИ",
      "shortIds": ["СГЕНЕРИРУЙ_В_ПАНЕЛИ"]
    }
  },
  "sniffing": {
    "enabled": true,
    "destOverride": ["http", "tls", "quic"]
  }
}
```

> **Сверь структуру профиля**  
Фрагмент показывает важные поля inbound, но конкретный Config Profile может требовать собственную структуру JSON и запятые вокруг блока. Не заменяй весь профиль целиком: добавь inbound по схеме своей версии панели и проверь конфигурацию перед применением.

## Создай клиентскую конфигурацию

Создай пользователя в панели и выпусти ссылку/QR-код. В клиенте должны совпадать UUID, публичный ключ, shortId и flow, если он включён на сервере. В качестве адреса используй IP ноды или домен, порт 443, а SNI/serverName — {{NODE_DOMAIN}}. Fingerprint выбери из поддерживаемых клиентом, например chrome.

Открой сайт по домену обычным браузером. Это проверит веб-fallback и сертификат. Отдельно проверь VPN-клиент: успешный ответ сайта не доказывает, что inbound получил актуальный профиль и доступен клиенту.

## DNS через свой резолвер

<details>
<summary>Если у клиента не разрешаются сайты</summary>

Этот раздел необязателен. Сначала проверь, что проблема действительно в DNS: VPN подключён, но доменные имена не разрешаются. Если IP открывается, а имя — нет, настрой резолвер в клиентском/серверном профиле согласно документации используемой версии Xray.

</details>

## Пойми, где возникла DNS-ошибка

Если туннель поднялся, но домены не открываются, проверь DNS отдельно. Сбой может быть связан с резолвером провайдера, правилами маршрутизации или недоступностью сайта — смена DNS помогает только в первом случае.

## Добавь доверенный DNS в профиль

Настрой резолвер в основном разделе dns именно того Xray-конфига, который реально использует нода. Не создавай дополнительный outbound и routing-правила без необходимости. Перед сохранением проверь JSON и сравни синтаксис со схемой своей версии Xray/Remnawave.

```json
"dns": {
  "servers": ["1.1.1.1", "9.9.9.9"],
  "queryStrategy": "UseIPv4"
}
```

> **Не заменяй профиль целиком**  
Если конфигурация уже содержит секцию dns, аккуратно отредактируй её. В JSON между соседними секциями нужна запятая; продублированные ключи могут привести к неожиданному поведению.

## Проверь разрешение доменного имени

Сравни результат до и после настройки. Установи dig, если утилиты нет. Команда ниже проверяет ответ выбранного публичного DNS с самой ноды; для проверки поведения клиентов дополнительно открой несколько сайтов через VPN.

```bash
sudo apt install -y dnsutils
dig @1.1.1.1 youtube.com +short
getent ahosts youtube.com | head
```

> **Что считать успехом**  
Резолвер возвращает один или несколько IP-адресов, а подключённый через VPN клиент открывает домен. Это подтверждает DNS-ответ, но не гарантирует скорость или доступность конкретного сервиса.

## Проверь результат снаружи

<details>
<summary>Проверка внешним запросом</summary>

Проверки выполняй с домашнего компьютера или другой машины, а не только с VPS. Так ты увидишь тот же маршрут, что и внешний браузер.

</details>

## Убедись, что на 443 слушает Xray

На самой ноде проверь владельца 443 и отдельно локальный адрес nginx. Внешний 8443 открывать не нужно: nginx должен слушать только 127.0.0.1:8443.

```bash
sudo ss -ltnp | grep -E ":(443|8443)\b" || true
```

> **Ожидаемая схема**  
Xray принимает подключения на публичном 443, nginx обслуживает fallback на 127.0.0.1:8443. Если nginx слушает 0.0.0.0:8443, исправь bind-адрес и закрой внешний порт.

## Проверь сайт как внешний посетитель

С компьютера вне VPS проверь HTTPS, редирект с HTTP и страницу 404. TLS должен быть выдан для {{NODE_DOMAIN}}. На порту 8443 снаружи соединения быть не должно. Если установлен netcat, проверь 8443 с внешнего компьютера: соединение должно быть отклонено или завершиться тайм-аутом.

```bash
curl -sSI https://{{NODE_DOMAIN}}/ | head -n 5
curl -sSI http://{{NODE_DOMAIN}}/ | head -n 5
curl -sS -o /dev/null -w "404 check: %{http_code}
" https://{{NODE_DOMAIN}}/no-such-page
```

```bash
nc -vz {{NODE_DOMAIN}} 8443
```

> **Готово**  
Если сайт открывается по HTTPS с правильным сертификатом, HTTP перенаправляется, неизвестная страница возвращает 404, а клиент подключается через VLESS/REALITY — основная связка работает. Если что-то не совпало, сверяй домен, SNI, dest, сертификат и фактический listener 443 по очереди.
