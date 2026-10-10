# Trojan + TLS



**Раздел:** protocols  

**Адрес:** /manual/protocols/trojan-tls



Настрой Trojan inbound с собственным доменом и сертификатом, затем подключи тестового пользователя.



## Твои данные

Заполни поля в форме на сайте: их значения подставляются в примеры по всей инструкции. Примеры ниже показывают поля и подсказки.

| Переменная | Поле | Пример | Подсказка |
| --- | --- | --- | --- |
| NODE_DOMAIN | Домен TLS / сертификата | node.example.com | Имя сертификата; SNI клиента должно совпадать с ним. |
| SNI | SNI для Host | microsoft.com | Для TLS обязательно замени на домен своего сертификата; microsoft.com здесь только пример. |
| SERVER_IP | IP ноды | 203.0.113.10 | Адрес сервера/Host для клиента. |
| SERVER_PORT | Порт TLS inbound | 443 | Порт, куда реально приходит TLS соединение. |
| LE_EMAIL | Почта Certbot | you@example.com | Для уведомлений о сертификате; подставится в команду Certbot. |
| PANEL_SSH_USER | SSH-пользователь Panel (если другой сервер) | ubuntu | Учетная запись для защищённой передачи сертификата. |
| PANEL_HOST | Адрес сервера Panel (если другой сервер) | panel.example.com | IP или домен, куда отправляются файлы сертификата. |
| CERT_PATH | Путь certificateFile в Panel | /var/lib/remnawave/configs/xray/ssl/fullchain.pem | Путь внутри backend-контейнера Panel после Docker mount. |
| KEY_PATH | Путь keyFile в Panel | /var/lib/remnawave/configs/xray/ssl/privkey.key | Закрытый ключ; не публикуй и не добавляй в репозиторий. |

## Проверь DNS, порт и firewall до запуска

A-запись {{NODE_DOMAIN}} должна вести на тот сервер, где принимается HTTP-01 проверка и клиентский TLS. При отдельной ноде и Panel смотри ниже шаг о доставке сертификата в Panel. При DNS-01 входящий TCP 80 не нужен.

```bash
getent ahostsv4 {{NODE_DOMAIN}}
sudo ss -lntp | grep -E ":(80|{{SERVER_PORT}})\b" || true
```

```bash
# TCP 80 нужен только для HTTP-01
sudo ufw allow 80/tcp
sudo ufw allow {{SERVER_PORT}}/tcp
sudo ufw status numbered
```

UFW — только firewall самой Ubuntu; если команда отсутствует, установи `sudo apt update && sudo apt install -y ufw`. Проверь также сетевой firewall/VPC у хостера. Не включай UFW вслепую: если он сейчас выключен и ты собираешься включить его, сначала разреши свой реальный SSH-порт (обычно `sudo ufw allow OpenSSH`), иначе можно потерять SSH-доступ. Node API порт панели отдельно ограничь IP-адресом Panel; не открывай его всему интернету.

Этот вариант использует настоящий TLS-сертификат для домена. SNI задаётся в Host/клиенте, а не отдельным полем inbound JSON; значение SNI должно совпадать с доменом сертификата. Поэтому замени пример microsoft.com в «Твои данные» на {{NODE_DOMAIN}}. Для Remnawave путь в профиле должен указывать на смонтированный сертификат внутри backend-контейнера Panel; сама Panel передаёт файлы ноде при применении конфигурации.

## Подготовь домен и сертификат

Создай DNS A-запись на {{SERVER_IP}}. AAAA добавляй только если IPv6 действительно работает на Node.

Выпусти сертификат на {{NODE_DOMAIN}} и настрой автоматическое продление. Проверь срок, цепочку и соответствие имени.

Открой TCP {{SERVER_PORT}} и не допускай конфликта с nginx/Caddy или другим inbound.

## Выпусти сертификат на Ubuntu и передай его Remnawave

## 1. Подготовь домен и порты

Создай A-запись `{{NODE_DOMAIN}}` на публичный IPv4 сервера, куда приходит проверка Let’s Encrypt. Убери неверную AAAA-запись, если IPv6 не настроен. Для HTTP-01 TCP-порт 80 должен быть доступен с интернета; также открой порт inbound из раздела выше.

Проверь, какой процесс уже слушает порты. Certbot standalone временно занимает TCP 80. Если там уже работает nginx/Caddy/другой сайт, не останавливай его наугад: выбери webroot для существующего nginx или DNS-01 у своего DNS-провайдера.

