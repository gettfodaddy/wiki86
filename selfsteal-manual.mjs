const blocks = [];
let sequence = 0;
const add = (type, fields = {}) => blocks.push({ id: 'selfsteal-v2-' + (++sequence), type, ...fields });
const text = (value) => add('text', { text: value });
const step = (number, title, value) => add('step', { number: String(number), title, text: value });
const code = (language, value) => add('code', { language, code: value });
const note = (variant, title, value) => add('note', { variant, title, text: value });
const heading = (title, level = '2') => add('heading', { title, level });
const image = (src, alt) => add('image', { src, alt });

add('data', {
  fields: [
    { key: 'NODE_DOMAIN', label: 'Домен ноды', placeholder: 'node.example.com', help: 'A-запись должна указывать на публичный IPv4 сервера. Для DNS only отключи проксирование Cloudflare.' },
    { key: 'SNI', label: 'SNI / server name', placeholder: 'microsoft.com', help: 'Для Self-steal обязательно замени на NODE_DOMAIN: локальный nginx предъявляет сертификат именно этого домена.' },
    { key: 'SITE_NAME', label: 'Название сайта', placeholder: 'Например, Мои заметки', help: 'Короткое название для собственной страницы-заглушки.' },
    { key: 'LE_EMAIL', label: 'Почта сертификата', placeholder: 'mail@example.com', help: 'Адрес для уведомлений о TLS-сертификате Let’s Encrypt.' }
  ]
});
add('accordion', {
  number: '1', icon: 'list', collapsible: true, title: 'Как это работает',
  text: 'На внешнем порту 443 работает Xray с REALITY. Клиент, прошедший проверку ключа, получает VPN-соединение. Обычный HTTPS-запрос Xray перенаправляет на локальный nginx, который отдаёт твой сайт с настоящим сертификатом.'
});
step('1', 'Что происходит на порту 443', 'Клиент с правильными параметрами проходит проверку REALITY и подключается к VPN. Обычный запрос браузера Xray передаёт локальному nginx. Снаружи виден сайт на привычном HTTPS-порту, а сам nginx слушает только 127.0.0.1:8443.');
image('/assets/selfsteal-flow.svg', 'Схема: проверенный REALITY-клиент получает VPN, обычный HTTPS-запрос попадает в локальный nginx.');
text('В параметрах REALITY указывают домен назначения и разрешённые имена SNI. Для этой схемы SNI из «Твои данные» должен совпадать с доменом сертификата nginx; замени пример microsoft.com на {{NODE_DOMAIN}}. В этой схеме Xray перенаправляет неподходящие запросы на свой локальный nginx:8443, а nginx предъявляет сертификат Let’s Encrypt для {{NODE_DOMAIN}}.');
note('info', 'Не путай адреса', 'dest — это локальный адрес nginx, например 127.0.0.1:8443. serverNames/SNI — имя домена в TLS-рукопожатии, например {{SNI}}; для Self-steal оно должно совпадать с {{NODE_DOMAIN}} и сертификатом nginx. Не указывай в dest публичный IP или домен:443, иначе запрос может вернуться в Xray и зациклиться.');

step('2', 'Почему простой заглушки недостаточно', 'Пустая страница или стандартная «Welcome to nginx!» выглядит незавершённо. Настрой собственный небольшой сайт, HTTPS, нормальную главную и страницу 404. Не копируй чужой сайт целиком: чужие ссылки и бренд быстро устареют, а полная копия может нарушать права владельца.');
text('Проверяй доступность снаружи, а не только с самой ноды: HTTP-редирект, главная страница, случайный адрес и TLS-сертификат должны вести себя предсказуемо. Это не гарантирует незаметность или обход любых проверок — это просто корректно настроенный веб-сервер на fallback.');
add('accordion', { number: '2', icon: 'spark', collapsible: true, title: 'Подробнее: что проверить на сайте', text: 'Главная страница должна открываться по HTTPS. Несуществующий путь должен возвращать 404, HTTP — перенаправлять на HTTPS, а robots.txt и favicon могут быть частью твоего сайта. Избегай чужих брендов, чужой аналитики и внешних шрифтов. Сервер должен отдавать именно твой контент, а не пустую страницу.' });

