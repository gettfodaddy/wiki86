# Установка Remnawave Panel



**Раздел:** remnawave  

**Адрес:** /manual/remnawave/panel-install



Подготовьте сервер, задайте секреты и запустите панель. Настройте её через отдельный reverse proxy.



## Твои данные

Заполни поля в форме на сайте: их значения подставляются в примеры по всей инструкции. Примеры ниже показывают поля и подсказки.

| Переменная | Поле | Пример | Подсказка |
| --- | --- | --- | --- |
| PANEL_DOMAIN | Домен панели | panel.example.com | A-запись домена должна вести на сервер Panel. |

Пошаговая установка панели Remnawave на сервер Ubuntu/Debian. Reverse proxy настраивается отдельно — см. [Мануал 2](/manual/remnawave/reverse-proxy). Панель без reverse proxy не предназначена для полноценной работы и не должна быть доступна напрямую из интернета.

## Что понадобится

• Сервер Ubuntu/Debian с доступом по SSH и правами `sudo`.

• Домен панели, например `{{PANEL_DOMAIN}}`, и DNS-запись `A` (при использовании IPv6 также `AAAA`) на IP сервера.

• Открытые входящие порты `80` и `443` для reverse proxy. Дополнительные требования к сертификату зависят от выбранного прокси.

• Docker Engine и Docker Compose plugin. Docker установим ниже.

В примерах замени `{{PANEL_DOMAIN}}` на свой домен.

## 1. Установить Docker

```bash
sudo curl -fsSL https://get.docker.com | sh
```

## 2. Скачать файлы панели

Создай каталог проекта и загрузи актуальные compose-файл и шаблон переменных окружения из репозитория Remnawave:

```bash
sudo mkdir -p /opt/remnawave
sudo chown "$USER":"$USER" /opt/remnawave
cd /opt/remnawave
curl -o docker-compose.yml https://raw.githubusercontent.com/remnawave/backend/refs/heads/main/docker-compose-prod.yml
curl -o .env https://raw.githubusercontent.com/remnawave/backend/refs/heads/main/.env.sample
```

## 3. Сгенерировать секреты

Команды создадут случайные значения для секретов приложения и пароля PostgreSQL. Файл `.env` содержит чувствительные данные: оставь его доступным только администраторам и сохрани резервную копию в защищённом месте.

```bash
sed -i "s/^APP_SECRET=.*/APP_SECRET=$(openssl rand -hex 64)/" .env
sed -i "s/^METRICS_PASS=.*/METRICS_PASS=$(openssl rand -hex 64)/" .env
sed -i "s/^WEBHOOK_SECRET_HEADER=.*/WEBHOOK_SECRET_HEADER=$(openssl rand -hex 64)/" .env
pw=$(openssl rand -hex 24)
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$pw/" .env
sed -i "s|^\(DATABASE_URL=\"postgresql://postgres:\)[^\@]*\(@.*\)|\1$pw\2|" .env
unset pw
```

## 4. Заполнить домены

Открой `.env`:

```bash
nano /opt/remnawave/.env
```

Укажи домен панели и временный публичный адрес подписки:

```dotenv
FRONT_END_DOMAIN={{PANEL_DOMAIN}}
SUB_PUBLIC_DOMAIN={{PANEL_DOMAIN}}/api/sub
```

Значение `SUB_PUBLIC_DOMAIN` здесь оставь в указанном формате. Если позже будешь разворачивать отдельную страницу подписки, замени его на её домен согласно отдельному руководству Remnawave.

## 5. Запустить панель

```bash
cd /opt/remnawave
docker compose up -d
docker compose logs -f -t
```

Выйти из просмотра логов можно сочетанием `Ctrl+C`; контейнеры продолжат работать.

## Что дальше

Настрой reverse proxy отдельным мануалом: [Nginx или Caddy для Remnawave](/manual/remnawave/reverse-proxy). Служебные сервисы панели не открывай напрямую в интернет: доступ к ним должен идти через прокси, а не через публичные порты контейнеров.

## Официальные материалы

• [Quick Start Remnawave](https://docs.rw/overview/quick-start/)

• [Требования](https://docs.rw/install/requirements/)

• [Установка Remnawave Panel](https://docs.rw/install/remnawave-panel/)

• [Переменные окружения](https://docs.rw/install/environment-variables/)