Порт inbound и порт Node API — разные вещи. Не выставляй Node API всему интернету; в firewall ноды разреши его только IP панели.

```bash
getent ahostsv4 {{NODE_DOMAIN}}
sudo ss -lntup | grep -E ":(80|{{SERVER_PORT}})\b" || true
sudo ufw status verbose
```

## 2. Установи Certbot (Ubuntu)

В примере используется официальный Snap-пакет Certbot. На обычном Ubuntu Server `snapd` может быть установлен заранее; команды безопасно проверят/обновят Snap Core.

Не смешивай две установки Certbot: если `certbot` уже установлен через apt, проверь его версию и способ обновления или удали старый пакет перед переходом на Snap.

```bash
sudo apt update
sudo apt install -y snapd
sudo snap install core
sudo snap refresh core
sudo snap install --classic certbot
sudo ln -sfn /snap/bin/certbot /usr/local/bin/certbot
certbot --version
```

> **UFW и firewall хостера — отдельные слои**  
UFW команды выше настраивают только Ubuntu. Разреши TCP 80 там, где выполняется HTTP-01 challenge (при DNS-01 он не нужен), и TCP порт inbound в панели хостинга/VPC. Для Hysteria 2 это UDP {{SERVER_PORT}}; разрешение TCP 443 не открывает UDP 443. Если UFW выключен, не включай его, пока не разрешишь текущий SSH-порт.

## 3. Выпусти сертификат, если TCP 80 свободен

Метод standalone не требует ставить nginx или Caddy: Certbot сам на несколько секунд поднимает HTTP-проверку на 80-м порту. DNS должен уже указывать на этот сервер, а порт 80 не должен быть занят.

```bash
sudo certbot certonly --standalone --preferred-challenges http \
  --agree-tos --no-eff-email -m {{LE_EMAIL}} -d {{NODE_DOMAIN}}
sudo certbot certificates
```

> **Если TCP 80 уже обслуживает nginx**  
Не запускай standalone и не останавливай сайт. Добавь location для ACME в уже существующий server-блок этого домена. Устанавливать второй nginx не нужно; если nginx ещё нет, ставь `sudo apt install -y nginx` только когда действительно хочешь использовать его как HTTP-сервер.

```nginx
location ^~ /.well-known/acme-challenge/ {
    root /var/www/letsencrypt;
    default_type text/plain;
    try_files $uri =404;
}
```

```bash
sudo install -d -m 0755 /var/www/letsencrypt/.well-known/acme-challenge
sudo nginx -t && sudo systemctl reload nginx
sudo certbot certonly --webroot -w /var/www/letsencrypt \
  --agree-tos --no-eff-email -m {{LE_EMAIL}} -d {{NODE_DOMAIN}}
sudo certbot certificates
```

> **Если Panel и Node находятся на разных серверах**  
Можно выпустить сертификат прямо на сервере Panel методом DNS-01: Certbot подтверждает домен TXT-записью, поэтому входящий порт 80 не нужен и сертификат сразу окажется на машине с Docker mount. Установи официальный DNS-плагин именно своего DNS-провайдера и используй его инструкцию для credentials; для Cloudflare команда выглядит как `sudo snap install certbot-dns-cloudflare`, затем `sudo certbot certonly --dns-cloudflare --dns-cloudflare-credentials /root/.secrets/cloudflare.ini -d {{NODE_DOMAIN}} -m {{LE_EMAIL}}`. Не копируй этот plugin/флаг для другого DNS-провайдера. Если используешь HTTP-01 на Node, после каждого renewal нужно безопасно синхронизировать новые файлы на Panel.

```bash
# Только если DNS обслуживает Cloudflare; для другого провайдера используй его Certbot plugin.
sudo snap set certbot trust-plugin-with-root=ok
sudo snap install certbot-dns-cloudflare
sudo install -d -m 0700 /root/.secrets
sudo nano /root/.secrets/cloudflare.ini
# Файл cloudflare.ini:
# dns_cloudflare_api_token = ВСТАВЬ_ОТДЕЛЬНЫЙ_API_TOKEN
sudo chmod 0600 /root/.secrets/cloudflare.ini
sudo certbot certonly --dns-cloudflare --dns-cloudflare-credentials /root/.secrets/cloudflare.ini \
  --agree-tos --no-eff-email -m {{LE_EMAIL}} -d {{NODE_DOMAIN}}
sudo certbot certificates
```