step('3', 'Что нужно до начала', 'Подготовь VPS с Ubuntu 22.04 или 24.04, доступом sudo/root и уже работающим Xray/Remnawave. Для домена создай A-запись на IPv4 сервера. Если IPv6 не настроен на VPS, не добавляй AAAA-запись. В Cloudflare поставь DNS only, чтобы сертификат и сайт выдавал непосредственно сервер.');
image('/assets/selfsteal-requirements.svg', 'Требования: домен указывает на сервер, Cloudflare работает в режиме DNS only, доступны порты 80 и 443.');
text('Порт 80/TCP понадобится Certbot для проверки владения доменом по HTTP-01. Порт 443/TCP оставь Xray. Nginx займёт только локальный адрес 127.0.0.1:8443, поэтому его нельзя открывать из интернета. Сначала проверь, какие процессы уже слушают эти порты.');
code('bash', 'sudo ss -lntup | grep -E ":(80|443|8443)\\b" || true\nsudo ufw status verbose\n# Если UFW уже активен, добавь правила:\nsudo ufw allow 80/tcp\nsudo ufw allow 443/tcp');
note('warning', 'Проверь оба firewall', 'Правила выше относятся к UFW на Ubuntu; если команда отсутствует, установи `sudo apt update && sudo apt install -y ufw`. В панели VPS/VPC тоже разреши входящий TCP 80 и 443. Не открывай 8443: nginx слушает только 127.0.0.1. Если UFW выключен, не включай его, пока не разрешишь используемый SSH-порт; Node API оставь доступным только с IP Panel.');
code('bash', 'sudo ss -ltnp | grep -E ":(80|443|8443)\\b" || true');
note('warning', 'Проверь существующую установку', 'Если установщик Remnawave уже занял порт 80 или 443, не останавливай контейнеры наугад. Выясни, что именно запущено, и используй существующую схему веб-сервера либо сначала освободи порты с пониманием последствий. Если TCP 80 занят Caddy или другим сервером, не ставь второй веб-сервер на тот же порт: используй существующий ACME-маршрут или DNS-01.');

heading('Веб-сервер и сертификат');
step('4', 'Установи nginx и подготовь каталог сайта', 'Nginx будет обслуживать HTTP-проверку Certbot на 80-м порту и сайт для fallback на локальном 8443. Установи пакеты и создай каталог для сайта. Не отключай другие активные конфигурации, пока не проверишь, что они обслуживают.');
note('info', 'Если Certbot уже установлен', 'Проверь `certbot --version` и способ установки. Не смешивай apt-версию Certbot со Snap-версией: оставь уже работающий пакет или удали его перед переходом на Snap.');
code('bash', 'sudo apt update\nsudo apt install -y nginx snapd\nsudo snap install core\nsudo snap refresh core\nsudo snap install --classic certbot\nsudo ln -sfn /snap/bin/certbot /usr/local/bin/certbot\ncertbot --version\nsudo install -d -m 0755 /var/www/selfsteal/.well-known/acme-challenge');
text('На время выпуска сертификата создай HTTP-конфигурацию. Не добавляй её поверх другого сайта, который уже использует тот же домен и порт.');
text('Открой новый конфигурационный файл в редакторе nano, вставь следующий блок, сохрани его сочетанием Ctrl+O, Enter и выйди сочетанием Ctrl+X.');
code('bash', 'sudo nano /etc/nginx/sites-available/selfsteal');
code('nginx', 'server {\n    listen 80;\n    listen [::]:80;\n    server_name {{NODE_DOMAIN}};\n\n    root /var/www/selfsteal;\n    location ^~ /.well-known/acme-challenge/ {\n        default_type text/plain;\n        try_files $uri =404;\n    }\n    location / { return 200 "Проверка домена для TLS"; }\n}');
code('bash', 'sudo ln -s /etc/nginx/sites-available/selfsteal /etc/nginx/sites-enabled/selfsteal\nsudo nginx -t && sudo systemctl reload nginx');
text('Сначала создай файл конфигурации по указанному пути, затем включи его символьной ссылкой и проверь ответ по HTTP. Если nginx сообщает об ошибке или занятом порте — остановись и исправь конфликт до запроса сертификата.');
code('bash', 'curl -I http://{{NODE_DOMAIN}}/');

