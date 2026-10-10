# Trojan + REALITY (RAW TCP)



**Раздел:** protocols  

**Адрес:** /manual/protocols/trojan-reality



Рабочее сочетание Trojan + REALITY поверх RAW/TCP: Config Profile, Node, Internal Squad, Host и проверка клиента.



## Твои данные

Заполни поля в форме на сайте: их значения подставляются в примеры по всей инструкции. Примеры ниже показывают поля и подсказки.

| Переменная | Поле | Пример | Подсказка |
| --- | --- | --- | --- |
| SNI | SNI / server name | microsoft.com | Автоматически подставится в target и serverNames. |
| SERVER_IP | Публичный адрес ноды | 203.0.113.10 | Address для клиента; DNS должен вести на ноду. |
| SERVER_PORT | Порт Trojan inbound | 8443 | TCP listener, разрешённый в firewall. |

## Проверь DNS, порт и firewall до запуска

A-запись клиентского Address должна вести на публичный listener ноды. REALITY target и SNI — отдельные параметры handshake; сертификат для собственного домена и Certbot этой схеме не нужны.

```bash
getent ahostsv4 {{SERVER_IP}}
sudo ss -lntp | grep -E ":{{SERVER_PORT}}\b" || true
```

```bash
sudo ufw allow {{SERVER_PORT}}/tcp
sudo ufw status numbered
```

UFW — только firewall самой Ubuntu; если команда отсутствует, установи `sudo apt update && sudo apt install -y ufw`. Проверь также сетевой firewall/VPC у хостера. Не включай UFW вслепую: если он сейчас выключен и ты собираешься включить его, сначала разреши свой реальный SSH-порт (обычно `sudo ufw allow OpenSSH`), иначе можно потерять SSH-доступ. Node API порт панели отдельно ограничь IP-адресом Panel; не открывай его всему интернету.

Ты прав: твой Trojan + REALITY конфиг проверен и работает. Я ошибочно объявил сочетание неподдерживаемым. В документации Xray есть расхождение: общая таблица совместимости помечает Trojan + REALITY как supported, а отдельная страница Trojan говорит, что Trojan должен использовать TLS. Поэтому опирайся на проверенную связку и фактические версии Node/Xray/Panel, а не переноси ограничение одной страницы на все сборки. REALITY применим с RAW, XHTTP и gRPC; `tcp` может выступать legacy-именем RAW/TCP.

> **Собственный TLS-сертификат не нужен**  
В этом inbound включён REALITY, а не обычный `security: tls`. Не выпускай Certbot-сертификат для него и не запускай nginx/Caddy на том же TCP-порту. Открой TCP {{SERVER_PORT}}. Для Trojan с собственным сертификатом смотри отдельный мануал Trojan + TLS.

> **Что делает каждый слой**  
Trojan отвечает за протокол и пароль пользователя. REALITY выполняет внешний TLS-подобный handshake и проверку параметров клиента. Получается Trojan внутри RAW/TCP + REALITY. Это не Trojan + собственный TLS-сертификат.

## Подготовь параметры

Выбери TCP порт {{SERVER_PORT}} и проверь, что он свободен и открыт в firewall/у провайдера.

SNI по умолчанию microsoft.com, поэтому target автоматически станет microsoft.com:443. Проверь доступность этого адреса с VPS. Если используешь другой target, замени SNI в «Твои данные»: значение обновится и в target, и в serverNames.

Создай копию Config Profile и добавь inbound. Пользовательские Trojan credentials оставь Remnawave, если профиль обслуживает Panel.

```json
{
  "tag": "TROJAN_REALITY_RAW",
  "listen": "0.0.0.0",
  "port": {{SERVER_PORT}},
  "protocol": "trojan",
  "settings": {"clients": []},
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
      "shortIds": ["СГЕНЕРИРУЙ_В_REMANAWAVE"],
      "privateKey": "СГЕНЕРИРУЙ_В_REMANAWAVE",
      "serverNames": ["{{SNI}}"]
    }
  }
}
```