## 4. Проверь сертификат и пути

Для Xray нужны `fullchain.pem` (сертификат вместе с цепочкой) и закрытый `privkey.pem`. Let’s Encrypt создаёт ссылки в `/etc/letsencrypt/live/{{NODE_DOMAIN}}/`; не копируй только leaf-сертификат вместо fullchain.

Панель и Node могут быть на разных серверах. Файл `/etc/letsencrypt/...` на ноде автоматически не виден контейнеру Panel. Remnawave читает сертификаты из смонтированного каталога на сервере Panel и передаёт их Node при отправке конфигурации.

```bash
sudo openssl x509 -in /etc/letsencrypt/live/{{NODE_DOMAIN}}/fullchain.pem -noout -subject -issuer -dates
sudo test -r /etc/letsencrypt/live/{{NODE_DOMAIN}}/privkey.pem && echo "private key readable by root"
```

## 5. Смонтируй сертификат в Remnawave Panel

На сервере Panel создай каталог-источник для файлов. Если Certbot и Panel на одной машине, используй локальное копирование ниже. Если сертификат выпущен на отдельной ноде, передай оба файла на Panel защищённым SSH/SCP; ниже есть пример разовой передачи. Для автоматического обновления разнесённых машин настрой повторную защищённую передачу в deploy-hook или выпусти сертификат на Panel через автоматический DNS-01 plugin.

В `docker-compose.yml` именно сервиса Remnawave Panel/backend добавь bind mount к уже существующему списку `volumes` — не заменяй другие mounts целиком. Не добавляй его в Node compose: Panel читает эти файлы и передаёт их Node при применении Xray-конфигурации.

Путь внутри контейнера укажи в JSON профиля. Не используй путь хоста `/etc/letsencrypt/...` как `keyFile`/`certificateFile`: его может не существовать внутри контейнера.

```bash
# Выполняй на Panel-сервере, если Certbot работает на этой же машине.
sudo install -d -m 0750 /opt/remnawave/nginx
sudo install -m 0644 /etc/letsencrypt/live/{{NODE_DOMAIN}}/fullchain.pem /opt/remnawave/nginx/fullchain.pem
sudo install -m 0640 /etc/letsencrypt/live/{{NODE_DOMAIN}}/privkey.pem /opt/remnawave/nginx/privkey.key
```

```bash
# Разовая передача с Certbot-сервера на Panel-сервер.
# Запусти от обычного sudo-пользователя на Certbot-сервере.
sudo install -m 0644 /etc/letsencrypt/live/{{NODE_DOMAIN}}/fullchain.pem "$HOME/fullchain.pem"
sudo install -m 0600 /etc/letsencrypt/live/{{NODE_DOMAIN}}/privkey.pem "$HOME/privkey.key"
sudo chown "$USER:$USER" "$HOME/fullchain.pem" "$HOME/privkey.key"
scp "$HOME/fullchain.pem" "$HOME/privkey.key" {{PANEL_SSH_USER}}@{{PANEL_HOST}}:/tmp/
# Затем войди по SSH на Panel-сервер и установи файлы:
sudo install -d -m 0750 /opt/remnawave/nginx
sudo install -m 0644 /tmp/fullchain.pem /opt/remnawave/nginx/fullchain.pem
sudo install -m 0640 /tmp/privkey.key /opt/remnawave/nginx/privkey.key
sudo rm -f /tmp/fullchain.pem /tmp/privkey.key
# Удали временные копии на Certbot-сервере после проверки:
rm -f "$HOME/fullchain.pem" "$HOME/privkey.key"
```

```yaml
services:
  remnawave:
    volumes:
      - "/opt/remnawave/nginx:/var/lib/remnawave/configs/xray/ssl:ro"
```

```bash
# Перейди в каталог, где находится docker-compose.yml Remnawave Panel.
cd /path/to/remnawave-panel
sudo docker compose config
sudo docker compose up -d remnawave
sudo docker compose exec remnawave ls -l /var/lib/remnawave/configs/xray/ssl
```

> **Разовая передача не настраивает автосинхронизацию**  
Код SCP выше переносит первичный сертификат. Для автопродления на отдельном Certbot-сервере настрой такой же защищённый перенос в deploy-hook; безопаснее автоматический DNS-01 plugin на сервере Panel, когда он доступен у твоего DNS-провайдера. Не оставляй закрытый ключ во временной папке и не давай публичный доступ к нему.

