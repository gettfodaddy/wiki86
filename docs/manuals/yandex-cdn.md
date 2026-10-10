# Remnawave за Yandex Cloud CDN



**Раздел:** cdn  

**Адрес:** /manual/cdn/yandex-cdn



Настройте XHTTP inbound, origin с TLS, CDN-сертификат и DNS, затем проверьте подключение реальным клиентом.



## Твои данные

Заполни поля в форме на сайте: их значения подставляются в примеры по всей инструкции. Примеры ниже показывают поля и подсказки.

| Переменная | Поле | Пример | Подсказка |
| --- | --- | --- | --- |
| SERVER_IP | IPv4 сервера | 203.0.113.10 | Публичный IPv4 VPS, на который указывает origin. |
| ORIGIN_DOMAIN | Origin-домен | node.example.net | A-запись, origin TLS и Host/SNI между CDN и VPS. |
| CDN_DOMAIN | CDN-домен | cdn.example.net | Имя, которое указывают в клиенте и DNS CNAME. |
| XHTTP_PORT | Локальный XHTTP-порт | 4443 | Числовой порт inbound на 127.0.0.1. |
| NODE_API_PORT | Node API port | 2222 | Порт связи Panel с Node; ограничьте доступ адресом панели. |
| SSH_PORT | SSH-порт | 22 | Порт SSH для подключения к VPS. |

## Что получится

Клиент подключается к CDN-домену по HTTPS. Yandex Cloud CDN принимает соединение и обращается к origin-домену на VPS; nginx завершает TLS и передаёт XHTTP-трафик локальному VLESS inbound Xray. Remnawave Node управляет Xray на том же сервере.

**Схема:** Клиент → CDN-домен → Yandex Cloud CDN → origin-домен:443 → nginx → 127.0.0.1:{{XHTTP_PORT}} → Xray

CDN-домен и origin-домен — разные имена. Origin нужен Яндексу для соединения с VPS и для TLS на origin. CDN-домен видит пользователь.

## Перед началом

• VPS с Ubuntu или Debian, доступом root по SSH и публичным IPv4.

• Установленная Remnawave Panel и доступ к разделам Nodes, Config Profiles, Hosts, Users.

• Два домена или поддомена, которыми вы управляете: `{{ORIGIN_DOMAIN}}` для origin и `{{CDN_DOMAIN}}` для CDN.

• Доступ к DNS-зоне обоих имён.

• Аккаунт Yandex Cloud с подключённым биллингом и правом создавать Certificate Manager сертификат и CDN-ресурс в одном каталоге.

• Открытые входящие TCP-порты SSH, 80 и 443. Порт Node API (например, {{NODE_API_PORT}}) должен быть доступен панели; ограничьте его адресом панели, если это поддерживает ваша схема firewall.

Не открывайте XHTTP-порт в интернет: inbound будет слушать только `127.0.0.1`.

## Заполните параметры

| Переменная | Пример | Где используется |
| --- | --- | --- |
| `SERVER_IP` | `{{SERVER_IP}}` | A-запись origin и адрес Node |
| `ORIGIN_DOMAIN` | `{{ORIGIN_DOMAIN}}` | A-запись, сертификат Let's Encrypt и TLS/SNI между CDN и origin |
| `CDN_DOMAIN` | `{{CDN_DOMAIN}}` | сертификат CDN, CNAME и адрес подключения клиента |
| `XHTTP_PORT` | `{{XHTTP_PORT}}` | локальный Xray inbound и upstream nginx |
| `NODE_API_PORT` | `{{NODE_API_PORT}}` | связь Remnawave Panel с Node |
| `SSH_PORT` | `{{SSH_PORT}}` | SSH-доступ к VPS |

Подставляйте значения из своей панели и DNS. Не публикуйте Node secret, URL подписки или приватный ключ.

## Этап 1. Подготовьте DNS origin

Создайте запись `A` для origin-домена на IPv4 сервера:

```dns
{{ORIGIN_DOMAIN}}.  A  {{SERVER_IP}}
```

Проверьте, что DNS уже возвращает нужный адрес:

```bash
dig +short A {{ORIGIN_DOMAIN}}
```

Продолжайте, когда в ответе есть IP VPS. Удалите неверные или устаревшие A/AAAA-записи. Yandex CDN подключается к origin по IPv4; наличие IPv6 в DNS может направить часть клиентов или проверок не туда.

## Этап 2. Настройте inbound в Remnawave

В `Config Profiles` создайте профиль или откройте существующий. Добавьте inbound со следующими параметрами:

• Protocol: VLESS.

• Transport: XHTTP.

• Listen: `127.0.0.1`.

• Port: выбранный `XHTTP_PORT`, например `{{XHTTP_PORT}}`.