> **О конфиге из сообщения**  
Значения `privateKey` и `serverNames` в сообщении пустые/обезличенные; их нельзя оставлять пустыми в обычной настройке. `shortIds: [""]` допустим в Xray и означает пустой shortId, если сервер и клиент используют его одинаково. `target: ":443"` — нестандартная запись без hostname. Раз она прошла твой тест, сохрани её как проверенный вариант этой среды; для переносимого примера указывай явный `host:port` и проверяй fallback отдельно.

> **Проверь версии и формат**  
Из-за расхождения в документации поведение зависит от конкретной версии/сборки Xray и реализации Panel. Если inbound запускается, но пользователь не подключается, сверяй сгенерированную Trojan-ссылку и параметры REALITY (SNI/serverName, public/private key, shortId, fingerprint), затем смотри логи Node. Не заменяй рабочий `target: ":443"` на другое значение без повторной проверки; для переносимого примера используй явно проверенный target и порт.

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
| Address | Домен/IP клиентского endpoint ноды; DNS должен приводить на правильный listener. |
| Port | Порт Trojan inbound (например 8443); автоматически заполнится из inbound. |
| SNI | {{SNI}} — одинаковое значение в serverNames и target. Не оставляй пустым в обычной схеме. |
| Host | Для RAW/TCP не используется; оставь пустым. |
| Path | Для RAW/TCP не используется; оставь пустым. |
| Fingerprint | Выбери Firefox; если его нет, Safari или Edge при наличии в клиенте. Chrome сейчас не рекомендуем. |
| ALPN | Оставь пустым/default, если проверенная клиентская конфигурация не требует значения. |
| Security Layer | DEFAULT: наследует REALITY. Выбор TLS подменит тип клиентской защиты и сломает эту связку. |

> **Как работают advanced overrides**  
Advanced Options в Host переопределяет клиентские параметры, унаследованные от inbound. Пустое поле обычно означает «взять значение из inbound». `Security Layer` в актуальной панели имеет `DEFAULT`, `TLS` и `NONE`; `DEFAULT` наследует inbound, включая REALITY. Не выбирай TLS поверх REALITY и не сбрасывай безопасность в NONE без конкретной причины. ALPN — правильное написание (Application-Layer Protocol Negotiation); не путай его с `Host` HTTP-заголовком и SNI.

## Проверь доступ пользователя

Убедись, что Host видим, привязан к нужному inbound, Node online, а тестовый пользователь назначен в Internal Squad с этим inbound.

Импортируй свежую ссылку подписки в клиент, который поддерживает этот протокол/транспорт. Проверь реальные соединения и статистику в панели.

## Настрой Host для Trojan + REALITY

Создай Host с этим inbound. Клиенту нужны Trojan password, REALITY public key, shortId, SNI и совместимый fingerprint; Panel должна сформировать ссылку для выбранного клиента.

Оставь `Security Layer` в `DEFAULT`, чтобы Host унаследовал REALITY, а не подменил его на TLS.

## Создай пользователя и проверь соединение

Создай пользователя Trojan в Remnawave, добавь его в нужную Internal Squad и выдай свежую ссылку подписки.

Импортируй ссылку в клиент с поддержкой Trojan + REALITY. Проверь handshake, Trojan-аутентификацию и появление статистики пользователя.

При ошибке отдельно сверяй address/port, SNI, public key, shortId, fingerprint, Trojan password и членство в Squad. Открытый TCP-порт не подтверждает работу этих уровней.

## Источники

[Xray transport compatibility matrix](https://xtls.github.io/en/config/transport.html) · [Xray Trojan inbound](https://xtls.github.io/en/config/inbounds/trojan.html) · [Xray REALITY](https://xtls.github.io/en/config/transports/reality.html).