```json
"certificates": [
  {
    "certificateFile": "/var/lib/remnawave/configs/xray/ssl/fullchain.pem",
    "keyFile": "/var/lib/remnawave/configs/xray/ssl/privkey.key"
  }
]
```

## 6. Проверь автопродление и применение нового сертификата

Snap Certbot устанавливает timer автопродления. Убедись, что timer есть, и прогони тест без выпуска реального сертификата.

Если используешь каталог Remnawave выше на том же сервере, настрой deploy-hook для копирования обновлённых файлов. Если сертификат на другой машине, deploy-hook должен безопасно доставлять новые файлы на сервер Panel — этот канал надо отдельно настроить.

Certbot обновляет файл сертификата, но Node должен получить новую копию. После renewal проверь журнал/файлы и повторно отправь Xray-конфигурацию ноде способом, предусмотренным твоей версией Panel; затем проверь срок сертификата снаружи.

```bash
systemctl list-timers --all | grep -i certbot || true
sudo certbot renew --dry-run
```

```bash
sudo install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy
sudo tee /etc/letsencrypt/renewal-hooks/deploy/remnawave-copy-cert >/dev/null <<'HOOK'
#!/bin/sh
set -eu
case " ${RENEWED_DOMAINS:-} " in
  *" {{NODE_DOMAIN}} "*) ;;
  *) exit 0 ;;
esac
DEST=/opt/remnawave/nginx
install -m 0644 "$RENEWED_LINEAGE/fullchain.pem" "$DEST/fullchain.pem"
install -m 0640 "$RENEWED_LINEAGE/privkey.pem" "$DEST/privkey.key"
HOOK
sudo chmod 0750 /etc/letsencrypt/renewal-hooks/deploy/remnawave-copy-cert
sudo certbot renew --dry-run
```

> **Что автоматизируется**  
Certbot автоматически продлевает сертификат; deploy-hook обновляет файлы каталога Panel. Передача нового сертификата с Panel на Node и перезагрузка Xray зависят от механизма синхронизации установленной версии Remnawave. После тестового подключения проверь фактические `notBefore/notAfter` у сертификата на клиентском порту.

## Официальные источники

