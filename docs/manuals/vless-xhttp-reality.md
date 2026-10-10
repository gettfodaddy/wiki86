# VLESS + XHTTP + REALITY



**Раздел:** protocols  

**Адрес:** /manual/protocols/vless-xhttp-reality



Настрой XHTTP транспорт с REALITY и проверь совпадение серверных и клиентских параметров.



## Твои данные

Заполни поля в форме на сайте: их значения подставляются в примеры по всей инструкции. Примеры ниже показывают поля и подсказки.

| Переменная | Поле | Пример | Подсказка |
| --- | --- | --- | --- |
| SNI | SNI / server name | microsoft.com | Автоматически подставится в target и serverNames. |
| SERVER_IP | Публичный IP ноды | 203.0.113.10 | Адрес подключения клиента. |
| SERVER_PORT | Порт XHTTP | 443 | TCP listener inbound. |
| XHTTP_PATH | Путь XHTTP | / | Должен совпадать в Host и Xray. |
| XHTTP_MODE | Режим XHTTP | auto | Используй режим, поддерживаемый обеими версиями. |

## Проверь DNS, порт и firewall до запуска

A-запись клиентского Address должна вести на ноду либо на действительно настроенный proxy/CDN. Убедись, что он пропускает этот TCP-трафик и XHTTP-параметры. Для REALITY свой сертификат не выпускают.

```bash
getent ahostsv4 {{SERVER_IP}}
sudo ss -lntp | grep -E ":{{SERVER_PORT}}\b" || true
```

```bash
sudo ufw allow {{SERVER_PORT}}/tcp
sudo ufw status numbered
```

UFW — только firewall самой Ubuntu; если команда отсутствует, установи `sudo apt update && sudo apt install -y ufw`. Проверь также сетевой firewall/VPC у хостера. Не включай UFW вслепую: если он сейчас выключен и ты собираешься включить его, сначала разреши свой реальный SSH-порт (обычно `sudo ufw allow OpenSSH`), иначе можно потерять SSH-доступ. Node API порт панели отдельно ограничь IP-адресом Panel; не открывай его всему интернету.

XHTTP — транспорт, VLESS — протокол, REALITY — защита транспорта. Серверная и клиентская стороны должны совпадать по режиму и пути. Начни с минимальной конфигурации; не добавляй экспериментальные `extra` параметры, пока базовое подключение не работает.

> **Сертификат Certbot не требуется**  
REALITY использует собственные ключи и внешний target; сертификат на ноде не нужен. Не ставь nginx/Caddy только ради этого inbound. Для прямого подключения открой TCP {{SERVER_PORT}}; TCP 80 не требуется. Если перед нодой CDN/proxy, проверь его поддержку XHTTP и REALITY.

## Подготовь сервер

Проверь доступность порта {{SERVER_PORT}} по TCP и совместимость версий Xray-core на Node и клиента.

По умолчанию target — {{SNI}}:443. Проверь соединение с VPS. Если выберешь другую цель, измени SNI в «Твои данные»: он обновится и в target, и в serverNames. Не смешивай внешний target и собственный fallback Self-steal.

Сделай копию Config Profile и добавь inbound в inbounds; оставь прочие секции профиля без изменений.

```json
{
  "tag": "VLESS_XHTTP_REALITY",
  "listen": "0.0.0.0",
  "port": {{SERVER_PORT}},
  "protocol": "vless",
  "settings": {"clients": [], "decryption": "none"},
  "sniffing": {
    "enabled": true,
    "destOverride": ["http", "tls", "quic"]
  },
  "streamSettings": {
    "network": "xhttp",
    "security": "reality",
    "xhttpSettings": {
      "mode": "{{XHTTP_MODE}}",
      "path": "{{XHTTP_PATH}}"
    },
    "realitySettings": {
      "show": false,
      "target": "{{SNI}}:443",
      "xver": 0,
      "serverNames": ["{{SNI}}"],
      "privateKey": "СГЕНЕРИРУЙ_В_REMANAWAVE",
      "shortIds": ["СГЕНЕРИРУЙ_В_REMANAWAVE"]
    }
  }
}
```

> **Не вставляй ключи из примера**  
Создай privateKey и shortId заново для своего inbound. Клиент получит public key, UUID, SNI, shortId, XHTTP mode/path через корректно настроенный Host и ссылку. Не копируй приватный ключ в пользовательские поля.

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
| Address | Домен/IP ноды или клиентский CDN-домен, если он действительно маршрутизирует XHTTP к этой ноде. |
| Port | Порт inbound/XHTTP; обычно подставится автоматически. |
| SNI | {{SNI}} — должно совпадать с realitySettings.serverNames и target; это не обязательно Address ноды. |
| Host | Оставь пустым, если `xhttpSettings.host` в inbound не задан. Иначе укажи в точности тот же HTTP Host. |
| Path | В точности `xhttpSettings.path`, включая начальный `/`; например `{{XHTTP_PATH}}`. |
| Fingerprint | Выбери Firefox; Safari или Edge подойдут, если они есть в клиенте. Chrome сейчас не рекомендуем. |
| ALPN | Обычно default/пусто; оставь без override, если схема XHTTP явно не требует иного. |
| Security Layer | DEFAULT: унаследовать REALITY из inbound. Не ставь TLS/NONE. |

> **Как работают advanced overrides**  
Advanced Options в Host переопределяет клиентские параметры, унаследованные от inbound. Пустое поле обычно означает «взять значение из inbound». `Security Layer` в актуальной панели имеет `DEFAULT`, `TLS` и `NONE`; `DEFAULT` наследует inbound, включая REALITY. Не выбирай TLS поверх REALITY и не сбрасывай безопасность в NONE без конкретной причины. ALPN — правильное написание (Application-Layer Protocol Negotiation); не путай его с `Host` HTTP-заголовком и SNI.

## Проверь доступ пользователя

Убедись, что Host видим, привязан к нужному inbound, Node online, а тестовый пользователь назначен в Internal Squad с этим inbound.

Импортируй свежую ссылку подписки в клиент, который поддерживает этот протокол/транспорт. Проверь реальные соединения и статистику в панели.

## Настрой Host и клиент

В Host выбери этот inbound, укажи адрес {{SERVER_IP}}, порт {{SERVER_PORT}}, SNI {{SNI}} и созданные для этого inbound REALITY параметры.

Укажи тот же XHTTP mode `{{XHTTP_MODE}}` и path `{{XHTTP_PATH}}`. Если панель формирует ссылку автоматически, проверь её параметры в тестовом клиенте.

Пользователь должен быть привязан к Node/группе с разрешённым inbound.

## Проверь подключение

Включи тестовый клиент и проверь реальный веб-трафик и статус/статистику в Panel.

HTTP 400 на запросе curl к корню может быть нормальным для XHTTP endpoint; он не подтверждает работоспособность клиентского туннеля.

При сбое по очереди проверь порт, JSON/логи Xray, client core, mode/path, SNI, ключ, shortId и отсутствие несовместимого прокси перед Node.

## Источники

[Xray XHTTP](https://xtls.github.io/en/config/transports/xhttp.html) · [Xray REALITY](https://xtls.github.io/en/config/transports/reality.html) · [Xray transport matrix](https://xtls.github.io/en/config/transport.html) · [Remnawave Config Profiles](https://docs.rw/learn-en/config-profiles/).
