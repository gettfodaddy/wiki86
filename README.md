# Развёртывание wiki86

## Как устроен проект

wiki86 — приложение без сторонних зависимостей на Node.js 20+. Сервер Node отдаёт интерфейс сайта, API конструктора и опубликованные инструкции. Черновики и опубликованные страницы хранятся в файле `manuals.json` внутри каталога `WIKI86_DATA_DIR`. В production этот каталог должен находиться вне публичной папки сайта. Caddy принимает HTTPS-запросы и передаёт их локальному серверу Node.

В `content/manuals.json` и `content/navigation.json` находятся комплектные инструкции для первой установки. При запуске сервер добавляет недостающие страницы по адресу и пункты навигации в постоянное хранилище. Существующие страницы и их правки не перезаписываются. Исходники инструкций в Markdown лежат в `docs/manuals/`; после редактирования данных комплекта пересоздай Markdown командой `npm run docs:generate`.

## Локальный запуск и preview

Открой терминал в папке проекта и задай пароль администратора. В Linux/macOS:

```sh
WIKI86_ADMIN_PASSWORD='задай-свой-пароль' npm start
```

В PowerShell:

```powershell
$env:WIKI86_ADMIN_PASSWORD = 'задай-свой-пароль'
npm start
```

Перейди на `http://127.0.0.1:8765/admin`. В режиме разработки, если пароль не задан, используется `wiki86-preview`. Для своего preview лучше задать отдельный пароль. При `NODE_ENV=production` сервер не запустится без `WIKI86_ADMIN_PASSWORD`.

## Установка на production-сервер

1. Скопируй проект в `/opt/wiki86` (без каталога `.git`) и установи Node.js версии 20 или новее.
2. Создай системного пользователя и каталог для постоянных данных. Сгенерируй длинный случайный пароль командой `openssl rand -hex 32` и защити файл с переменными окружения:

   ```sh
   sudo useradd --system --home /opt/wiki86 --shell /usr/sbin/nologin wiki86
   sudo install -d -o wiki86 -g wiki86 -m 0750 /var/lib/wiki86
   sudo install -o root -g wiki86 -m 0640 /dev/null /etc/wiki86.env
   sudo nano /etc/wiki86.env
   ```

   Добавь в `/etc/wiki86.env` эти значения и замени пароль на сгенерированный:

   ```ini
   NODE_ENV=production
   HOST=127.0.0.1
   PORT=8765
   WIKI86_ADMIN_PASSWORD=замени-на-длинный-случайный-пароль
   WIKI86_DATA_DIR=/var/lib/wiki86
   ```

3. Сохрани следующий unit-файл как `/etc/systemd/system/wiki86.service`, затем настрой права на файлы проекта:

   ```ini
   [Unit]
   Description=Сайт инструкций wiki86
   After=network.target

   [Service]
   Type=simple
   User=wiki86
   Group=wiki86
   WorkingDirectory=/opt/wiki86
   EnvironmentFile=/etc/wiki86.env
   ExecStart=/usr/bin/node /opt/wiki86/server.mjs
   Restart=on-failure
   RestartSec=3
   NoNewPrivileges=true
   PrivateTmp=true
   ProtectSystem=strict
   ProtectHome=true
   ReadWritePaths=/var/lib/wiki86

   [Install]
   WantedBy=multi-user.target
   ```

   ```sh
   sudo chown -R root:wiki86 /opt/wiki86
   sudo find /opt/wiki86 -type d -exec chmod 0750 {} \;
   sudo find /opt/wiki86 -type f -exec chmod 0640 {} \;
   sudo systemctl daemon-reload
   sudo systemctl enable --now wiki86
   sudo systemctl status wiki86
   ```

4. Настрой Caddy на проксирование домена к локальному Node-серверу:

   ```caddy
   wiki86.zeronodes.co.uk {
       encode zstd gzip
       reverse_proxy 127.0.0.1:8765
   }
   ```

   Проверь конфигурацию и перезагрузи Caddy обычным для твоего сервера способом. Caddy получит и будет обновлять HTTPS-сертификат, если DNS домена указывает на сервер и доступны порты 80 и 443.

## Создание и публикация инструкций

Открой `/admin` и введи пароль из `WIKI86_ADMIN_PASSWORD`. Заполни название, раздел, slug адреса и описание. Слева добавляй блоки: заголовок, текст, шаг, код, примечание, изображение по HTTPS-ссылке или разделитель. Нажми на блок в предпросмотре, чтобы изменить его. Кнопки со стрелками меняют порядок блоков, кнопка × удаляет блок.

Кнопка «Сохранить черновик» сохраняет страницу на сервере и оставляет её приватной. Кнопка «Опубликовать» открывает страницу по адресу `/manual/<раздел>/<slug>` и добавляет ссылку в боковую панель. Изменения уже опубликованной страницы становятся видны посетителям после сохранения. Удаление страницы удаляет также её блоки.

## Резервное копирование и восстановление

Регулярно копируй `/var/lib/wiki86/manuals.json`, особенно перед обновлением. В файле хранятся и черновики, и опубликованные страницы. Для восстановления останови службу, замени файл резервной копией, проверь владельца `wiki86:wiki86` и права `0600`, затем снова запусти службу. Если нужно восстановить пароль администратора, храни отдельную защищённую копию `/etc/wiki86.env`.

## Безопасность и ограничения

- Сессия администратора хранится в cookie с флагами HttpOnly и SameSite=Strict и действует 12 часов. После перезапуска сервера нужно войти заново.
- API конструктора работает на том же домене, ограничивает размер запросов и длину содержимого блоков.
- Изображения добавляются по HTTPS-ссылке; загрузка файлов изображений на сервер пока не предусмотрена.
- Поля «Твои данные» для инструкции Self-steal остаются в локальном хранилище браузера и не отправляются серверу.
- Локальный пароль `wiki86-preview` предназначен только для разработки. В production обязательно задай собственный `WIKI86_ADMIN_PASSWORD`.

## Протокольные мануалы и обновление сайта через Git

Протокольные страницы собираются из исходника `selfsteal-manual.mjs` и файла `scripts/build-protocol-manuals.mjs`. После правок выполни из корня репозитория:

```sh
node scripts/build-protocol-manuals.mjs
node scripts/export-manuals.mjs
```

Для публикации изменений в основной ветке:

```sh
git status --short
git add content/manuals.json content/navigation.json docs/manuals package.json scripts/build-protocol-manuals.mjs selfsteal-manual.mjs server.mjs README.md
git commit -m "Add protocol manuals"
git push origin main
```

На сервере, если `/opt/wiki86` является Git-клоном с настроенным доступом к origin, подтяни ветку и перезапусти службу:

```sh
cd /opt/wiki86
sudo git pull --ff-only origin main
sudo systemctl restart wiki86
sudo systemctl status wiki86 --no-pager
sudo journalctl -u wiki86 -n 80 --no-pager
```

При запуске сервер добавляет новые опубликованные мануалы и разделы из `content/` в постоянное хранилище `WIKI86_DATA_DIR`. Разовая миграция обновляет встроенный Self-steal до новой версии, сохраняя его ID. Перед обновлением сохрани резервную копию `/var/lib/wiki86/manuals.json`; после перезапуска открой раздел «Протоколы» и проверь несколько страниц.