step('5', 'Получи сертификат и настрой продление', 'Certbot положит challenge-файл в webroot, а Let’s Encrypt проверит его через публичный порт 80/TCP. Домен уже должен разрешаться в IP VPS; этот способ не останавливает nginx и поэтому подходит для текущей схемы.');
code('bash', 'sudo certbot certonly --webroot -w /var/www/selfsteal -d {{NODE_DOMAIN}} --agree-tos -m {{LE_EMAIL}} --non-interactive');
text('После успешного выпуска проверь, что появились fullchain.pem и privkey.pem. Настрой deploy-hook: он выполнит nginx -t и перезагрузит nginx только после фактического обновления сертификата.');
code('bash', 'sudo install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy\nsudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx >/dev/null <<\'HOOK\'\n#!/bin/sh\nset -eu\ncase " ${RENEWED_DOMAINS:-} " in\n  *" {{NODE_DOMAIN}} "*) ;;\n  *) exit 0 ;;\nesac\nnginx -t && systemctl reload nginx\nHOOK\nsudo chmod 0750 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx\nsudo certbot renew --dry-run');
note('success', 'Проверка продления', 'Команда `certbot renew --dry-run` должна завершиться успешно; в `systemctl list-timers --all | grep -i certbot` должен быть timer автопродления. Не запускай certbot в режиме standalone, если nginx уже слушает 80-й порт: используй webroot, как в примере.');

step('6', 'Настрой nginx для постоянной работы', 'HTTP оставь для challenge и редиректа на HTTPS. Локальный HTTPS-сервер привяжи только к 127.0.0.1:8443 и укажи сертификат домена. Xray будет передавать ему запросы, которые не прошли проверку REALITY.');
text('Открой /etc/nginx/sites-available/selfsteal и выбери вкладку под установленную версию nginx. Проверить её можно командой nginx -v. Замени содержимое файла целиком конфигурацией из выбранной вкладки, сохрани Ctrl+O и выйди Ctrl+X.');
add('tabs', { title: 'Выбери вариант по версии nginx', tabs: [
  { title: 'nginx 1.25.1 и новее', language: 'nginx', text: 'Для новых версий включи HTTP/2 отдельной директивой http2 on;.', code: 'server {\n    listen 80;\n    listen [::]:80;\n    server_name {{NODE_DOMAIN}};\n    root /var/www/selfsteal;\n\n    location ^~ /.well-known/acme-challenge/ {\n        default_type text/plain;\n        try_files $uri =404;\n    }\n    location / { return 301 https://$host$request_uri; }\n}\n\nserver {\n    listen 127.0.0.1:8443 ssl;\n    http2 on;\n    server_name {{NODE_DOMAIN}};\n    root /var/www/selfsteal;\n    index index.html;\n\n    ssl_certificate /etc/letsencrypt/live/{{NODE_DOMAIN}}/fullchain.pem;\n    ssl_certificate_key /etc/letsencrypt/live/{{NODE_DOMAIN}}/privkey.pem;\n    ssl_protocols TLSv1.2 TLSv1.3;\n    error_page 404 /404.html;\n    location / { try_files $uri $uri/ =404; }\n}' },
  { title: 'nginx 1.24 и старше', language: 'nginx', text: 'В старом синтаксисе включи HTTP/2 параметром http2 внутри директивы listen.', code: 'server {\n    listen 80;\n    listen [::]:80;\n    server_name {{NODE_DOMAIN}};\n    root /var/www/selfsteal;\n\n    location ^~ /.well-known/acme-challenge/ {\n        default_type text/plain;\n        try_files $uri =404;\n    }\n    location / { return 301 https://$host$request_uri; }\n}\n\nserver {\n    listen 127.0.0.1:8443 ssl http2;\n    server_name {{NODE_DOMAIN}};\n    root /var/www/selfsteal;\n    index index.html;\n\n    ssl_certificate /etc/letsencrypt/live/{{NODE_DOMAIN}}/fullchain.pem;\n    ssl_certificate_key /etc/letsencrypt/live/{{NODE_DOMAIN}}/privkey.pem;\n    ssl_protocols TLSv1.2 TLSv1.3;\n    error_page 404 /404.html;\n    location / { try_files $uri $uri/ =404; }\n}' }
] });
code('bash', 'sudo nginx -v\nsudo nginx -t && sudo systemctl reload nginx\nsudo ss -ltnp | grep -E ":(80|443|8443)\\b" || true');
text('Ожидаемая схема: Xray занимает публичный 443, nginx принимает публичный 80 и локальный 127.0.0.1:8443. Проверь локальный сайт с правильными Host и SNI:');
code('bash', 'curl -fsS --resolve {{NODE_DOMAIN}}:8443:127.0.0.1 https://{{NODE_DOMAIN}}:8443/ -o /dev/null -w "HTTP %{http_code}\n"');
note('warning', 'Не публикуй 8443', 'В конфигурации nginx должен стоять адрес 127.0.0.1:8443, а не 0.0.0.0:8443. Не добавляй 8443 в UFW или firewall панели VPS.');

