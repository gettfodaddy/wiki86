# VLESS + REALITY (RAW TCP)



**Раздел:** protocols  

**Адрес:** /manual/protocols/vless-reality



Настрой базовый VLESS inbound с REALITY в Remnawave: ключи, short ID, Host, проверка и диагностика.



## Твои данные

Заполни поля в форме на сайте: их значения подставляются в примеры по всей инструкции. Примеры ниже показывают поля и подсказки.

| Переменная | Поле | Пример | Подсказка |
| --- | --- | --- | --- |
| SNI | SNI / server name | microsoft.com | Значение автоматически подставится в target и serverNames. |
| SERVER_PORT | Порт inbound | 443 | TCP-порт, открытый на ноде. |
| SERVER_IP | Публичный IP ноды | 203.0.113.10 | В клиентском Host это может быть IP или домен ноды. |

## Проверь DNS, порт и firewall до запуска

A-запись клиентского Address должна вести на публичный IPv4 ноды; AAAA добавляй только при работающем IPv6. REALITY использует отдельный внешний target/SNI, но сертификат для домена ноды не нужен.

```bash
getent ahostsv4 {{SERVER_IP}}
sudo ss -lntp | grep -E ":{{SERVER_PORT}}\b" || true
```

```bash
sudo ufw allow {{SERVER_PORT}}/tcp
sudo ufw status numbered
```

UFW — только firewall самой Ubuntu; если команда отсутствует, установи `sudo apt update && sudo apt install -y ufw`. Проверь также сетевой firewall/VPC у хостера. Не включай UFW вслепую: если он сейчас выключен и ты собираешься включить его, сначала разреши свой реальный SSH-порт (обычно `sudo ufw allow OpenSSH`), иначе можно потерять SSH-доступ. Node API порт панели отдельно ограничь IP-адресом Panel; не открывай его всему интернету.

Config Profile — полный Xray JSON для Node. Создай копию профиля перед правкой, сохрани существующие outbounds/routing, добавь inbound и назначь профиль нужной ноде. Пользовательские credentials и Host создаются средствами Remnawave; не вставляй статический UUID в общий профиль.

> **Сертификат на своей ноде не нужен**  
Для VLESS + REALITY не устанавливай Certbot, nginx или Caddy только ради inbound. Нужны REALITY private key/shortId на сервере и соответствующие public key/shortId клиенту. `target` — отдельный внешний адрес REALITY, не сертификат твоего домена. Открой выбранный TCP-порт inbound.

## Предварительные условия

Актуальные и совместимые версии Panel, Node, Xray-core и клиентского приложения.

Выбранный TCP-порт доступен извне. Если используешь 443, убедись, что его не занимает другой listener.

REALITY target отвечает на TLS с нужным SNI с самой ноды. Это не домен пользователя, если ты специально не настраиваешь Self-steal.

Нода онлайн, а тестовый пользователь включён в группу, которой разрешён этот inbound.

## Создай или скопируй Config Profile

Открой Config Profiles и создай профиль из актуальной схемы Xray. Добавь объект inbound в массив inbounds; не замещай существующий полный профиль этим фрагментом.

В Remnawave назначь профиль ноде, включи inbound в соответствующей внутренней группе и проверь его статус.

```json
{
  "tag": "VLESS_REALITY_RAW",
  "listen": "0.0.0.0",
  "port": {{SERVER_PORT}},
  "protocol": "vless",
  "settings": {
    "clients": [],
    "decryption": "none"
  },
  "sniffing": {
    "enabled": true,
    "destOverride": ["http", "tls", "quic"]
  },
  "streamSettings": {
    "network": "raw",
    "security": "reality",
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

> **Ключи и идентификаторы**  
Сгенерируй privateKey и shortId для сервера в панели или поддерживаемой утилите Xray. privateKey остаётся только на сервере. Клиенту передаются соответствующий public key и shortId через Host/ссылку. Не используй ключ из чужого конфига и не публикуй секреты.

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
| Address | Домен/IP ноды, куда клиент подключается; для обычной схемы DNS ведёт на публичный IP ноды. |
| Port | Порт inbound; автозаполняется после выбора. |
| SNI | {{SNI}} — должно совпадать с realitySettings.serverNames и именем target. |
| Host | Не используется в RAW/TCP; оставь пустым. |
| Path | Не используется в RAW/TCP; оставь пустым. |
| Fingerprint | Выбери Firefox. Если клиент не поддерживает его, попробуй Safari или Edge из списка самого клиента; Chrome сейчас не рекомендуем. |
| ALPN | Обычно оставь пустым/default; не добавляй без необходимости. |
| Security Layer | DEFAULT: так Host наследует REALITY из inbound. Не переключай в TLS или NONE. |

> **Как работают advanced overrides**  
Advanced Options в Host переопределяет клиентские параметры, унаследованные от inbound. Пустое поле обычно означает «взять значение из inbound». `Security Layer` в актуальной панели имеет `DEFAULT`, `TLS` и `NONE`; `DEFAULT` наследует inbound, включая REALITY. Не выбирай TLS поверх REALITY и не сбрасывай безопасность в NONE без конкретной причины. ALPN — правильное написание (Application-Layer Protocol Negotiation); не путай его с `Host` HTTP-заголовком и SNI.

## Проверь доступ пользователя

Убедись, что Host видим, привязан к нужному inbound, Node online, а тестовый пользователь назначен в Internal Squad с этим inbound.

Импортируй свежую ссылку подписки в клиент, который поддерживает этот протокол/транспорт. Проверь реальные соединения и статистику в панели.

## Заполни Host в панели

Создай Host для нужного inbound и укажи адрес подключения {{SERVER_IP}}, порт {{SERVER_PORT}}, SNI {{SNI}} и public key/shortId, полученные из server-side REALITY параметров.

Flow `xtls-rprx-vision` применяй только если он включён и поддерживается версией Xray и клиентом. Для проверки сначала оставь остальные необязательные поля по умолчанию.

## Проверка и диагностика

Проверь внешний TCP listener: `nc -vz {{SERVER_IP}} {{SERVER_PORT}}` (доступность порта не подтверждает REALITY-аутентификацию).

Подключись реальным клиентом по ссылке из панели, открой сайт через туннель и проверь статистику пользователя/логи Node.

Если клиент не подключается: сверь address/port, SNI/serverNames, public key, shortId, flow, время системы, DNS и firewall.

Если inbound не стартует: валидность JSON, уникальность tag/port и соответствие полям текущей версии Xray.

## Источники

[Xray REALITY](https://xtls.github.io/en/config/transports/reality.html) · [Xray RAW](https://xtls.github.io/en/config/transports/raw.html) · [Remnawave Config Profiles](https://docs.rw/learn-en/config-profiles/) · [Remnawave Hosts](https://docs.rw/learn-en/hosts/).