• Security: `none` на inbound: внешний TLS завершает nginx.

• XHTTP mode: `packet-up`.

• Path: `/`, если вы не выбрали отдельный путь и одинаково указали его во всех компонентах.

Поля XHTTP меняются между версиями Xray. Дополнительные настройки (`uplinkHTTPMethod`, размещение заголовка, padding и лимиты) берите из профиля, который соответствует версии Xray в вашей Panel/Node. Не копируйте JSON из старого скриншота без проверки версии. Для этого сценария запросы CDN должны проходить с методами GET и HEAD; настройки с телом GET несовместимы с рядом CDN.

Сохраните профиль и примените его к Node. Убедитесь, что процесс слушает только loopback:

```bash
sudo ss -lntp | grep ':{{XHTTP_PORT}}'
```

Ожидаемый адрес — `127.0.0.1:{{XHTTP_PORT}}`, а не `0.0.0.0:{{XHTTP_PORT}}`.

**Базовый Config Profile**

Ниже базовый JSON профиля для этого сценария. Вставьте его в редактор Config Profile, сверьте параметры с версией Xray, которую использует ваша Remnawave Panel/Node, и сохраните профиль. Значения порта, пути, padding-заголовков и XHTTP-полей должны совпадать с конфигурацией nginx и CDN.

```json
{
  "log": {
    "loglevel": "warning"
  },
  "dns": {
    "queryStrategy": "UseIPv4"
  },
  "inbounds": [
    {
      "tag": "VLESS_XHTTP_CDN",
      "listen": "127.0.0.1",
      "port": {{XHTTP_PORT}},
      "protocol": "vless",
      "settings": {
        "clients": [],
        "decryption": "none"
      },
      "sniffing": {
        "enabled": true,
        "destOverride": [
          "http",
          "tls",
          "quic"
        ]
      },
      "streamSettings": {
        "network": "xhttp",
        "security": "none",
        "xhttpSettings": {
          "mode": "packet-up",
          "path": "/",
          "extra": {
            "mode": "packet-up",
            "path": "/",
            "uplinkHTTPMethod": "GET",
            "xPaddingHeader": "X-Cache",
            "xPaddingKey": "_dc",
            "xPaddingMethod": "tokenish",
            "xPaddingObfsMode": true,
            "xPaddingPlacement": "queryInHeader",
            "uplinkDataPlacement": "header",
            "uplinkDataKey": "X-Request-Trace",
            "scMaxEachPostBytes": 24000,
            "scMinPostsIntervalMs": 10,
            "serverMaxHeaderBytes": 65536
          }
        }
      }
    }
  ],
  "outbounds": [
    {
      "tag": "DIRECT",
      "protocol": "freedom",
      "settings": {
        "domainStrategy": "UseIPv4"
      }
    },
    {
      "tag": "BLOCK",
      "protocol": "blackhole"
    }
  ],
  "routing": {
    "rules": [
      {
        "type": "field",
        "protocol": [
          "bittorrent"
        ],
        "outboundTag": "BLOCK"
      }
    ]
  }
}
```

`clients` оставлен пустым: Remnawave формирует клиентов при применении профиля. `listen` ограничен loopback, поэтому публичный вход в этот inbound идёт через nginx. Если импортируемый редактор панели ожидает не весь Xray JSON, а только объект Config Profile или набор отдельных полей, перенесите соответствующие значения в формат редактора, не создавая второй inbound.

## Этап 3. Создайте Node

В Remnawave Panel откройте `Nodes → Management → Create new node`.

• Укажите страну и внутреннее имя Node.

• В `Address` укажите IP сервера или origin-домен; `Port` — порт Node API (пример `{{NODE_API_PORT}}`), не XHTTP-порт.

• Выберите созданный Config Profile и примените inbound.

• Скопируйте compose-файл и secret из панели в защищённое место. Не вставляйте secret в публичный чат или документацию.

• Запустите Node на VPS по официальной инструкции Remnawave и проверьте статус `Connected`.

Убедитесь, что firewall и облачная сетевая группа разрешают входящий Node API порт от Panel. Если можно задать источник, используйте IP Panel. Не открывайте порт без ограничения, если ваша архитектура этого не требует.

## Этап 4. Установите nginx и выпустите origin-сертификат

Origin должен иметь валидный сертификат для `ORIGIN_DOMAIN`. DNS-01 не обязателен: для простого VPS подойдёт HTTP-01 через webroot при доступном извне порте 80. Сначала настройте временный HTTP virtual host с правильным `server_name` и webroot, затем выполните Certbot. Не запускайте выпуск до того, как DNS указывает на сервер и порт 80 доступен.