heading('Собственный сайт');
step('7', 'Выбери простой формат страницы', 'Подойдёт личная страница, документация или короткая визитка с внутренними ссылками. Выбери тему и наполнение, которое действительно относится к тебе. Иллюстрации ниже — авторские варианты оформления, а не копии чужих сайтов.');
image('/assets/selfsteal-sites.svg', 'Шесть авторских макетов: личные заметки, домашняя кофейня, веб-студия, планер, документация и фотодневник.');
step('8', 'Создай страницу и страницу 404', 'Собери небольшой статический сайт без сторонних скриптов и внешних ресурсов. Пример создаёт главную и понятную страницу ошибки; замени тексты на собственные.');
code('bash', 'sudo tee /var/www/selfsteal/index.html >/dev/null <<\'HTML\'\n<!doctype html>\n<html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n<title>{{SITE_NAME}}</title>\n<style>body{max-width:760px;margin:12vh auto;padding:24px;font:18px/1.7 system-ui;color:#20332d;background:#f4f7f4}h1{font-size:clamp(2rem,7vw,4rem)}a{color:#19765d}</style>\n<h1>{{SITE_NAME}}</h1><p>Личная страница о проектах, заметках и полезных материалах.</p>\n<p><a href="/about.html">О проекте</a></p></html>\nHTML\nsudo tee /var/www/selfsteal/about.html >/dev/null <<\'HTML\'\n<!doctype html><html lang="ru"><meta charset="utf-8"><title>О проекте</title>\n<h1>О проекте</h1><p>Здесь можно рассказать о сайте и его авторе.</p><a href="/">На главную</a></html>\nHTML\nsudo tee /var/www/selfsteal/404.html >/dev/null <<\'HTML\'\n<!doctype html><html lang="ru"><meta charset="utf-8"><title>Страница не найдена</title>\n<h1>404</h1><p>Такой страницы нет.</p><a href="/">Вернуться на главную</a></html>\nHTML\nsudo chmod -R a=rX,u+w /var/www/selfsteal');
text('Если меняешь каталог, он должен совпадать с root в обеих nginx-конфигурациях. После создания файлов повтори nginx -t и проверь главную и случайный адрес.');
code('bash', 'curl -fsS --resolve {{NODE_DOMAIN}}:8443:127.0.0.1 https://{{NODE_DOMAIN}}:8443/ | head -n 5\ncurl -sS -o /dev/null -w "HTTP %{http_code}\n" --resolve {{NODE_DOMAIN}}:8443:127.0.0.1 https://{{NODE_DOMAIN}}:8443/no-such-page');
note('info', 'Ожидаемый ответ', 'Главная должна вернуть 200, несуществующая страница — 404. Если видишь стандартную страницу nginx, проверь root и содержимое index.html.');

