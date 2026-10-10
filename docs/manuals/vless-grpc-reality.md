# VLESS + gRPC + REALITY



**Раздел:** protocols  

**Адрес:** /manual/protocols/vless-grpc-reality



Настрой gRPC транспорт с REALITY, совпадающим serviceName и клиентскими параметрами.



## Твои данные

Заполни поля в форме на сайте: их значения подставляются в примеры по всей инструкции. Примеры ниже показывают поля и подсказки.

| Переменная | Поле | Пример | Подсказка |
| --- | --- | --- | --- |
| SNI | SNI / server name | microsoft.com | Автоматически подставится в target и serverNames. |
| SERVER_IP | IP ноды | 203.0.113.10 | Публичный адрес подключения. |
| SERVER_PORT | Порт | 443 | TCP-порт inbound. |
| GRPC_SERVICE | gRPC serviceName | grpc | Должен совпадать на клиенте и сервере. |

## Проверь DNS, порт и firewall до запуска

Клиентский Address должен вести к ноде или к proxy, который поддерживает нужный маршрут gRPC. REALITY SNI/target — отдельные параметры; собственный сертификат не нужен. Открой TCP, а не UDP.

```bash
getent ahostsv4 {{SERVER_IP}}
sudo ss -lntp | grep -E ":{{SERVER_PORT}}\b" || true
```

```bash
sudo ufw allow {{SERVER_PORT}}/tcp
sudo ufw status numbered
```

UFW — только firewall самой Ubuntu; если команда отсутствует, установи `sudo apt update && sudo apt install -y ufw`. Проверь также сетевой firewall/VPC у хостера. Не включай UFW вслепую: если он сейчас выключен и ты собираешься включить его, сначала разреши свой реальный SSH-порт (обычно `sudo ufw allow OpenSSH`), иначе можно потерять SSH-доступ. Node API порт панели отдельно ограничь IP-адресом Panel; не открывай его всему интернету.

gRPC — транспорт поверх HTTP/2, а REALITY — защита транспорта. Сочетание поддерживается Xray, но оно требует точного совпадения имени сервиса и всех REALITY параметров. Для новой установки сравни его с XHTTP: официальные материалы Xray сейчас рекомендуют оценивать XHTTP для новых схем.

> **Сертификат Certbot не нужен**  
При gRPC + REALITY на своей ноде не выпускай TLS-сертификат и не устанавливай nginx/Caddy ради inbound. REALITY использует отдельные ключи; открой TCP {{SERVER_PORT}}. `serviceName` — параметр gRPC, а не путь к сертификату или HTTP Host.

## Проверь инфраструктуру

Проверь порт {{SERVER_PORT}} и доступность {{SNI}}:443 с Node.

Убедись, что клиентское приложение поддерживает VLESS gRPC + REALITY и текущие версии Xray.

Если трафик идёт через reverse proxy/load balancer, он должен корректно поддерживать HTTP/2 и не менять gRPC serviceName.

```json
{
  "tag": "VLESS_GRPC_REALITY",
  "listen": "0.0.0.0",
  "port": {{SERVER_PORT}},
  "protocol": "vless",
  "settings": {"clients": [], "decryption": "none"},
  "streamSettings": {
    "network": "grpc",
    "security": "reality",
    "grpcSettings": {
      "serviceName": "{{GRPC_SERVICE}}",
      "multiMode": false
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

> **Генерация и безопасность**  
Сгенерируй privateKey и shortIds индивидуально для inbound. Не используй ключ из присланного исходного JSON — он считался раскрытым в переписке. Клиенту нужны только соответствующие публичные параметры.

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
| Address | Домен/IP ноды или корректный публичный proxy endpoint. |
| Port | Порт inbound; подтянется после выбора. |
| SNI | {{SNI}} — разрешённое REALITY serverName, согласованное с target. |
| Host | Обычно оставить пустым; у gRPC serviceName задаётся в gRPC settings, это не HTTP Host. |
| Path | Оставить пустым; здесь используется `serviceName`, а не URL path. |
| Fingerprint | Выбери Firefox; если клиент его не поддерживает, Safari или Edge из доступного списка. Chrome сейчас не рекомендуем. |
| ALPN | gRPC требует HTTP/2; оставь значение, генерируемое Host/клиентом, либо h2 если поле требуется. |
| Security Layer | DEFAULT наследует REALITY. Не переопределяй в TLS/NONE. |

> **Как работают advanced overrides**  
Advanced Options в Host переопределяет клиентские параметры, унаследованные от inbound. Пустое поле обычно означает «взять значение из inbound». `Security Layer` в актуальной панели имеет `DEFAULT`, `TLS` и `NONE`; `DEFAULT` наследует inbound, включая REALITY. Не выбирай TLS поверх REALITY и не сбрасывай безопасность в NONE без конкретной причины. ALPN — правильное написание (Application-Layer Protocol Negotiation); не путай его с `Host` HTTP-заголовком и SNI.

## Проверь доступ пользователя

Убедись, что Host видим, привязан к нужному inbound, Node online, а тестовый пользователь назначен в Internal Squad с этим inbound.

Импортируй свежую ссылку подписки в клиент, который поддерживает этот протокол/транспорт. Проверь реальные соединения и статистику в панели.

## Согласуй Host и клиента

В Host укажи {{SERVER_IP}}:{{SERVER_PORT}}, SNI {{SNI}}, public key, shortId и gRPC serviceName `{{GRPC_SERVICE}}`.

Оставь `multiMode: false`, если клиент и сценарий не требуют иного; усложняй транспорт после того, как простой режим заработал.

Проверь, что пользователь назначен на группу с доступом к inbound.

## Проверь и устрани сбои

Подключи реальный клиент, создай трафик и проверь статус/статистику в панели.

При timeout проверь порт/firewall и что Node слушает inbound. При TLS/REALITY ошибках проверь SNI, target, public key и shortId.

При gRPC ошибке проверь HTTP/2, serviceName и отсутствие несовместимого промежуточного proxy. Не считай открытый TCP-порт достаточной проверкой.

## Источники

[Xray gRPC](https://xtls.github.io/en/config/transports/grpc.html) · [Xray REALITY](https://xtls.github.io/en/config/transports/reality.html) · [Xray transport matrix](https://xtls.github.io/en/config/transport.html).