[Certbot: установка и автопродление](https://certbot.eff.org/instructions?os=snap&ws=nginx).

[Remnawave Node: SSL-сертификаты, mount Panel и пути Xray](https://docs.rw/install/remnawave-node/).

[Ubuntu Server: UFW firewall](https://ubuntu.com/server/docs/firewalls/).

## Добавь Trojan inbound в Config Profile

Сохрани копию профиля. Ниже показаны поля TLS; структура credentials зависит от интеграции панели. В Remnawave используй её поддерживаемую схему управления пользователями, не зашивай пароль отдельного клиента в общий профиль.

Если TLS завершается на reverse proxy, укажи маршрут до Xray и корректно передавай TCP/TLS по схеме, поддерживаемой выбранным proxy. Не включай TLS одновременно в двух слоях без намерения.

```json
{
  "tag": "TROJAN_TLS",
  "listen": "0.0.0.0",
  "port": {{SERVER_PORT}},
  "protocol": "trojan",
  "settings": {
    "clients": []
  },
  "streamSettings": {
    "network": "raw",
    "security": "tls",
    "tlsSettings": {
      "alpn": ["h2", "http/1.1"],
      "certificates": [
        {
          "certificateFile": "{{CERT_PATH}}",
          "keyFile": "{{KEY_PATH}}"
        }
      ]
    }
  }
}
```

> **Формат inbound зависит от Remnawave**  
В стандартной конфигурации Xray Trojan задаёт пользователей в `settings.users` с паролями. Remnawave управляет клиентами панели и формирует credentials для Node отдельно; используй шаблон, ожидаемый именно твоей версией Panel. Не подменяй `clients`/`users` наугад и проверь сгенерированный Node config.

## Примени inbound и подключи его к пользователям

## Создай ноду и включи Config Profile

Открой `Nodes → Management → Create new node`. Заполни страну и внутреннее имя ноды, а также адрес и порт Node API по инструкции установки Node. Это адрес управляющего соединения Panel ↔ Node; он не обязан совпадать с клиентским портом inbound.

Открой карточку созданной ноды → `Change Profile` / `Select Config Profile`, выбери профиль, в котором сохранён этот inbound, и включи именно его в списке активных inbound ноды. Один профиль содержит полный Xray-конфиг и может включать несколько inbound.

Сохрани изменения, дождись статуса Node `Online` и проверь, что нужный inbound включён/активен. Не создавай Host, пока Panel не видит ноду и inbound.

## Разреши inbound в Internal Squad и назначь squad пользователям

Открой `Internal Squads`, создай подходящую группу или отредактируй существующую. Включи в ней inbound из нужного Config Profile и сохрани группу.

Открой карточку каждого нужного пользователя → `Access Settings` и добавь эту Internal Squad. Проверь членство именно у тех пользователей, которым должен быть доступ.

Profile/Node активирует inbound технически; Internal Squad разрешает его пользователю. Если inbound не включён в squad или пользователь не назначен в эту squad, inbound не появится у него в доступах.

## Создай Host после активации ноды и inbound

Открой `Hosts → Create new host`. Выбери точный inbound (один inbound на один Host) из Config Profile, который уже назначен и активен на ноде.

Задай понятный Remark и включи видимость Host. В `Address` укажи домен подключения, DNS которого ведёт на публичный IP этой ноды. Если перед нодой стоит CDN/reverse proxy, укажи клиентский адрес этой схемы, а не автоматически origin-домен.

После выбора inbound `Port` обычно заполняется из его конфигурации. Оставь это значение, если нет намеренно настроенного внешнего порта/проброса. Host — клиентская точка входа, а не адрес Node API.

| Поле Host | Что указать для этого мануала |
| --- | --- |
| Address | Домен/IP клиентского TLS endpoint; обычно домен с A/AAAA на ноду или на TLS proxy. |
| Port | Порт Trojan inbound; подставится из inbound. |
| SNI | {{SNI}} — домен, на который выпущен сертификат и который обслуживает TLS endpoint. |
| Host | Не используется для RAW/TCP Trojan; оставь пустым. |
| Path | Не используется для RAW/TCP; оставь пустым. |
| Fingerprint | Выбери Firefox; Safari или Edge используй, если Firefox отсутствует в клиенте. Chrome сейчас не рекомендуем. |
| ALPN | Оставь default или укажи согласованные TLS ALPN. Для gRPC нужен h2; для обычного Trojan не задавай h2 без поддержки listener. |
| Security Layer | DEFAULT наследует TLS из inbound; явный TLS нужен только если Host должен его переопределить. |

> **Как работают advanced overrides**  
Advanced Options в Host переопределяет клиентские параметры, унаследованные от inbound. Пустое поле обычно означает «взять значение из inbound». `Security Layer` в актуальной панели имеет `DEFAULT`, `TLS` и `NONE`; `DEFAULT` наследует inbound, включая REALITY. Не выбирай TLS поверх REALITY и не сбрасывай безопасность в NONE без конкретной причины. ALPN — правильное написание (Application-Layer Protocol Negotiation); не путай его с `Host` HTTP-заголовком и SNI.

## Проверь доступ пользователя

Убедись, что Host видим, привязан к нужному inbound, Node online, а тестовый пользователь назначен в Internal Squad с этим inbound.

Импортируй свежую ссылку подписки в клиент, который поддерживает этот протокол/транспорт. Проверь реальные соединения и статистику в панели.

## Создай Host и пользователя

Создай Host на этот inbound: адрес {{SERVER_IP}}, порт {{SERVER_PORT}}, server name/SNI {{SNI}}.

Добавь тестового пользователя, выдай ссылку подписки через панель и проверь, что выбранный клиент поддерживает Trojan и принимает TLS-сертификат.

Не включай режим обхода проверки сертификата в клиенте. Исправь DNS/SNI/цепочку сертификата вместо отключения валидации.

## Проверка и продление

Проверь порт с внешней машины и TLS-сертификат с SNI {{SNI}}.

Подключи клиента и проверь трафик/статистику в Panel. Простой curl к порту не проверяет Trojan credentials.

При ошибке проверь доступность cert/key из контейнера, права чтения, срок сертификата, ALPN, порт и формат user credentials.

После обновления сертификата перезагрузи/примени конфигурацию Xray только поддерживаемым способом и проверь новый срок.

```tls-check
bash
```

> **info**  
Как читать результат

## Источники

[Xray Trojan inbound](https://xtls.github.io/en/config/inbounds/trojan.html) · [Xray TLS](https://xtls.github.io/en/config/transports/tls.html) · [Remnawave Config Profiles](https://docs.rw/learn-en/config-profiles/) · [Remnawave Hosts](https://docs.rw/learn-en/hosts/).