heading('Подключи REALITY');
step('9', 'Проверь доступность Xray', 'Сначала убедись, что Xray уже слушает публичный порт 443. Если порт занят другим веб-сервером, не перезапускай службы вслепую — найди конфликт и выбери одну схему владения портом.');
code('bash', 'sudo ss -ltnp | grep ":443" || true\nsudo systemctl status nginx --no-pager');
note('warning', 'Важно: SNI в Self-steal', 'Поле «Твои данные» показывает microsoft.com как пример. Для Self-steal замени SNI на свой {{NODE_DOMAIN}}: это же имя указано в сертификате локального nginx. Иначе проверка REALITY/SNI и сертификат fallback-сайта не совпадут.');
step('10', 'Добавь inbound в Remnawave', 'В Config Profile добавь inbound VLESS с REALITY. Порт оставь 443. Сгенерируй privateKey и shortId средствами панели и используй именно эти значения. В поле назначения укажи локальный nginx:8443, а serverNames — имя, которое подходит для сертификата и сайта.');
code('json', '{\n  "tag": "VLESS_SELFSTEAL",\n  "port": 443,\n  "protocol": "vless",\n  "settings": { "clients": [], "decryption": "none" },\n  "streamSettings": {\n    "network": "tcp",\n    "security": "reality",\n    "realitySettings": {\n      "show": false,\n      "dest": "127.0.0.1:8443",\n      "xver": 0,\n      "serverNames": ["{{SNI}}"],\n      "privateKey": "СГЕНЕРИРУЙ_В_ПАНЕЛИ",\n      "shortIds": ["СГЕНЕРИРУЙ_В_ПАНЕЛИ"]\n    }\n  },\n  "sniffing": {\n    "enabled": true,\n    "destOverride": ["http", "tls", "quic"]\n  }\n}');
note('warning', 'Сверь структуру профиля', 'Фрагмент показывает важные поля inbound, но конкретный Config Profile может требовать собственную структуру JSON и запятые вокруг блока. Не заменяй весь профиль целиком: добавь inbound по схеме своей версии панели и проверь конфигурацию перед применением.');
step('11', 'Назначь Config Profile ноде', 'Открой Nodes → Management → Create new node. Внутреннее имя, страну, Address и Port заполни по инструкции установки Node: Address/Port здесь относятся к управляющему соединению Panel ↔ Node, а не к клиентскому inbound 443. В карточке ноды открой Change Profile, выбери профиль с созданным VLESS inbound и включи этот inbound в списке активных. Сохрани и дождись статуса Online.');
step('12', 'Разреши inbound в Internal Squad', 'В Internal Squads создай или отредактируй нужную группу, включи в ней inbound из этого Config Profile и сохрани изменения. Затем в карточке каждого пользователя открой Access Settings и назначь ему эту Internal Squad. Без включённого inbound в Squad и членства пользователя доступ не появится.');
step('13', 'Создай Host после включения inbound на ноде', 'Открой Hosts → Create new host и выбери этот inbound. Задай Remark, включи видимость и укажи Address: {{NODE_DOMAIN}} (A-запись должна вести на публичный IP ноды). После выбора inbound Port обычно автоматически заполнится как 443. Host — адрес для клиента, он отличается от Node API адреса.');
add('table', { headers: ['Поле Host', 'Что указать для Self-steal'], rows: [
  ['Address', '{{NODE_DOMAIN}} — клиентский домен ноды, DNS направлен на её публичный IP.'],
  ['Port', '443 — подтянется из выбранного inbound; nginx fallback остаётся на 127.0.0.1:8443.'],
  ['SNI', '{{SNI}} — для Self-steal замени пример на {{NODE_DOMAIN}}; он должен совпасть с REALITY serverNames и сертификатом локального nginx.'],
  ['Host', 'Оставь пустым: RAW/TCP не использует HTTP Host header.'],
  ['Path', 'Оставь пустым: RAW/TCP не использует HTTP path.'],
  ['Fingerprint', 'Выбери Firefox. Если клиент не поддерживает его, выбери Safari или Edge из списка клиента; Chrome сейчас не рекомендуем.'],
  ['ALPN', 'Оставь пустым/default, если клиентская схема не требует явного значения.'],
  ['Security Layer', 'DEFAULT — унаследовать REALITY из inbound; не переключай в TLS или NONE.']
] });
note('info', 'Host overrides', 'Пустые advanced поля обычно наследуют значения inbound. Address — внешний адрес клиента, Port — клиентский inbound, SNI — REALITY имя; Node API endpoint настраивается отдельно в карточке Node.');
step('14', 'Создай клиентскую конфигурацию', 'Создай пользователя в панели и выпусти ссылку/QR-код. В клиенте должны совпадать UUID, публичный ключ, shortId и flow, если он включён на сервере. Используй Address {{NODE_DOMAIN}}, порт 443 и SNI/serverName {{SNI}}. Fingerprint выбери Firefox; если он недоступен — Safari или Edge из списка клиента. Chrome сейчас не рекомендуем. Убедись, что пользователь назначен в Internal Squad с включённым inbound.');
text('Открой сайт по домену обычным браузером. Это проверит веб-fallback и сертификат. Отдельно проверь VPN-клиент: успешный ответ сайта не доказывает, что inbound получил актуальный профиль и доступен клиенту.');