Пример получения сертификата после подготовки webroot и HTTP-конфига:

```bash
sudo certbot certonly --webroot -w /var/www/letsencrypt -d {{ORIGIN_DOMAIN}}
```

Убедитесь, что Certbot завершился успешно, а сертификат и ключ находятся в `/etc/letsencrypt/live/{{ORIGIN_DOMAIN}}/`. Настройте автоматическое продление и проверьте его штатной командой Certbot.

## Этап 5. Настройте nginx как TLS origin

Ниже схема конфига. Перед применением сохраните текущий конфиг и адаптируйте его к существующим сайтам. Не затирайте общий `default`, если там размещены другие сервисы.

```nginx
server {
    listen 80;
    server_name {{ORIGIN_DOMAIN}};
    location ^~ /.well-known/acme-challenge/ { root /var/www/letsencrypt; }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl;
    server_name {{ORIGIN_DOMAIN}};

    ssl_certificate     /etc/letsencrypt/live/{{ORIGIN_DOMAIN}}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/{{ORIGIN_DOMAIN}}/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:{{XHTTP_PORT}};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

Убедитесь, что конфиг передаёт XHTTP-запросы без буферизации и не меняет путь. Проверьте и примените:

```bash
sudo nginx -t
sudo systemctl reload nginx
sudo ss -lntp | grep ':443'
```

Локальная проверка TLS origin:

```bash
curl -I --max-time 10 https://{{ORIGIN_DOMAIN}}/
```

HTTP 400 на корневом URL может быть ожидаемым ответом XHTTP inbound. Важно, что TLS проходит проверку, запрос доходит до nginx и upstream. Это ещё не подтверждает работу клиента через CDN.

## Этап 6. Выпустите сертификат для CDN-домена в Yandex Certificate Manager

Создайте сертификат Let's Encrypt с DNS-проверкой для `{{CDN_DOMAIN}}`. В Certificate Manager откройте созданный сертификат и скопируйте предложенную CNAME-запись `_acme-challenge` в DNS-провайдер.

Пример формы записи:

```dns
_acme-challenge.{{CDN_DOMAIN}}. CNAME <значение-из-Certificate-Manager>.
```

Используйте точные имя и значение из консоли. Для этого имени оставьте только выданную CNAME-запись: не добавляйте рядом TXT. Не удаляйте CNAME после выпуска: он нужен для автоматического продления. Дождитесь статуса `Issued` (или подтверждённого действующего статуса сертификата) прежде чем создавать CDN-ресурс. Проверка DNS может занять время.

## Этап 7. Создайте ресурс Yandex Cloud CDN

Создайте CDN-ресурс и заполните основные настройки:

| Поле | Значение |
| --- | --- |
| CDN-домен | `{{CDN_DOMAIN}}` |
| Origin/source | `{{ORIGIN_DOMAIN}}` |
| Протокол соединения к origin | HTTPS |
| Host header к origin | `{{ORIGIN_DOMAIN}}` |
| SNI к origin | `{{ORIGIN_DOMAIN}}` |
| Сертификат для клиентского CDN-домена | сертификат Certificate Manager для `{{CDN_DOMAIN}}` |
| Перенаправление HTTP → HTTPS для клиентов | включить, если это отдельная настройка клиентского доступа |
| Кэширование | выключить для туннельного XHTTP-трафика |
| CORS и дополнительные HTTP-заголовки | не добавлять без отдельной необходимости |
| URL rewrite / «Перенаправление запросов» | выключить: это переписывание URI, а не HTTP→HTTPS |
| Следовать редиректам origin | выключить; origin настроен сразу по HTTPS |

Сертификат CDN и CDN-ресурс должны находиться в одном каталоге Yandex Cloud. Имя CDN-домена, Host header, SNI и origin — разные поля с разным смыслом; не подставляйте CDN-домен в Host/SNI origin, если origin настроен на `{{ORIGIN_DOMAIN}}`.

После создания дождитесь статуса ресурса `Active`. Изменения конфигурации могут применяться не мгновенно.

## Этап 8. Направьте CDN-домен на Yandex

В карточке CDN-ресурса найдите выданное доменное имя вида `xxxxx.topology.gslb.yccdn.ru`. Создайте DNS-запись:

```dns
{{CDN_DOMAIN}}. CNAME xxxxx.topology.gslb.yccdn.ru.
```

Если DNS обслуживает Cloudflare, переключите именно эту CNAME-запись в режим DNS only (без проксирования). Проверьте:

```bash
dig +short CNAME {{CDN_DOMAIN}}
```

В ответе должен появиться адрес `topology.gslb.yccdn.ru`. Если DNS ещё не обновился, дождитесь TTL и повторите проверку.

## Этап 9. Проверьте всю цепочку

**DNS и TLS**

```bash
dig +short A {{ORIGIN_DOMAIN}}
dig +short CNAME {{CDN_DOMAIN}}
curl -Iv --max-time 15 https://{{CDN_DOMAIN}}/
```

Убедитесь, что клиентский сертификат выдан для `{{CDN_DOMAIN}}`, цепочка TLS валидна, а соединение устанавливается. Ответ `HTTP/2 400` на `/` сам по себе не означает неисправность: XHTTP endpoint не обязан отдавать веб-страницу.

**Проверка origin**

```bash
curl -Iv --max-time 15 https://{{ORIGIN_DOMAIN}}/
sudo ss -lntp | grep ':443'
sudo ss -lntp | grep ':{{XHTTP_PORT}}'
```

nginx слушает публичный 443, Xray — только `127.0.0.1:{{XHTTP_PORT}}`. При проблеме с сертификатом проверьте DNS origin, имя сертификата, срок действия и `server_name` nginx.

**Проверка клиента**

Подключите тестового пользователя из Remnawave через созданный Host/CDN-домен, используя выданную ссылку подписки в совместимом клиенте. Откройте ресурс или выполните реальное подключение, затем проверьте статистику пользователя и Node. Только успешный клиентский трафик подтверждает весь путь через CDN; `curl -I` проверяет лишь часть цепочки.

## Диагностика

| Симптом | Что проверить |
| --- | --- |
| origin-домен не возвращает IP VPS | A-запись, лишние AAAA/A и DNS-кеш |
| Certificate Manager остаётся в `Validating` | точное имя/значение `_acme-challenge` CNAME, отсутствие TXT на этом имени, DNS TTL |
| TLS к CDN не проходит | статус сертификата, CDN-домен, привязку сертификата к ресурсу, DNS CNAME |
| `502` или `504` | nginx upstream, статус Node/Xray, `127.0.0.1:XHTTP_PORT`, логи nginx и контейнера |
| nginx отдаёт неверный сертификат | `server_name`, пути сертификата, SNI и выбранный virtual host |
| Node `offline` | доступность Node API порта от Panel, firewall/ACL, адрес и порт в карточке Node |
| CDN вернул старый/неожиданный ответ | отключено ли кэширование и URL rewrite; дождитесь применения CDN-конфигурации |
| `curl` на `/` получает 400 | это может быть нормальным для XHTTP; проверьте TLS, nginx и реальный клиентский трафик |

Соберите журналы без секретов: `journalctl -u nginx`, `docker logs remnanode` (имя контейнера может отличаться), и статус Node в панели. Перед передачей логов удалите URL подписок, токены, приватные ключи и адреса, которые не хотите раскрывать.

## Безопасность и обслуживание

• Оставьте XHTTP inbound на loopback; наружу публикуйте nginx 443.

• Ограничьте Node API порт адресом Panel, когда это возможно.

• Храните Node secret и приватные ключи в файлах с правами `600`; не передавайте их через командную строку и историю shell.

• Не включайте CDN-кэш для туннельного трафика.

• Сохраните CNAME `_acme-challenge`, чтобы сертификат Yandex Certificate Manager мог продлеваться.

• Следите за сроком origin-сертификата Let's Encrypt и исправностью Certbot renewal hook.

• После обновления Remnawave/Xray проверяйте совместимость XHTTP-параметров и профиль Node.

• Изменения CDN/DNS применяются с задержкой; после правки перепроверьте DNS, TLS и подключение клиента.

## Официальные источники

• [Yandex Certificate Manager: проверка владения доменом](https://yandex.cloud/en/docs/certificate-manager/concepts/challenges)

• [Yandex Certificate Manager: создать сертификат](https://yandex.cloud/en/docs/certificate-manager/operations/managed/cert-create)

• [Yandex CDN: соединение с origin](https://yandex.cloud/en/docs/cdn/concepts/servers-to-origins)

• [Yandex CDN: Host header origin](https://yandex.cloud/en/docs/cdn/concepts/servers-to-origins-host)

• [Yandex CDN: создать ресурс](https://yandex.cloud/en/docs/cdn/operations/resources/create-resource)

• [Yandex CDN: кэширование](https://yandex.cloud/en/docs/cdn/concepts/caching)

• [Yandex CDN: переписывание URI](https://yandex.cloud/en/docs/cdn/operations/resources/setup-http-rewrite)

• [Remnawave: установка Panel](https://docs.rw/install/remnawave-panel/)

• [Remnawave: установка Node](https://docs.rw/install/remnawave-node/)

• [Xray-core: настройки XHTTP транспорта](https://github.com/XTLS/Xray-core/blob/main/infra/conf/transport_method.go)