heading('DNS через свой резолвер');
add('accordion', { number: '6', icon: 'globe', collapsible: true, title: 'Если у клиента не разрешаются сайты', text: 'Этот раздел необязателен. Сначала проверь, что проблема действительно в DNS: VPN подключён, но доменные имена не разрешаются. Если IP открывается, а имя — нет, настрой резолвер в клиентском/серверном профиле согласно документации используемой версии Xray.' });
step('15', 'Пойми, где возникла DNS-ошибка', 'Если туннель поднялся, но домены не открываются, проверь DNS отдельно. Сбой может быть связан с резолвером провайдера, правилами маршрутизации или недоступностью сайта — смена DNS помогает только в первом случае.');
step('16', 'Добавь доверенный DNS в профиль', 'Настрой резолвер в основном разделе dns именно того Xray-конфига, который реально использует нода. Не создавай дополнительный outbound и routing-правила без необходимости. Перед сохранением проверь JSON и сравни синтаксис со схемой своей версии Xray/Remnawave.');
code('json', '"dns": {\n  "servers": ["1.1.1.1", "9.9.9.9"],\n  "queryStrategy": "UseIPv4"\n}');
note('warning', 'Не заменяй профиль целиком', 'Если конфигурация уже содержит секцию dns, аккуратно отредактируй её. В JSON между соседними секциями нужна запятая; продублированные ключи могут привести к неожиданному поведению.');
step('17', 'Проверь разрешение доменного имени', 'Сравни результат до и после настройки. Установи dig, если утилиты нет. Команда ниже проверяет ответ выбранного публичного DNS с самой ноды; для проверки поведения клиентов дополнительно открой несколько сайтов через VPN.');
code('bash', 'sudo apt install -y dnsutils\ndig @1.1.1.1 youtube.com +short\ngetent ahosts youtube.com | head');
note('success', 'Что считать успехом', 'Резолвер возвращает один или несколько IP-адресов, а подключённый через VPN клиент открывает домен. Это подтверждает DNS-ответ, но не гарантирует скорость или доступность конкретного сервиса.');

heading('Проверь результат снаружи');
add('accordion', { number: '7', icon: 'shield', collapsible: true, title: 'Проверка внешним запросом', text: 'Проверки выполняй с домашнего компьютера или другой машины, а не только с VPS. Так ты увидишь тот же маршрут, что и внешний браузер.' });
step('18', 'Убедись, что на 443 слушает Xray', 'На самой ноде проверь владельца 443 и отдельно локальный адрес nginx. Внешний 8443 открывать не нужно: nginx должен слушать только 127.0.0.1:8443.');
code('bash', 'sudo ss -ltnp | grep -E ":(443|8443)\\b" || true');
note('success', 'Ожидаемая схема', 'Xray принимает подключения на публичном 443, nginx обслуживает fallback на 127.0.0.1:8443. Если nginx слушает 0.0.0.0:8443, исправь bind-адрес и закрой внешний порт.');
step('19', 'Проверь сайт как внешний посетитель', 'С компьютера вне VPS проверь HTTPS, редирект с HTTP и страницу 404. TLS должен быть выдан для {{NODE_DOMAIN}}. На порту 8443 снаружи соединения быть не должно. Если установлен netcat, проверь 8443 с внешнего компьютера: соединение должно быть отклонено или завершиться тайм-аутом.');
code('bash', 'curl -sSI https://{{NODE_DOMAIN}}/ | head -n 5\ncurl -sSI http://{{NODE_DOMAIN}}/ | head -n 5\ncurl -sS -o /dev/null -w "404 check: %{http_code}\n" https://{{NODE_DOMAIN}}/no-such-page');
code('bash', 'nc -vz {{NODE_DOMAIN}} 8443');
note('success', 'Готово', 'Если сайт открывается по HTTPS с правильным сертификатом, HTTP перенаправляется, неизвестная страница возвращает 404, а клиент подключается через VLESS/REALITY — основная связка работает. Если что-то не совпало, сверяй домен, SNI, dest, сертификат и фактический listener 443 по очереди.');

export function createSelfstealManual(previous = {}) {
  return {
    id: previous.id || '86000000-0000-4000-8000-000000000086',
    title: 'Self-steal',
    category: 'protocols',
    slug: 'selfsteal',
    path: '/manual/protocols/selfsteal',
    description: 'Пошаговая настройка REALITY с локальным nginx, сертификатом и собственной страницей для fallback.',
    status: 'published',
    blocks: structuredClone(blocks),
    createdAt: previous.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}
