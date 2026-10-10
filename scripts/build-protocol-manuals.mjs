import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createSelfstealManual } from '../selfsteal-manual.mjs';

const root = new URL('../', import.meta.url);
const manualFile = new URL('content/manuals.json', root);
const navFile = new URL('content/navigation.json', root);
const manuals = JSON.parse(await readFile(manualFile, 'utf8')).filter((manual) => manual.path !== '/manual/protocols/trojan-reality-compatibility');
const selfstealManual = createSelfstealManual();
const selfstealIndex = manuals.findIndex((manual) => manual.path === selfstealManual.path);
if (selfstealIndex === -1) manuals.push(selfstealManual);
else manuals[selfstealIndex] = selfstealManual;
const nav = JSON.parse(await readFile(navFile, 'utf8'));
const blocksFor = [];

function buildManual({ title, slug, description, fields = [], content }) {
  let seq = 0;
  const blocks = [];
  const add = (type, data = {}) => {
    const block = { id: `${slug}-${++seq}`, type, ...data };
    blocks.push(block);
    return block;
  };
  if (fields.length) add('data', { title: 'Твои данные', fields });
  const text = (value) => add('text', { text: value });
  const note = (variant, title, value) => add('note', { variant, title, text: value });
  const heading = (title, level = '2') => add('heading', { title, level });
  const code = (language, value) => add('code', { language, code: value });
  const table = (headers, rows) => add('table', { headers, rows });
  const step = (title, items, number = String(seq + 1).padStart(2, '0')) => {
    const children = (Array.isArray(items) ? items : [items]).map((item) => typeof item === 'string' ? { id: randomUUID(), type: 'text', text: item } : { id: randomUUID(), ...item });
    return add('step', { title, number, showTitle: true, showNumber: true, items: children });
  };
  const data = (key, label, placeholder, help) => ({ key, label, placeholder, help });
  content({ text, note, heading, code, table, step, data, add });
  const networkGuide = networkGuides[slug];
  const certificateGuide = certificateGuides[slug];
  if (networkGuide || certificateGuide) {
    const additions = [];
    if (networkGuide) {
      additions.push({ id: `${slug}-network-prep`, type: 'step', number: '0', title: 'Проверь DNS, порт и firewall до запуска', showTitle: true, showNumber: true,
        items: [
          { id: `${slug}-network-dns`, type: 'text', text: networkGuide.dns },
          { id: `${slug}-network-check`, type: 'code', language: 'bash', code: networkGuide.check },
          { id: `${slug}-network-firewall`, type: 'code', language: 'bash', code: networkGuide.firewall },
          { id: `${slug}-network-note`, type: 'text', text: 'UFW — только firewall самой Ubuntu; если команда отсутствует, установи `sudo apt update && sudo apt install -y ufw`. Проверь также сетевой firewall/VPC у хостера. Не включай UFW вслепую: если он сейчас выключен и ты собираешься включить его, сначала разреши свой реальный SSH-порт (обычно `sudo ufw allow OpenSSH`), иначе можно потерять SSH-доступ. Node API порт панели отдельно ограничь IP-адресом Panel; не открывай его всему интернету.' }
        ]
      });
    }
    const insertAt = blocks.length && blocks[0].type === 'data' ? 1 : 0;
    blocks.splice(insertAt, 0, ...additions);
  }
  if (certificateGuide) {
    const certificate = certificateBlocks(slug, certificateGuide);
    const beforeIndex = blocks.findIndex((block) => block.title === certificateGuide.before);
    blocks.splice(beforeIndex < 0 ? blocks.length : beforeIndex, 0, ...certificate);
  }
  const hostGuide = hostGuides[slug];
  if (hostGuide) {
    const workflow = [];
    const makeStep = (id, number, title, lines) => workflow.push({
      id: `${slug}-${id}`, type: 'step', number, title, showTitle: true, showNumber: true,
      items: lines.map((line, i) => ({ id: `${slug}-${id}-${i + 1}`, type: 'text', text: line }))
    });
    workflow.push({ id: `${slug}-panel-workflow-title`, type: 'heading', level: '2', title: 'Примени inbound и подключи его к пользователям' });
    makeStep('node-setup', 'A', 'Создай ноду и включи Config Profile', [
      'Открой `Nodes → Management → Create new node`. Заполни страну и внутреннее имя ноды, а также адрес и порт Node API по инструкции установки Node. Это адрес управляющего соединения Panel ↔ Node; он не обязан совпадать с клиентским портом inbound.',
      'Открой карточку созданной ноды → `Change Profile` / `Select Config Profile`, выбери профиль, в котором сохранён этот inbound, и включи именно его в списке активных inbound ноды. Один профиль содержит полный Xray-конфиг и может включать несколько inbound.',
      'Сохрани изменения, дождись статуса Node `Online` и проверь, что нужный inbound включён/активен. Не создавай Host, пока Panel не видит ноду и inbound.'
    ]);
    makeStep('squad-access', 'B', 'Разреши inbound в Internal Squad и назначь squad пользователям', [
      'Открой `Internal Squads`, создай подходящую группу или отредактируй существующую. Включи в ней inbound из нужного Config Profile и сохрани группу.',
      'Открой карточку каждого нужного пользователя → `Access Settings` и добавь эту Internal Squad. Проверь членство именно у тех пользователей, которым должен быть доступ.',
      'Profile/Node активирует inbound технически; Internal Squad разрешает его пользователю. Если inbound не включён в squad или пользователь не назначен в эту squad, inbound не появится у него в доступах.'
    ]);
    makeStep('host-creation', 'C', 'Создай Host после активации ноды и inbound', [
      'Открой `Hosts → Create new host`. Выбери точный inbound (один inbound на один Host) из Config Profile, который уже назначен и активен на ноде.',
      'Задай понятный Remark и включи видимость Host. В `Address` укажи домен подключения, DNS которого ведёт на публичный IP этой ноды. Если перед нодой стоит CDN/reverse proxy, укажи клиентский адрес этой схемы, а не автоматически origin-домен.',
      'После выбора inbound `Port` обычно заполняется из его конфигурации. Оставь это значение, если нет намеренно настроенного внешнего порта/проброса. Host — клиентская точка входа, а не адрес Node API.'
    ]);
    workflow.push({ id: `${slug}-host-field-table`, type: 'table', headers: ['Поле Host', 'Что указать для этого мануала'], rows: hostGuide.rows });
    workflow.push({ id: `${slug}-host-note`, type: 'note', variant: 'info', title: 'Как работают advanced overrides', text: 'Advanced Options в Host переопределяет клиентские параметры, унаследованные от inbound. Пустое поле обычно означает «взять значение из inbound». `Security Layer` в актуальной панели имеет `DEFAULT`, `TLS` и `NONE`; `DEFAULT` наследует inbound, включая REALITY. Не выбирай TLS поверх REALITY и не сбрасывай безопасность в NONE без конкретной причины. ALPN — правильное написание (Application-Layer Protocol Negotiation); не путай его с `Host` HTTP-заголовком и SNI.' });
    makeStep('client-access-check', 'D', 'Проверь доступ пользователя', [
      'Убедись, что Host видим, привязан к нужному inbound, Node online, а тестовый пользователь назначен в Internal Squad с этим inbound.',
      'Импортируй свежую ссылку подписки в клиент, который поддерживает этот протокол/транспорт. Проверь реальные соединения и статистику в панели.'
    ]);
    const beforeIndex = blocks.findIndex((block) => block.title === hostGuide.before);
    blocks.splice(beforeIndex < 0 ? blocks.length : beforeIndex, 0, ...workflow);
  }
  const toc = blocks.filter((b) => b.type === 'step' || b.type === 'heading').map((b, i) => ({ id: `${slug}-toc-${i + 1}`, kind: 'block', title: b.title, blockId: b.id }));
  return {
    id: randomUUID(), title, category: 'protocols', slug,
    path: `/manual/protocols/${slug}`, description, icon: 'network',
    blockSpacing: 14, toc: { enabled: true, items: toc }, status: 'published', updated: false, blocks,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
}

const hostGuides = {
  'protocol-choice': { before: 'Что проверить перед запуском', rows: [
    ['Address', 'Домен этой ноды, резолвящийся в её публичный IP; для CDN — адрес CDN.'],
    ['Port', 'Порт выбранного inbound; после выбора inbound Panel подставит его автоматически.'],
    ['SNI', 'Для REALITY — значение из «Твои данные» (по умолчанию microsoft.com) и target. Для TLS/Hysteria — домен твоего сертификата.'],
    ['Host', 'Оставь пустым, если выбранный транспорт не использует HTTP Host. Для WS/XHTTP — только значение, совпадающее с inbound.'],
    ['Path', 'Оставь пустым для RAW/TCP. Для XHTTP/WS укажи тот же path, что и в inbound.'],
    ['Fingerprint', 'Выбери Firefox. Если клиент не поддерживает его, попробуй Safari или Edge из списка самого клиента; Chrome сейчас не рекомендуем.'],
    ['ALPN', 'Оставь по умолчанию; укажи h2 для gRPC, h3 для Hysteria 2, если эти параметры нужны выбранному клиенту.'],
    ['Security Layer', 'DEFAULT — унаследовать TLS/REALITY/none от inbound; не переопределяй без причины.']
  ] },
  'vless-reality': { before: 'Заполни Host в панели', rows: [
    ['Address', 'Домен/IP ноды, куда клиент подключается; для обычной схемы DNS ведёт на публичный IP ноды.'],
    ['Port', 'Порт inbound; автозаполняется после выбора.'],
    ['SNI', '{{SNI}} — должно совпадать с realitySettings.serverNames и именем target.'],
    ['Host', 'Не используется в RAW/TCP; оставь пустым.'], ['Path', 'Не используется в RAW/TCP; оставь пустым.'],
    ['Fingerprint', 'Выбери Firefox. Если клиент не поддерживает его, попробуй Safari или Edge из списка самого клиента; Chrome сейчас не рекомендуем.'],
    ['ALPN', 'Обычно оставь пустым/default; не добавляй без необходимости.'],
    ['Security Layer', 'DEFAULT: так Host наследует REALITY из inbound. Не переключай в TLS или NONE.']
  ] },
  'vless-xhttp-reality': { before: 'Настрой Host и клиент', rows: [
    ['Address', 'Домен/IP ноды или клиентский CDN-домен, если он действительно маршрутизирует XHTTP к этой ноде.'],
    ['Port', 'Порт inbound/XHTTP; обычно подставится автоматически.'],
    ['SNI', '{{SNI}} — должно совпадать с realitySettings.serverNames и target; это не обязательно Address ноды.'],
    ['Host', 'Оставь пустым, если `xhttpSettings.host` в inbound не задан. Иначе укажи в точности тот же HTTP Host.'],
    ['Path', 'В точности `xhttpSettings.path`, включая начальный `/`; например `{{XHTTP_PATH}}`.'],
    ['Fingerprint', 'Выбери Firefox; Safari или Edge подойдут, если они есть в клиенте. Chrome сейчас не рекомендуем.'],
    ['ALPN', 'Обычно default/пусто; оставь без override, если схема XHTTP явно не требует иного.'],
    ['Security Layer', 'DEFAULT: унаследовать REALITY из inbound. Не ставь TLS/NONE.']
  ] },
  'trojan-reality': { before: 'Настрой Host для Trojan + REALITY', rows: [
    ['Address', 'Домен/IP клиентского endpoint ноды; DNS должен приводить на правильный listener.'],
    ['Port', 'Порт Trojan inbound (например 8443); автоматически заполнится из inbound.'],
    ['SNI', '{{SNI}} — одинаковое значение в serverNames и target. Не оставляй пустым в обычной схеме.'],
    ['Host', 'Для RAW/TCP не используется; оставь пустым.'], ['Path', 'Для RAW/TCP не используется; оставь пустым.'],
    ['Fingerprint', 'Выбери Firefox; если его нет, Safari или Edge при наличии в клиенте. Chrome сейчас не рекомендуем.'],
    ['ALPN', 'Оставь пустым/default, если проверенная клиентская конфигурация не требует значения.'],
    ['Security Layer', 'DEFAULT: наследует REALITY. Выбор TLS подменит тип клиентской защиты и сломает эту связку.']
  ] },
  'trojan-tls': { before: 'Создай Host и пользователя', rows: [
    ['Address', 'Домен/IP клиентского TLS endpoint; обычно домен с A/AAAA на ноду или на TLS proxy.'],
    ['Port', 'Порт Trojan inbound; подставится из inbound.'],
    ['SNI', '{{SNI}} — домен, на который выпущен сертификат и который обслуживает TLS endpoint.'],
    ['Host', 'Не используется для RAW/TCP Trojan; оставь пустым.'], ['Path', 'Не используется для RAW/TCP; оставь пустым.'],
    ['Fingerprint', 'Выбери Firefox; Safari или Edge используй, если Firefox отсутствует в клиенте. Chrome сейчас не рекомендуем.'],
    ['ALPN', 'Оставь default или укажи согласованные TLS ALPN. Для gRPC нужен h2; для обычного Trojan не задавай h2 без поддержки listener.'],
    ['Security Layer', 'DEFAULT наследует TLS из inbound; явный TLS нужен только если Host должен его переопределить.']
  ] },
  'vless-grpc-reality': { before: 'Согласуй Host и клиента', rows: [
    ['Address', 'Домен/IP ноды или корректный публичный proxy endpoint.'], ['Port', 'Порт inbound; подтянется после выбора.'],
    ['SNI', '{{SNI}} — разрешённое REALITY serverName, согласованное с target.'],
    ['Host', 'Обычно оставить пустым; у gRPC serviceName задаётся в gRPC settings, это не HTTP Host.'],
    ['Path', 'Оставить пустым; здесь используется `serviceName`, а не URL path.'],
    ['Fingerprint', 'Выбери Firefox; если клиент его не поддерживает, Safari или Edge из доступного списка. Chrome сейчас не рекомендуем.'],
    ['ALPN', 'gRPC требует HTTP/2; оставь значение, генерируемое Host/клиентом, либо h2 если поле требуется.'],
    ['Security Layer', 'DEFAULT наследует REALITY. Не переопределяй в TLS/NONE.']
  ] },
  'vless-grpc-tls': { before: 'Настрой Host и проверку', rows: [
    ['Address', 'Домен/IP TLS endpoint; сертификат должен быть действителен для SNI.'], ['Port', 'Порт inbound; подтянется автоматически.'],
    ['SNI', '{{SNI}} — домен сертификата на конечном TLS endpoint.'], ['Host', 'Обычно пусто: gRPC использует serviceName.'], ['Path', 'Пусто: путь задаётся gRPC serviceName.'],
    ['Fingerprint', 'Выбери Firefox; Safari или Edge используй, если Firefox отсутствует в клиенте. Chrome сейчас не рекомендуем.'],
    ['ALPN', 'Установи h2: gRPC использует HTTP/2; proxy по пути тоже должен поддерживать gRPC/HTTP2.'],
    ['Security Layer', 'DEFAULT наследует TLS; TLS можно задать явно, если Host должен override.']
  ] },
  'hysteria2': { before: 'Настрой Host/клиент', rows: [
    ['Address', 'Публичный домен/IP ноды, доступный по UDP.'], ['Port', 'UDP порт inbound; подставится из профиля.'],
    ['SNI', '{{SNI}} — домен действительного TLS-сертификата, который использует Hysteria2.'], ['Host', 'Обычно пусто: Hysteria2 не использует HTTP Host override.'], ['Path', 'Пусто: это не path-based HTTP transport.'],
    ['Fingerprint', 'Для Hysteria оставь значение клиента по умолчанию, если поле не требуется. Если задаёшь fingerprint вручную — выбери Firefox или поддерживаемый Safari/Edge; не Chrome.'],
    ['ALPN', 'h3, если поле доступно/нужно клиенту; TLS inbound должен согласовывать h3.'],
    ['Security Layer', 'DEFAULT наследует TLS из Hysteria inbound; не выбирай NONE.']
  ] },
  'shadowsocks-2022': { before: 'Выпусти пользователя и настрой клиента', rows: [
    ['Address', 'Домен/IP endpoint, который доступен на выбранном Shadowsocks порту.'], ['Port', 'Порт inbound; подставится из профиля.'],
    ['SNI', 'Не используется без отдельного внешнего TLS слоя; оставь пустым.'], ['Host', 'Не используется; оставь пустым.'], ['Path', 'Не используется; оставь пустым.'],
    ['Fingerprint', 'Не используется без TLS/REALITY; оставь default.'], ['ALPN', 'Не используется; оставь default.'],
    ['Security Layer', 'DEFAULT наследует слой inbound; для обычного Shadowsocks это none. Не включай TLS override без поддержки клиента и Xray схемы.']
  ] }
};

const networkGuides = {
  'protocol-choice': { dns: 'Сначала реши, куда ведёт клиентский домен, и проверь доступность именно нужного протокола. TCP и UDP — разные правила, даже если у них одинаковый номер порта.', check: 'sudo ss -lntup\nsudo ufw status verbose', firewall: '# Примеры, не запускай оба правила автоматически:\n# TCP inbound (например, VLESS + REALITY): sudo ufw allow 443/tcp\n# UDP Hysteria 2: sudo ufw allow 443/udp' },
  'vless-reality': { dns: 'A-запись клиентского Address должна вести на публичный IPv4 ноды; AAAA добавляй только при работающем IPv6. REALITY использует отдельный внешний target/SNI, но сертификат для домена ноды не нужен.', check: 'getent ahostsv4 {{SERVER_IP}}\nsudo ss -lntp | grep -E ":{{SERVER_PORT}}\\b" || true', firewall: 'sudo ufw allow {{SERVER_PORT}}/tcp\nsudo ufw status numbered' },
  'vless-xhttp-reality': { dns: 'A-запись клиентского Address должна вести на ноду либо на действительно настроенный proxy/CDN. Убедись, что он пропускает этот TCP-трафик и XHTTP-параметры. Для REALITY свой сертификат не выпускают.', check: 'getent ahostsv4 {{SERVER_IP}}\nsudo ss -lntp | grep -E ":{{SERVER_PORT}}\\b" || true', firewall: 'sudo ufw allow {{SERVER_PORT}}/tcp\nsudo ufw status numbered' },
  'trojan-reality': { dns: 'A-запись клиентского Address должна вести на публичный listener ноды. REALITY target и SNI — отдельные параметры handshake; сертификат для собственного домена и Certbot этой схеме не нужны.', check: 'getent ahostsv4 {{SERVER_IP}}\nsudo ss -lntp | grep -E ":{{SERVER_PORT}}\\b" || true', firewall: 'sudo ufw allow {{SERVER_PORT}}/tcp\nsudo ufw status numbered' },
  'trojan-tls': { dns: 'A-запись {{NODE_DOMAIN}} должна вести на тот сервер, где принимается HTTP-01 проверка и клиентский TLS. При отдельной ноде и Panel смотри ниже шаг о доставке сертификата в Panel. При DNS-01 входящий TCP 80 не нужен.', check: 'getent ahostsv4 {{NODE_DOMAIN}}\nsudo ss -lntp | grep -E ":(80|{{SERVER_PORT}})\\b" || true', firewall: '# TCP 80 нужен только для HTTP-01\nsudo ufw allow 80/tcp\nsudo ufw allow {{SERVER_PORT}}/tcp\nsudo ufw status numbered' },
  'vless-grpc-reality': { dns: 'Клиентский Address должен вести к ноде или к proxy, который поддерживает нужный маршрут gRPC. REALITY SNI/target — отдельные параметры; собственный сертификат не нужен. Открой TCP, а не UDP.', check: 'getent ahostsv4 {{SERVER_IP}}\nsudo ss -lntp | grep -E ":{{SERVER_PORT}}\\b" || true', firewall: 'sudo ufw allow {{SERVER_PORT}}/tcp\nsudo ufw status numbered' },
  'vless-grpc-tls': { dns: 'A-запись {{NODE_DOMAIN}} должна вести на endpoint HTTP-01 проверки. Имя в сертификате, SNI и Host должны совпадать с доменной схемой. При отдельной Panel и Node прочитай шаг доставки файлов. При DNS-01 порт 80 не требуется.', check: 'getent ahostsv4 {{NODE_DOMAIN}}\nsudo ss -lntp | grep -E ":(80|{{SERVER_PORT}})\\b" || true', firewall: '# TCP 80 нужен только для HTTP-01\nsudo ufw allow 80/tcp\nsudo ufw allow {{SERVER_PORT}}/tcp\nsudo ufw status numbered' },
  'hysteria2': { dns: 'A-запись {{NODE_DOMAIN}} ведёт на ноду. Сам inbound Hysteria 2 использует UDP, но HTTP-01 для сертификата использует TCP 80. При DNS-01 порт 80 не требуется. Это два отдельных правила.', check: 'getent ahostsv4 {{NODE_DOMAIN}}\nsudo ss -lnup | grep -E ":{{SERVER_PORT}}\\b" || true\nsudo ss -lntp | grep -E ":80\\b" || true', firewall: 'sudo ufw allow {{SERVER_PORT}}/udp\n# TCP 80 открывай только если Certbot использует HTTP-01\nsudo ufw allow 80/tcp\nsudo ufw status numbered' },
  'shadowsocks-2022': { dns: 'Address должен разрешаться в публичный адрес сервера. Сертификат не нужен для обычного Shadowsocks 2022; TCP и UDP открывай только если их использует inbound и клиент.', check: 'getent ahostsv4 {{SERVER_IP}}\nsudo ss -lntup | grep -E ":{{SERVER_PORT}}\\b" || true', firewall: 'sudo ufw allow {{SERVER_PORT}}/tcp\n# Только если нужен UDP relay:\nsudo ufw allow {{SERVER_PORT}}/udp\nsudo ufw status numbered' }
};

const certificateGuides = {
  'trojan-tls': { before: 'Добавь Trojan inbound в Config Profile', port: 'TCP', supportsNginx: true },
  'vless-grpc-tls': { before: 'Создай inbound', port: 'TCP', supportsNginx: true },
  'hysteria2': { before: 'Добавь минимальный Hysteria inbound', port: 'UDP', supportsNginx: false }
};

function certificateBlocks(slug, guide) {
  const id = (name) => `${slug}-certificate-${name}`;
  const step = (name, title, lines) => ({ id: id(name), type: 'step', number: 'TLS', title, showTitle: true, showNumber: true, items: lines.map((line, index) => ({ id: `${id(name)}-${index + 1}`, type: 'text', text: line })) });
  const code = (name, language, value) => ({ id: id(name), type: 'code', language, code: value });
  const note = (name, variant, title, value) => ({ id: id(name), type: 'note', variant, title, text: value });
  const blocks = [
    { id: id('heading'), type: 'heading', level: '2', title: 'Выпусти сертификат на Ubuntu и передай его Remnawave' },
    step('dns', '1. Подготовь домен и порты', [
      'Создай A-запись `{{NODE_DOMAIN}}` на публичный IPv4 сервера, куда приходит проверка Let’s Encrypt. Убери неверную AAAA-запись, если IPv6 не настроен. Для HTTP-01 TCP-порт 80 должен быть доступен с интернета; также открой порт inbound из раздела выше.',
      'Проверь, какой процесс уже слушает порты. Certbot standalone временно занимает TCP 80. Если там уже работает nginx/Caddy/другой сайт, не останавливай его наугад: выбери webroot для существующего nginx или DNS-01 у своего DNS-провайдера.',
      'Порт inbound и порт Node API — разные вещи. Не выставляй Node API всему интернету; в firewall ноды разреши его только IP панели.'
    ]),
    code('dns-check', 'bash', 'getent ahostsv4 {{NODE_DOMAIN}}\nsudo ss -lntup | grep -E ":(80|{{SERVER_PORT}})\\b" || true\nsudo ufw status verbose'),
    step('certbot-install', '2. Установи Certbot (Ubuntu)', [
      'В примере используется официальный Snap-пакет Certbot. На обычном Ubuntu Server `snapd` может быть установлен заранее; команды безопасно проверят/обновят Snap Core.',
      'Не смешивай две установки Certbot: если `certbot` уже установлен через apt, проверь его версию и способ обновления или удали старый пакет перед переходом на Snap.'
    ]),
    code('install-certbot', 'bash', 'sudo apt update\nsudo apt install -y snapd\nsudo snap install core\nsudo snap refresh core\nsudo snap install --classic certbot\nsudo ln -sfn /snap/bin/certbot /usr/local/bin/certbot\ncertbot --version'),
    note('ports', 'warning', 'UFW и firewall хостера — отдельные слои', `UFW команды выше настраивают только Ubuntu. Разреши TCP 80 там, где выполняется HTTP-01 challenge (при DNS-01 он не нужен), и ${guide.port} порт inbound в панели хостинга/VPC. Для Hysteria 2 это UDP ${'{{SERVER_PORT}}'}; разрешение TCP 443 не открывает UDP 443. Если UFW выключен, не включай его, пока не разрешишь текущий SSH-порт.`),
    step('issue-standalone', '3. Выпусти сертификат, если TCP 80 свободен', [
      'Метод standalone не требует ставить nginx или Caddy: Certbot сам на несколько секунд поднимает HTTP-проверку на 80-м порту. DNS должен уже указывать на этот сервер, а порт 80 не должен быть занят.'
    ]),
    code('issue', 'bash', 'sudo certbot certonly --standalone --preferred-challenges http \\\n  --agree-tos --no-eff-email -m {{LE_EMAIL}} -d {{NODE_DOMAIN}}\nsudo certbot certificates'),
    ...(guide.supportsNginx ? [
      note('nginx-alternative', 'info', 'Если TCP 80 уже обслуживает nginx', 'Не запускай standalone и не останавливай сайт. Добавь location для ACME в уже существующий server-блок этого домена. Устанавливать второй nginx не нужно; если nginx ещё нет, ставь `sudo apt install -y nginx` только когда действительно хочешь использовать его как HTTP-сервер.'),
      code('webroot-nginx', 'nginx', 'location ^~ /.well-known/acme-challenge/ {\n    root /var/www/letsencrypt;\n    default_type text/plain;\n    try_files $uri =404;\n}'),
      code('issue-webroot', 'bash', 'sudo install -d -m 0755 /var/www/letsencrypt/.well-known/acme-challenge\nsudo nginx -t && sudo systemctl reload nginx\nsudo certbot certonly --webroot -w /var/www/letsencrypt \\\n  --agree-tos --no-eff-email -m {{LE_EMAIL}} -d {{NODE_DOMAIN}}\nsudo certbot certificates')
    ] : []),
    note('dns01', 'info', 'Если Panel и Node находятся на разных серверах', 'Можно выпустить сертификат прямо на сервере Panel методом DNS-01: Certbot подтверждает домен TXT-записью, поэтому входящий порт 80 не нужен и сертификат сразу окажется на машине с Docker mount. Установи официальный DNS-плагин именно своего DNS-провайдера и используй его инструкцию для credentials; для Cloudflare команда выглядит как `sudo snap install certbot-dns-cloudflare`, затем `sudo certbot certonly --dns-cloudflare --dns-cloudflare-credentials /root/.secrets/cloudflare.ini -d {{NODE_DOMAIN}} -m {{LE_EMAIL}}`. Не копируй этот plugin/флаг для другого DNS-провайдера. Если используешь HTTP-01 на Node, после каждого renewal нужно безопасно синхронизировать новые файлы на Panel.'),
    code('dns01-cloudflare', 'bash', '# Только если DNS обслуживает Cloudflare; для другого провайдера используй его Certbot plugin.\nsudo snap set certbot trust-plugin-with-root=ok\nsudo snap install certbot-dns-cloudflare\nsudo install -d -m 0700 /root/.secrets\nsudo nano /root/.secrets/cloudflare.ini\n# Файл cloudflare.ini:\n# dns_cloudflare_api_token = ВСТАВЬ_ОТДЕЛЬНЫЙ_API_TOKEN\nsudo chmod 0600 /root/.secrets/cloudflare.ini\nsudo certbot certonly --dns-cloudflare --dns-cloudflare-credentials /root/.secrets/cloudflare.ini \\\n  --agree-tos --no-eff-email -m {{LE_EMAIL}} -d {{NODE_DOMAIN}}\nsudo certbot certificates'),
    step('verify-cert', '4. Проверь сертификат и пути', [
      'Для Xray нужны `fullchain.pem` (сертификат вместе с цепочкой) и закрытый `privkey.pem`. Let’s Encrypt создаёт ссылки в `/etc/letsencrypt/live/{{NODE_DOMAIN}}/`; не копируй только leaf-сертификат вместо fullchain.',
      'Панель и Node могут быть на разных серверах. Файл `/etc/letsencrypt/...` на ноде автоматически не виден контейнеру Panel. Remnawave читает сертификаты из смонтированного каталога на сервере Panel и передаёт их Node при отправке конфигурации.'
    ]),
    code('verify-cert', 'bash', 'sudo openssl x509 -in /etc/letsencrypt/live/{{NODE_DOMAIN}}/fullchain.pem -noout -subject -issuer -dates\nsudo test -r /etc/letsencrypt/live/{{NODE_DOMAIN}}/privkey.pem && echo "private key readable by root"'),
    step('panel-mount', '5. Смонтируй сертификат в Remnawave Panel', [
      'На сервере Panel создай каталог-источник для файлов. Если Certbot и Panel на одной машине, используй локальное копирование ниже. Если сертификат выпущен на отдельной ноде, передай оба файла на Panel защищённым SSH/SCP; ниже есть пример разовой передачи. Для автоматического обновления разнесённых машин настрой повторную защищённую передачу в deploy-hook или выпусти сертификат на Panel через автоматический DNS-01 plugin.',
      'В `docker-compose.yml` именно сервиса Remnawave Panel/backend добавь bind mount к уже существующему списку `volumes` — не заменяй другие mounts целиком. Не добавляй его в Node compose: Panel читает эти файлы и передаёт их Node при применении Xray-конфигурации.',
      'Путь внутри контейнера укажи в JSON профиля. Не используй путь хоста `/etc/letsencrypt/...` как `keyFile`/`certificateFile`: его может не существовать внутри контейнера.'
    ]),
    code('panel-files', 'bash', '# Выполняй на Panel-сервере, если Certbot работает на этой же машине.\nsudo install -d -m 0750 /opt/remnawave/nginx\nsudo install -m 0644 /etc/letsencrypt/live/{{NODE_DOMAIN}}/fullchain.pem /opt/remnawave/nginx/fullchain.pem\nsudo install -m 0640 /etc/letsencrypt/live/{{NODE_DOMAIN}}/privkey.pem /opt/remnawave/nginx/privkey.key'),
    code('split-copy', 'bash', '# Разовая передача с Certbot-сервера на Panel-сервер.\n# Запусти от обычного sudo-пользователя на Certbot-сервере.\nsudo install -m 0644 /etc/letsencrypt/live/{{NODE_DOMAIN}}/fullchain.pem "$HOME/fullchain.pem"\nsudo install -m 0600 /etc/letsencrypt/live/{{NODE_DOMAIN}}/privkey.pem "$HOME/privkey.key"\nsudo chown "$USER:$USER" "$HOME/fullchain.pem" "$HOME/privkey.key"\nscp "$HOME/fullchain.pem" "$HOME/privkey.key" {{PANEL_SSH_USER}}@{{PANEL_HOST}}:/tmp/\n# Затем войди по SSH на Panel-сервер и установи файлы:\nsudo install -d -m 0750 /opt/remnawave/nginx\nsudo install -m 0644 /tmp/fullchain.pem /opt/remnawave/nginx/fullchain.pem\nsudo install -m 0640 /tmp/privkey.key /opt/remnawave/nginx/privkey.key\nsudo rm -f /tmp/fullchain.pem /tmp/privkey.key\n# Удали временные копии на Certbot-сервере после проверки:\nrm -f "$HOME/fullchain.pem" "$HOME/privkey.key"'),
    code('panel-compose', 'yaml', 'services:\n  remnawave:\n    volumes:\n      - "/opt/remnawave/nginx:/var/lib/remnawave/configs/xray/ssl:ro"'),
    code('panel-compose-apply', 'bash', '# Перейди в каталог, где находится docker-compose.yml Remnawave Panel.\ncd /path/to/remnawave-panel\nsudo docker compose config\nsudo docker compose up -d remnawave\nsudo docker compose exec remnawave ls -l /var/lib/remnawave/configs/xray/ssl'),
    note('split-hosts', 'warning', 'Разовая передача не настраивает автосинхронизацию', 'Код SCP выше переносит первичный сертификат. Для автопродления на отдельном Certbot-сервере настрой такой же защищённый перенос в deploy-hook; безопаснее автоматический DNS-01 plugin на сервере Panel, когда он доступен у твоего DNS-провайдера. Не оставляй закрытый ключ во временной папке и не давай публичный доступ к нему.'),
    code('xray-cert-paths', 'json', '"certificates": [\n  {\n    "certificateFile": "/var/lib/remnawave/configs/xray/ssl/fullchain.pem",\n    "keyFile": "/var/lib/remnawave/configs/xray/ssl/privkey.key"\n  }\n]'),
    step('renew', '6. Проверь автопродление и применение нового сертификата', [
      'Snap Certbot устанавливает timer автопродления. Убедись, что timer есть, и прогони тест без выпуска реального сертификата.',
      'Если используешь каталог Remnawave выше на том же сервере, настрой deploy-hook для копирования обновлённых файлов. Если сертификат на другой машине, deploy-hook должен безопасно доставлять новые файлы на сервер Panel — этот канал надо отдельно настроить.',
      'Certbot обновляет файл сертификата, но Node должен получить новую копию. После renewal проверь журнал/файлы и повторно отправь Xray-конфигурацию ноде способом, предусмотренным твоей версией Panel; затем проверь срок сертификата снаружи.'
    ]),
    code('renew-test', 'bash', 'systemctl list-timers --all | grep -i certbot || true\nsudo certbot renew --dry-run'),
    code('renew-hook', 'bash', 'sudo install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy\nsudo tee /etc/letsencrypt/renewal-hooks/deploy/remnawave-copy-cert >/dev/null <<\'HOOK\'\n#!/bin/sh\nset -eu\ncase " ${RENEWED_DOMAINS:-} " in\n  *" {{NODE_DOMAIN}} "*) ;;\n  *) exit 0 ;;\nesac\nDEST=/opt/remnawave/nginx\ninstall -m 0644 "$RENEWED_LINEAGE/fullchain.pem" "$DEST/fullchain.pem"\ninstall -m 0640 "$RENEWED_LINEAGE/privkey.pem" "$DEST/privkey.key"\nHOOK\nsudo chmod 0750 /etc/letsencrypt/renewal-hooks/deploy/remnawave-copy-cert\nsudo certbot renew --dry-run'),
    note('renew-limit', 'info', 'Что автоматизируется', 'Certbot автоматически продлевает сертификат; deploy-hook обновляет файлы каталога Panel. Передача нового сертификата с Panel на Node и перезагрузка Xray зависят от механизма синхронизации установленной версии Remnawave. После тестового подключения проверь фактические `notBefore/notAfter` у сертификата на клиентском порту.'),
    { id: id('official-sources'), type: 'step', number: 'TLS', title: 'Официальные источники', showTitle: true, showNumber: true, items: [
      { id: id('source-certbot'), type: 'text', text: '[Certbot: установка и автопродление](https://certbot.eff.org/instructions?os=snap&ws=nginx).' },
      { id: id('source-remna'), type: 'text', text: '[Remnawave Node: SSL-сертификаты, mount Panel и пути Xray](https://docs.rw/install/remnawave-node/).' },
      { id: id('source-firewall'), type: 'text', text: '[Ubuntu Server: UFW firewall](https://ubuntu.com/server/docs/firewalls/).' }
    ] }
  ];
  return blocks;
}

const manualsToAdd = [
  buildManual({ title: 'Какой протокол выбрать', slug: 'protocol-choice', description: 'Сравнение протоколов и транспортов Xray, которые можно использовать с Remnawave: ограничения, сценарии и критерии выбора.', fields: [
    { key: 'SERVER_DOMAIN', label: 'Домен ноды', placeholder: 'node.example.com', help: 'Нужен в вариантах с собственным TLS и для клиентского адреса.' },
    { key: 'SNI', label: 'SNI', placeholder: 'microsoft.com', help: 'REALITY: пример SNI. TLS/Hysteria: замени на домен своего сертификата.' },
    { key: 'SERVER_PORT', label: 'Порт подключения', placeholder: '443', help: 'Проверь, что порт разрешён у хостера и firewall.' },
    { key: 'CLIENT_APP', label: 'Клиентское приложение', placeholder: 'Например, v2rayNG', help: 'Поддержка транспорта и формата ссылки зависит от конкретного клиента.' }
  ], content: ({ text, note, heading, table, step }) => {
    text('Эта таблица помогает выбрать архитектуру, но не обещает обход блокировок или одинаковую работу у всех операторов. Выбирай по доступным портам, возможностям клиента, поддержке UDP, сертификатов и диагностике. Сначала подними один протокол на тестовом пользователе, проверь реальный трафик и только потом добавляй остальные inbound.');
    step('Слои: протокол, транспорт и защита', [
      'VLESS, Trojan, Shadowsocks и Hysteria — прокси-протоколы. RAW, XHTTP, gRPC, WebSocket, HTTPUpgrade, mKCP и Hysteria transport описывают способ доставки. TLS или REALITY — транспортная защита. Эти понятия нельзя взаимозаменять: например, XHTTP — транспорт, а не отдельный способ аутентификации.',
      'В Xray текущая матрица поддерживает REALITY только с RAW, XHTTP и gRPC. TLS поддерживается с RAW, XHTTP, mKCP, gRPC, WebSocket, HTTPUpgrade и Hysteria. Hysteria-протокол требует собственный Hysteria-транспорт и TLS; это QUIC поверх UDP.'
    ]);
    table(['Вариант', 'Сильные стороны', 'Ограничения / когда выбрать'], [
      ['VLESS + REALITY (RAW TCP)', 'Минимум компонентов, нет отдельного TLS-сертификата; широко используется и просто диагностируется.', 'Нужен достижимый TCP-порт и совместимый клиент. Хорошая базовая точка для одного пользователя/ноды.'],
      ['VLESS + XHTTP + REALITY', 'REALITY без собственного сертификата плюс HTTP-ориентированный транспорт; гибче для некоторых сетевых схем.', 'Больше параметров и чувствительность к версиям Xray/клиента. Выбирай, если клиент поддерживает XHTTP и есть измеримое преимущество.'],
      ['Trojan + REALITY (RAW/TCP)', 'Общая матрица Xray отмечает REALITY как поддерживаемую защиту Trojan; есть рабочие проверенные конфигурации.', 'Документация Xray противоречива: страница Trojan отдельно требует TLS. Сверь сборку Node/Xray и версию Panel; протестируй конкретную связку.'],
      ['Trojan + TLS', 'Простой TLS с собственным доменом/сертификатом; привычно для клиентов и прокси-инфраструктуры.', 'Нужны корректный DNS, TLS-сертификат и его продление. Удобен, когда сертификат и веб-инфраструктура уже есть.'],
      ['VLESS + gRPC + REALITY', 'gRPC поверх HTTP/2 с REALITY, если нужна такая клиентская/сетевой совместимость.', 'Сложнее диагностика и балансировка; нужен точный serviceName и поддержка gRPC клиентом. Для новой установки сначала сравни с XHTTP.'],
      ['VLESS + gRPC + TLS', 'Стандартная TLS-схема с HTTP/2; может пройти через инфраструктуру, уже настроенную под gRPC.', 'Нужны сертификат и HTTP/2 на маршруте. Проверь ALPN h2, serviceName и прокси/балансировщик.'],
      ['Self-steal (VLESS + REALITY + локальный сайт)', 'Вариант развёртывания REALITY с собственным доменом и локальным HTTPS fallback.', 'Это архитектурный вариант, а не новый протокол. Нужно аккуратно развести Xray, nginx, сертификат и порты; «обычный сайт» не гарантирует незаметность.'],
      ['Hysteria 2 (+ Salamander)', 'QUIC/UDP, отдельная congestion control; может быть полезен на сетях, где UDP доступен и TCP деградирует.', 'Проверь UDP у провайдера и firewall, поддержку клиента и учёт в версии Remnawave. Salamander — дополнительная обфускация, не замена TLS; одинаковый секрет нужен обеим сторонам.'],
      ['Shadowsocks 2022', 'Простой AEAD-прокси; семейство 2022 даёт современную аутентификацию и защиту от повторного воспроизведения.', 'Набор методов и выдача учётных данных должны совпадать с версией Panel/клиентов. Не копируй один общий пароль между пользователями.']
    ]);
    heading('Какие транспорты доступны в Xray');
    table(['Транспорт', 'Что учесть'], [
      ['RAW (старое имя TCP)', 'Базовая передача потока; не означает, что полезная нагрузка обязательно остаётся без TLS/REALITY.'],
      ['XHTTP', 'Современный HTTP-ориентированный транспорт; настройки режима/path должны совпасть на обеих сторонах.'],
      ['gRPC', 'HTTP/2, совпадающий serviceName, корректный ALPN/прокси-маршрут.'],
      ['WebSocket / HTTPUpgrade', 'Доступны с TLS, часто за reverse proxy; с REALITY не совместимы.'],
      ['mKCP', 'UDP-транспорт; с REALITY несовместим, используй лишь если UDP и клиент это поддерживают.'],
      ['Hysteria transport', 'Специализированный QUIC/UDP транспорт; требует TLS и согласованных Hysteria-параметров.']
    ]);
    heading('Протоколы Xray и уровень поддержки Remnawave');
    table(['Протокол Xray', 'Применение в Remnawave'], [
      ['VLESS, Trojan, Shadowsocks', 'Основные пользовательские протоколы панели: проверь Host, Squad и тип подписки в установленной версии.'],
      ['Hysteria', 'Xray inbound/transport для Hysteria 2. Panel добавляла генерацию ссылок; проверь поддержку конфигурации, клиентов и статистики по версии.'],
      ['VMess', 'Есть в Xray и совместимых клиентах, но не считай автоматически равным полностью управляемому пользовательскому inbound панели.'],
      ['HTTP и SOCKS', 'Xray умеет эти inbounds, но это не типовые публичные Hosts для обычных пользовательских подписок Remnawave.'],
      ['WireGuard / TUN', 'Есть в Xray-core соответствующих сборок; режимы, управление панелью и подписки зависят от версии.'],
      ['Tunnel / dokodemo-door', 'Служебные inbounds для маршрутизации/перенаправления, не типовые протоколы клиентских подписок.']
    ]);
    heading('Нужен ли сертификат и какие порты открыть?');
    table(['Вариант', 'Сертификат для своей ноды', 'Обычно открывают'], [
      ['VLESS/Trojan + REALITY', 'Нет. REALITY использует собственные ключи, а не сертификат Certbot на ноде.', 'TCP выбранного inbound.'],
      ['Trojan/VLESS + TLS', 'Да: домен, сертификат и закрытый ключ; для HTTP-01 нужен доступ к TCP 80.', 'TCP 80 для выпуска/продления и TCP порт TLS inbound.'],
      ['Hysteria 2', 'Да: TLS сертификат; HTTP-01 требует TCP 80.', 'UDP порт Hysteria 2 плюс TCP 80 для HTTP-01.'],
      ['Shadowsocks 2022', 'Не нужен для обычного inbound без внешнего TLS proxy.', 'TCP порт; UDP только если используется UDP relay.']
    ]);
    note('info', 'Не ставь лишний веб-сервер', 'Certbot standalone сам временно принимает проверку на TCP 80; для этого не требуется nginx или Caddy. Если порт 80 уже обслуживает сайт, сохрани существующую конфигурацию и используй webroot/DNS-01. Nginx/Caddy и Xray не могут одновременно слушать один и тот же IP:порт без специально настроенного proxy.');
    heading('Нужен ли сертификат и какие порты открыть?');
    table(['Вариант', 'Сертификат для своей ноды', 'Обычно открывают'], [
      ['VLESS/Trojan + REALITY', 'Нет. REALITY использует собственные ключи, а не сертификат Certbot на ноде.', 'TCP выбранного inbound.'],
      ['Trojan/VLESS + TLS', 'Да: домен, сертификат и закрытый ключ; для HTTP-01 нужен доступ к TCP 80.', 'TCP 80 для выпуска/продления и TCP порт TLS inbound.'],
      ['Hysteria 2', 'Да: TLS сертификат; HTTP-01 требует TCP 80.', 'UDP порт Hysteria 2 плюс TCP 80 для HTTP-01.'],
      ['Shadowsocks 2022', 'Не нужен для обычного inbound без внешнего TLS proxy.', 'TCP порт; UDP только если используется UDP relay.']
    ]);
    note('info', 'Не ставь лишний веб-сервер', 'Certbot standalone сам временно принимает проверку на TCP 80; для этого не требуется nginx или Caddy. Если порт 80 уже обслуживает сайт, сохрани существующую конфигурацию и используй webroot/DNS-01. Nginx/Caddy и Xray не могут одновременно слушать один и тот же IP:порт без специально настроенного proxy.');
    note('info', 'Проверяй поддержку на трёх уровнях', '1) Xray-core принимает конфиг; 2) Remnawave умеет управлять пользователями/Host для inbound; 3) клиент умеет импортировать ссылку и подключиться. Наличие inbound в JSON не гарантирует генерацию подписки или статистику.');
    note('warning', 'Не путай поддержку Xray и готовность панели', 'Config Profile Remnawave — полный шаблон Xray для ноды. Наличие протокола в Xray не означает автоматически, что конкретная версия Panel умеет управлять пользователями, выдавать совместимые подписки и отображать статистику. Для нестандартного inbound сверяй changelog Remnawave и тестируй подписку выбранного клиента.');
    step('Практический выбор', [
      'Начни с VLESS + REALITY (RAW), если нужен простой базовый inbound и клиент поддерживает REALITY.',
      'Выбери XHTTP + REALITY после проверки версии ядра/клиента и тестового подключения. Не добавляй сложные extra-поля «на всякий случай».',
      'Выбирай Trojan + TLS или gRPC + TLS, если у тебя есть домен, корректный сертификат и инфраструктура для TLS/HTTP/2.',
      'Пробуй Hysteria2, когда UDP доступен и нужен QUIC-путь; измерь потери, задержку и расход батареи на мобильной сети.',
      'Используй Shadowsocks 2022 только при совпадении поддерживаемых cipher method и формата ключей во всех компонентах.'
    ]);
    step('Что проверить перед запуском', [
      'Версии Remnawave Panel, Node, Xray-core и клиента; для каждого транспорта поддержка должна быть на всех концах.',
      'Публичный порт, TCP/UDP доступность у хостера, firewall ОС и внешний firewall.',
      'DNS A/AAAA: не оставляй неверную AAAA-запись, если у ноды нет работающего IPv6.',
      'Назначение inbound Node и пользователю через нужные внутренние группы; проверь именно выданную клиентскую ссылку.',
      'Логи и реальный трафик. HTTP-код тестового запроса сам по себе не подтверждает успешную работу туннеля.'
    ]);
    step('Источники и область применимости', [
      { type: 'text', text: 'Матрица транспортов и REALITY/TLS: [Xray Transport Configuration](https://xtls.github.io/en/config/transport.html). Управление профилями: [Remnawave Config Profiles](https://docs.rw/learn-en/config-profiles/). Hysteria2 и Salamander: [официальная документация Hysteria 2](https://v2.hysteria.network/docs/advanced/Full-Server-Config/). Поддержку функций Panel сверяй с [официальными release notes](https://f.docs.rw/).' }
    ]);
  }}),

  buildManual({ title: 'VLESS + REALITY (RAW TCP)', slug: 'vless-reality', description: 'Настрой базовый VLESS inbound с REALITY в Remnawave: ключи, short ID, Host, проверка и диагностика.', fields: [
    { key: 'SNI', label: 'SNI / server name', placeholder: 'microsoft.com', help: 'Значение автоматически подставится в target и serverNames.' },
    { key: 'SERVER_PORT', label: 'Порт inbound', placeholder: '443', help: 'TCP-порт, открытый на ноде.' },
    { key: 'SERVER_IP', label: 'Публичный IP ноды', placeholder: '203.0.113.10', help: 'В клиентском Host это может быть IP или домен ноды.' },
  ], content: ({ text, note, heading, code, step }) => {
    text('Config Profile — полный Xray JSON для Node. Создай копию профиля перед правкой, сохрани существующие outbounds/routing, добавь inbound и назначь профиль нужной ноде. Пользовательские credentials и Host создаются средствами Remnawave; не вставляй статический UUID в общий профиль.');
    note('info', 'Сертификат на своей ноде не нужен', 'Для VLESS + REALITY не устанавливай Certbot, nginx или Caddy только ради inbound. Нужны REALITY private key/shortId на сервере и соответствующие public key/shortId клиенту. `target` — отдельный внешний адрес REALITY, не сертификат твоего домена. Открой выбранный TCP-порт inbound.');
    step('Предварительные условия', [
      'Актуальные и совместимые версии Panel, Node, Xray-core и клиентского приложения.',
      'Выбранный TCP-порт доступен извне. Если используешь 443, убедись, что его не занимает другой listener.',
      'REALITY target отвечает на TLS с нужным SNI с самой ноды. Это не домен пользователя, если ты специально не настраиваешь Self-steal.',
      'Нода онлайн, а тестовый пользователь включён в группу, которой разрешён этот inbound.'
    ]);
    step('Создай или скопируй Config Profile', [
      'Открой Config Profiles и создай профиль из актуальной схемы Xray. Добавь объект inbound в массив inbounds; не замещай существующий полный профиль этим фрагментом.',
      'В Remnawave назначь профиль ноде, включи inbound в соответствующей внутренней группе и проверь его статус.'
    ]);
    code('JSON', '{\n  "tag": "VLESS_REALITY_RAW",\n  "listen": "0.0.0.0",\n  "port": {{SERVER_PORT}},\n  "protocol": "vless",\n  "settings": {\n    "clients": [],\n    "decryption": "none"\n  },\n  "sniffing": {\n    "enabled": true,\n    "destOverride": ["http", "tls", "quic"]\n  },\n  "streamSettings": {\n    "network": "raw",\n    "security": "reality",\n    "realitySettings": {\n      "show": false,\n      "target": "{{SNI}}:443",\n      "xver": 0,\n      "serverNames": ["{{SNI}}"],\n      "privateKey": "СГЕНЕРИРУЙ_В_REMANAWAVE",\n      "shortIds": ["СГЕНЕРИРУЙ_В_REMANAWAVE"]\n    }\n  }\n}');
    note('warning', 'Ключи и идентификаторы', 'Сгенерируй privateKey и shortId для сервера в панели или поддерживаемой утилите Xray. privateKey остаётся только на сервере. Клиенту передаются соответствующий public key и shortId через Host/ссылку. Не используй ключ из чужого конфига и не публикуй секреты.');
    step('Заполни Host в панели', [
      'Создай Host для нужного inbound и укажи адрес подключения {{SERVER_IP}}, порт {{SERVER_PORT}}, SNI {{SNI}} и public key/shortId, полученные из server-side REALITY параметров.',
      'Flow `xtls-rprx-vision` применяй только если он включён и поддерживается версией Xray и клиентом. Для проверки сначала оставь остальные необязательные поля по умолчанию.'
    ]);
    step('Проверка и диагностика', [
      'Проверь внешний TCP listener: `nc -vz {{SERVER_IP}} {{SERVER_PORT}}` (доступность порта не подтверждает REALITY-аутентификацию).',
      'Подключись реальным клиентом по ссылке из панели, открой сайт через туннель и проверь статистику пользователя/логи Node.',
      'Если клиент не подключается: сверь address/port, SNI/serverNames, public key, shortId, flow, время системы, DNS и firewall.',
      'Если inbound не стартует: валидность JSON, уникальность tag/port и соответствие полям текущей версии Xray.'
    ]);
    step('Источники', [{ type: 'text', text: '[Xray REALITY](https://xtls.github.io/en/config/transports/reality.html) · [Xray RAW](https://xtls.github.io/en/config/transports/raw.html) · [Remnawave Config Profiles](https://docs.rw/learn-en/config-profiles/) · [Remnawave Hosts](https://docs.rw/learn-en/hosts/).' }]);
  }}),

  buildManual({ title: 'VLESS + XHTTP + REALITY', slug: 'vless-xhttp-reality', description: 'Настрой XHTTP транспорт с REALITY и проверь совпадение серверных и клиентских параметров.', fields: [
    { key: 'SNI', label: 'SNI / server name', placeholder: 'microsoft.com', help: 'Автоматически подставится в target и serverNames.' },
    { key: 'SERVER_IP', label: 'Публичный IP ноды', placeholder: '203.0.113.10', help: 'Адрес подключения клиента.' },
    { key: 'SERVER_PORT', label: 'Порт XHTTP', placeholder: '443', help: 'TCP listener inbound.' },
    { key: 'XHTTP_PATH', label: 'Путь XHTTP', placeholder: '/', help: 'Должен совпадать в Host и Xray.' },
    { key: 'XHTTP_MODE', label: 'Режим XHTTP', placeholder: 'auto', help: 'Используй режим, поддерживаемый обеими версиями.' },
  ], content: ({ text, note, code, step }) => {
    text('XHTTP — транспорт, VLESS — протокол, REALITY — защита транспорта. Серверная и клиентская стороны должны совпадать по режиму и пути. Начни с минимальной конфигурации; не добавляй экспериментальные `extra` параметры, пока базовое подключение не работает.');
    note('info', 'Сертификат Certbot не требуется', 'REALITY использует собственные ключи и внешний target; сертификат на ноде не нужен. Не ставь nginx/Caddy только ради этого inbound. Для прямого подключения открой TCP {{SERVER_PORT}}; TCP 80 не требуется. Если перед нодой CDN/proxy, проверь его поддержку XHTTP и REALITY.');
    step('Подготовь сервер', [
      'Проверь доступность порта {{SERVER_PORT}} по TCP и совместимость версий Xray-core на Node и клиента.',
      'По умолчанию target — {{SNI}}:443. Проверь соединение с VPS. Если выберешь другую цель, измени SNI в «Твои данные»: он обновится и в target, и в serverNames. Не смешивай внешний target и собственный fallback Self-steal.',
      'Сделай копию Config Profile и добавь inbound в inbounds; оставь прочие секции профиля без изменений.'
    ]);
    code('JSON', '{\n  "tag": "VLESS_XHTTP_REALITY",\n  "listen": "0.0.0.0",\n  "port": {{SERVER_PORT}},\n  "protocol": "vless",\n  "settings": {"clients": [], "decryption": "none"},\n  "sniffing": {\n    "enabled": true,\n    "destOverride": ["http", "tls", "quic"]\n  },\n  "streamSettings": {\n    "network": "xhttp",\n    "security": "reality",\n    "xhttpSettings": {\n      "mode": "{{XHTTP_MODE}}",\n      "path": "{{XHTTP_PATH}}"\n    },\n    "realitySettings": {\n      "show": false,\n      "target": "{{SNI}}:443",\n      "xver": 0,\n      "serverNames": ["{{SNI}}"],\n      "privateKey": "СГЕНЕРИРУЙ_В_REMANAWAVE",\n      "shortIds": ["СГЕНЕРИРУЙ_В_REMANAWAVE"]\n    }\n  }\n}');
    note('warning', 'Не вставляй ключи из примера', 'Создай privateKey и shortId заново для своего inbound. Клиент получит public key, UUID, SNI, shortId, XHTTP mode/path через корректно настроенный Host и ссылку. Не копируй приватный ключ в пользовательские поля.');
    step('Настрой Host и клиент', [
      'В Host выбери этот inbound, укажи адрес {{SERVER_IP}}, порт {{SERVER_PORT}}, SNI {{SNI}} и созданные для этого inbound REALITY параметры.',
      'Укажи тот же XHTTP mode `{{XHTTP_MODE}}` и path `{{XHTTP_PATH}}`. Если панель формирует ссылку автоматически, проверь её параметры в тестовом клиенте.',
      'Пользователь должен быть привязан к Node/группе с разрешённым inbound.'
    ]);
    step('Проверь подключение', [
      'Включи тестовый клиент и проверь реальный веб-трафик и статус/статистику в Panel.',
      'HTTP 400 на запросе curl к корню может быть нормальным для XHTTP endpoint; он не подтверждает работоспособность клиентского туннеля.',
      'При сбое по очереди проверь порт, JSON/логи Xray, client core, mode/path, SNI, ключ, shortId и отсутствие несовместимого прокси перед Node.'
    ]);
    step('Источники', [{ type: 'text', text: '[Xray XHTTP](https://xtls.github.io/en/config/transports/xhttp.html) · [Xray REALITY](https://xtls.github.io/en/config/transports/reality.html) · [Xray transport matrix](https://xtls.github.io/en/config/transport.html) · [Remnawave Config Profiles](https://docs.rw/learn-en/config-profiles/).' }]);
  }}),

  buildManual({ title: 'Trojan + REALITY (RAW TCP)', slug: 'trojan-reality', description: 'Рабочее сочетание Trojan + REALITY поверх RAW/TCP: Config Profile, Node, Internal Squad, Host и проверка клиента.', fields: [
    { key: 'SNI', label: 'SNI / server name', placeholder: 'microsoft.com', help: 'Автоматически подставится в target и serverNames.' },
    { key: 'SERVER_IP', label: 'Публичный адрес ноды', placeholder: '203.0.113.10', help: 'Address для клиента; DNS должен вести на ноду.' },
    { key: 'SERVER_PORT', label: 'Порт Trojan inbound', placeholder: '8443', help: 'TCP listener, разрешённый в firewall.' },
  ], content: ({ text, note, code, step }) => {
    text('Ты прав: твой Trojan + REALITY конфиг проверен и работает. Я ошибочно объявил сочетание неподдерживаемым. В документации Xray есть расхождение: общая таблица совместимости помечает Trojan + REALITY как supported, а отдельная страница Trojan говорит, что Trojan должен использовать TLS. Поэтому опирайся на проверенную связку и фактические версии Node/Xray/Panel, а не переноси ограничение одной страницы на все сборки. REALITY применим с RAW, XHTTP и gRPC; `tcp` может выступать legacy-именем RAW/TCP.');
    note('info', 'Собственный TLS-сертификат не нужен', 'В этом inbound включён REALITY, а не обычный `security: tls`. Не выпускай Certbot-сертификат для него и не запускай nginx/Caddy на том же TCP-порту. Открой TCP {{SERVER_PORT}}. Для Trojan с собственным сертификатом смотри отдельный мануал Trojan + TLS.');
    note('info', 'Что делает каждый слой', 'Trojan отвечает за протокол и пароль пользователя. REALITY выполняет внешний TLS-подобный handshake и проверку параметров клиента. Получается Trojan внутри RAW/TCP + REALITY. Это не Trojan + собственный TLS-сертификат.');
    step('Подготовь параметры', [
      'Выбери TCP порт {{SERVER_PORT}} и проверь, что он свободен и открыт в firewall/у провайдера.',
      'SNI по умолчанию microsoft.com, поэтому target автоматически станет microsoft.com:443. Проверь доступность этого адреса с VPS. Если используешь другой target, замени SNI в «Твои данные»: значение обновится и в target, и в serverNames.',
      'Создай копию Config Profile и добавь inbound. Пользовательские Trojan credentials оставь Remnawave, если профиль обслуживает Panel.'
    ]);
    code('JSON', '{\n  "tag": "TROJAN_REALITY_RAW",\n  "listen": "0.0.0.0",\n  "port": {{SERVER_PORT}},\n  "protocol": "trojan",\n  "settings": {"clients": []},\n  "sniffing": {\n    "enabled": true,\n    "destOverride": ["http", "tls", "quic"]\n  },\n  "streamSettings": {\n    "network": "raw",\n    "security": "reality",\n    "realitySettings": {\n      "show": false,\n      "target": "{{SNI}}:443",\n      "xver": 0,\n      "shortIds": ["СГЕНЕРИРУЙ_В_REMANAWAVE"],\n      "privateKey": "СГЕНЕРИРУЙ_В_REMANAWAVE",\n      "serverNames": ["{{SNI}}"]\n    }\n  }\n}');
    note('warning', 'О конфиге из сообщения', 'Значения `privateKey` и `serverNames` в сообщении пустые/обезличенные; их нельзя оставлять пустыми в обычной настройке. `shortIds: [""]` допустим в Xray и означает пустой shortId, если сервер и клиент используют его одинаково. `target: ":443"` — нестандартная запись без hostname. Раз она прошла твой тест, сохрани её как проверенный вариант этой среды; для переносимого примера указывай явный `host:port` и проверяй fallback отдельно.');
    note('warning', 'Проверь версии и формат', 'Из-за расхождения в документации поведение зависит от конкретной версии/сборки Xray и реализации Panel. Если inbound запускается, но пользователь не подключается, сверяй сгенерированную Trojan-ссылку и параметры REALITY (SNI/serverName, public/private key, shortId, fingerprint), затем смотри логи Node. Не заменяй рабочий `target: ":443"` на другое значение без повторной проверки; для переносимого примера используй явно проверенный target и порт.');
    step('Настрой Host для Trojan + REALITY', [
      'Создай Host с этим inbound. Клиенту нужны Trojan password, REALITY public key, shortId, SNI и совместимый fingerprint; Panel должна сформировать ссылку для выбранного клиента.',
      'Оставь `Security Layer` в `DEFAULT`, чтобы Host унаследовал REALITY, а не подменил его на TLS.'
    ]);
    step('Создай пользователя и проверь соединение', [
      'Создай пользователя Trojan в Remnawave, добавь его в нужную Internal Squad и выдай свежую ссылку подписки.',
      'Импортируй ссылку в клиент с поддержкой Trojan + REALITY. Проверь handshake, Trojan-аутентификацию и появление статистики пользователя.',
      'При ошибке отдельно сверяй address/port, SNI, public key, shortId, fingerprint, Trojan password и членство в Squad. Открытый TCP-порт не подтверждает работу этих уровней.'
    ]);
    step('Источники', [{ type: 'text', text: '[Xray transport compatibility matrix](https://xtls.github.io/en/config/transport.html) · [Xray Trojan inbound](https://xtls.github.io/en/config/inbounds/trojan.html) · [Xray REALITY](https://xtls.github.io/en/config/transports/reality.html).' }]);
  }}),

  buildManual({ title: 'Trojan + TLS', slug: 'trojan-tls', description: 'Настрой Trojan inbound с собственным доменом и сертификатом, затем подключи тестового пользователя.', fields: [
    { key: 'NODE_DOMAIN', label: 'Домен TLS / сертификата', placeholder: 'node.example.com', help: 'Имя сертификата; SNI клиента должно совпадать с ним.' },
    { key: 'SNI', label: 'SNI для Host', placeholder: 'microsoft.com', help: 'Для TLS обязательно замени на домен своего сертификата; microsoft.com здесь только пример.' },
    { key: 'SERVER_IP', label: 'IP ноды', placeholder: '203.0.113.10', help: 'Адрес сервера/Host для клиента.' },
    { key: 'SERVER_PORT', label: 'Порт TLS inbound', placeholder: '443', help: 'Порт, куда реально приходит TLS соединение.' },
    { key: 'LE_EMAIL', label: 'Почта Certbot', placeholder: 'you@example.com', help: 'Для уведомлений о сертификате; подставится в команду Certbot.' },
    { key: 'PANEL_SSH_USER', label: 'SSH-пользователь Panel (если другой сервер)', placeholder: 'ubuntu', help: 'Учетная запись для защищённой передачи сертификата.' },
    { key: 'PANEL_HOST', label: 'Адрес сервера Panel (если другой сервер)', placeholder: 'panel.example.com', help: 'IP или домен, куда отправляются файлы сертификата.' },
    { key: 'CERT_PATH', label: 'Путь certificateFile в Panel', placeholder: '/var/lib/remnawave/configs/xray/ssl/fullchain.pem', help: 'Путь внутри backend-контейнера Panel после Docker mount.' },
    { key: 'KEY_PATH', label: 'Путь keyFile в Panel', placeholder: '/var/lib/remnawave/configs/xray/ssl/privkey.key', help: 'Закрытый ключ; не публикуй и не добавляй в репозиторий.' }
  ], content: ({ text, note, code, step }) => {
    text('Этот вариант использует настоящий TLS-сертификат для домена. SNI задаётся в Host/клиенте, а не отдельным полем inbound JSON; значение SNI должно совпадать с доменом сертификата. Поэтому замени пример microsoft.com в «Твои данные» на {{NODE_DOMAIN}}. Для Remnawave путь в профиле должен указывать на смонтированный сертификат внутри backend-контейнера Panel; сама Panel передаёт файлы ноде при применении конфигурации.');
    step('Подготовь домен и сертификат', [
      'Создай DNS A-запись на {{SERVER_IP}}. AAAA добавляй только если IPv6 действительно работает на Node.',
      'Выпусти сертификат на {{NODE_DOMAIN}} и настрой автоматическое продление. Проверь срок, цепочку и соответствие имени.',
      'Открой TCP {{SERVER_PORT}} и не допускай конфликта с nginx/Caddy или другим inbound.'
    ]);
    step('Добавь Trojan inbound в Config Profile', [
      'Сохрани копию профиля. Ниже показаны поля TLS; структура credentials зависит от интеграции панели. В Remnawave используй её поддерживаемую схему управления пользователями, не зашивай пароль отдельного клиента в общий профиль.',
      'Если TLS завершается на reverse proxy, укажи маршрут до Xray и корректно передавай TCP/TLS по схеме, поддерживаемой выбранным proxy. Не включай TLS одновременно в двух слоях без намерения.'
    ]);
    code('JSON', '{\n  "tag": "TROJAN_TLS",\n  "listen": "0.0.0.0",\n  "port": {{SERVER_PORT}},\n  "protocol": "trojan",\n  "settings": {\n    "clients": []\n  },\n  "streamSettings": {\n    "network": "raw",\n    "security": "tls",\n    "tlsSettings": {\n      "alpn": ["h2", "http/1.1"],\n      "certificates": [\n        {\n          "certificateFile": "{{CERT_PATH}}",\n          "keyFile": "{{KEY_PATH}}"\n        }\n      ]\n    }\n  }\n}');
    note('warning', 'Формат inbound зависит от Remnawave', 'В стандартной конфигурации Xray Trojan задаёт пользователей в `settings.users` с паролями. Remnawave управляет клиентами панели и формирует credentials для Node отдельно; используй шаблон, ожидаемый именно твоей версией Panel. Не подменяй `clients`/`users` наугад и проверь сгенерированный Node config.');
    step('Создай Host и пользователя', [
      'Создай Host на этот inbound: адрес {{SERVER_IP}}, порт {{SERVER_PORT}}, server name/SNI {{SNI}}.',
      'Добавь тестового пользователя, выдай ссылку подписки через панель и проверь, что выбранный клиент поддерживает Trojan и принимает TLS-сертификат.',
      'Не включай режим обхода проверки сертификата в клиенте. Исправь DNS/SNI/цепочку сертификата вместо отключения валидации.'
    ]);
    step('Проверка и продление', [
      'Проверь порт с внешней машины и TLS-сертификат с SNI {{SNI}}.',
      'Подключи клиента и проверь трафик/статистику в Panel. Простой curl к порту не проверяет Trojan credentials.',
      'При ошибке проверь доступность cert/key из контейнера, права чтения, срок сертификата, ALPN, порт и формат user credentials.',
      'После обновления сертификата перезагрузи/примени конфигурацию Xray только поддерживаемым способом и проверь новый срок.'
    ]);
    code('tls-check', 'bash', 'openssl s_client -connect {{NODE_DOMAIN}}:{{SERVER_PORT}} -servername {{SNI}} -verify_return_error </dev/null');
    note('tls-check-note', 'info', 'Как читать результат', 'Успешная TLS-проверка заканчивается `Verify return code: 0 (ok)`. Если соединение не открывается — сначала проверь DNS, порт/firewall и кто слушает порт; если ошибка имени/цепочки — SNI, fullchain и дату сертификата. Проверка TLS не заменяет тест Trojan-пароля в клиенте.');
    step('Источники', [{ type: 'text', text: '[Xray Trojan inbound](https://xtls.github.io/en/config/inbounds/trojan.html) · [Xray TLS](https://xtls.github.io/en/config/transports/tls.html) · [Remnawave Config Profiles](https://docs.rw/learn-en/config-profiles/) · [Remnawave Hosts](https://docs.rw/learn-en/hosts/).' }]);
  }}),

  buildManual({ title: 'VLESS + gRPC + REALITY', slug: 'vless-grpc-reality', description: 'Настрой gRPC транспорт с REALITY, совпадающим serviceName и клиентскими параметрами.', fields: [
    { key: 'SNI', label: 'SNI / server name', placeholder: 'microsoft.com', help: 'Автоматически подставится в target и serverNames.' },
    { key: 'SERVER_IP', label: 'IP ноды', placeholder: '203.0.113.10', help: 'Публичный адрес подключения.' },
    { key: 'SERVER_PORT', label: 'Порт', placeholder: '443', help: 'TCP-порт inbound.' },
    { key: 'GRPC_SERVICE', label: 'gRPC serviceName', placeholder: 'grpc', help: 'Должен совпадать на клиенте и сервере.' },
  ], content: ({ text, note, code, step }) => {
    text('gRPC — транспорт поверх HTTP/2, а REALITY — защита транспорта. Сочетание поддерживается Xray, но оно требует точного совпадения имени сервиса и всех REALITY параметров. Для новой установки сравни его с XHTTP: официальные материалы Xray сейчас рекомендуют оценивать XHTTP для новых схем.');
    note('info', 'Сертификат Certbot не нужен', 'При gRPC + REALITY на своей ноде не выпускай TLS-сертификат и не устанавливай nginx/Caddy ради inbound. REALITY использует отдельные ключи; открой TCP {{SERVER_PORT}}. `serviceName` — параметр gRPC, а не путь к сертификату или HTTP Host.');
    step('Проверь инфраструктуру', [
      'Проверь порт {{SERVER_PORT}} и доступность {{SNI}}:443 с Node.',
      'Убедись, что клиентское приложение поддерживает VLESS gRPC + REALITY и текущие версии Xray.',
      'Если трафик идёт через reverse proxy/load balancer, он должен корректно поддерживать HTTP/2 и не менять gRPC serviceName.'
    ]);
    code('JSON', '{\n  "tag": "VLESS_GRPC_REALITY",\n  "listen": "0.0.0.0",\n  "port": {{SERVER_PORT}},\n  "protocol": "vless",\n  "settings": {"clients": [], "decryption": "none"},\n  "streamSettings": {\n    "network": "grpc",\n    "security": "reality",\n    "grpcSettings": {\n      "serviceName": "{{GRPC_SERVICE}}",\n      "multiMode": false\n    },\n    "realitySettings": {\n      "show": false,\n      "target": "{{SNI}}:443",\n      "xver": 0,\n      "serverNames": ["{{SNI}}"],\n      "privateKey": "СГЕНЕРИРУЙ_В_REMANAWAVE",\n      "shortIds": ["СГЕНЕРИРУЙ_В_REMANAWAVE"]\n    }\n  }\n}');
    note('warning', 'Генерация и безопасность', 'Сгенерируй privateKey и shortIds индивидуально для inbound. Не используй ключ из присланного исходного JSON — он считался раскрытым в переписке. Клиенту нужны только соответствующие публичные параметры.');
    step('Согласуй Host и клиента', [
      'В Host укажи {{SERVER_IP}}:{{SERVER_PORT}}, SNI {{SNI}}, public key, shortId и gRPC serviceName `{{GRPC_SERVICE}}`.',
      'Оставь `multiMode: false`, если клиент и сценарий не требуют иного; усложняй транспорт после того, как простой режим заработал.',
      'Проверь, что пользователь назначен на группу с доступом к inbound.'
    ]);
    step('Проверь и устрани сбои', [
      'Подключи реальный клиент, создай трафик и проверь статус/статистику в панели.',
      'При timeout проверь порт/firewall и что Node слушает inbound. При TLS/REALITY ошибках проверь SNI, target, public key и shortId.',
      'При gRPC ошибке проверь HTTP/2, serviceName и отсутствие несовместимого промежуточного proxy. Не считай открытый TCP-порт достаточной проверкой.'
    ]);
    step('Источники', [{ type: 'text', text: '[Xray gRPC](https://xtls.github.io/en/config/transports/grpc.html) · [Xray REALITY](https://xtls.github.io/en/config/transports/reality.html) · [Xray transport matrix](https://xtls.github.io/en/config/transport.html).' }]);
  }}),

  buildManual({ title: 'VLESS + gRPC + TLS', slug: 'vless-grpc-tls', description: 'Настрой gRPC поверх HTTP/2 с собственным TLS-сертификатом и проверяемым продлением.', fields: [
    { key: 'NODE_DOMAIN', label: 'Домен TLS / сертификата', placeholder: 'node.example.com', help: 'DNS и сертификат должны соответствовать этому имени.' },
    { key: 'SNI', label: 'SNI для Host', placeholder: 'microsoft.com', help: 'Замени на домен из своего TLS-сертификата.' },
    { key: 'SERVER_IP', label: 'IP ноды', placeholder: '203.0.113.10', help: 'Публичный endpoint.' },
    { key: 'SERVER_PORT', label: 'Порт inbound', placeholder: '443', help: 'TCP-порт TLS endpoint.' },
    { key: 'GRPC_SERVICE', label: 'gRPC serviceName', placeholder: 'grpc', help: 'Совпадает на клиенте, proxy и Xray.' },
    { key: 'LE_EMAIL', label: 'Почта Certbot', placeholder: 'you@example.com', help: 'Для уведомлений о сертификате; подставится в команду Certbot.' },
    { key: 'PANEL_SSH_USER', label: 'SSH-пользователь Panel (если другой сервер)', placeholder: 'ubuntu', help: 'Учетная запись для защищённой передачи сертификата.' },
    { key: 'PANEL_HOST', label: 'Адрес сервера Panel (если другой сервер)', placeholder: 'panel.example.com', help: 'IP или домен, куда отправляются файлы сертификата.' },
    { key: 'CERT_PATH', label: 'Путь certificateFile в Panel', placeholder: '/var/lib/remnawave/configs/xray/ssl/fullchain.pem', help: 'Путь внутри backend-контейнера Panel после Docker mount.' },
    { key: 'KEY_PATH', label: 'Путь keyFile в Panel', placeholder: '/var/lib/remnawave/configs/xray/ssl/privkey.key', help: 'Закрытый ключ; ограничь права, не коммить в Git.' }
  ], content: ({ text, note, code, step }) => {
    text('TLS выдаёт сертификат домена; gRPC требует HTTP/2 и одинаковый serviceName на обоих концах. SNI задаётся на стороне Host/клиента и должен совпадать с доменом сертификата — в inbound JSON отдельное поле SNI не добавляй. В Remnawave смонтируй сертификат в backend Panel и укажи его внутренний путь в Config Profile. Если TLS завершает reverse proxy, не включай второй TLS-слой в Xray без специальной схемы.');
    step('Подготовь DNS, сертификат и порт', [
      'Направь A/AAAA для {{NODE_DOMAIN}} на endpoint. Удали неверные AAAA записи.',
      'Выпусти сертификат с полной цепочкой и настрой автоматическое продление. Не отключай TLS-проверку клиента.',
      'Открой TCP {{SERVER_PORT}} в firewall/панели хостинга. При reverse proxy убедись в поддержке HTTP/2 и корректной маршрутизации gRPC.'
    ]);
    step('Создай inbound', [
      'Скопируй существующий Config Profile, сохрани outbounds/routing и добавь inbound. Используй схему credentials, поддерживаемую версией Remnawave.',
      'Значения `certificateFile` и `keyFile` должны существовать внутри среды, где запускается Xray. Подтверди mount и доступ чтения до применения.'
    ]);
    code('JSON', '{\n  "tag": "VLESS_GRPC_TLS",\n  "listen": "0.0.0.0",\n  "port": {{SERVER_PORT}},\n  "protocol": "vless",\n  "settings": {"clients": [], "decryption": "none"},\n  "streamSettings": {\n    "network": "grpc",\n    "security": "tls",\n    "grpcSettings": {\n      "serviceName": "{{GRPC_SERVICE}}",\n      "multiMode": false\n    },\n    "tlsSettings": {\n      "alpn": ["h2"],\n      "certificates": [\n        {\n          "certificateFile": "{{CERT_PATH}}",\n          "keyFile": "{{KEY_PATH}}"\n        }\n      ]\n    }\n  }\n}');
    note('warning', 'Никакого fallback на REALITY', 'Для TLS используй `security: tls`, для REALITY — отдельный inbound с `security: reality`. Не смешивай обе защиты в одном streamSettings и не указывай `h2` на сервере, если proxy перед ним фактически терминирует TLS иначе.');
    step('Настрой Host и проверку', [
      'Host должен указывать {{SERVER_IP}}:{{SERVER_PORT}}, SNI {{SNI}} и serviceName `{{GRPC_SERVICE}}`.',
      'Создай тестового пользователя и проверь подписку в совместимом клиенте.',
      'Проверь сертификат с SNI, HTTP/2 ALPN и логи Xray. Для gRPC endpoint обычный curl GET не заменяет проверку клиента.',
      'После продления сертификата проверь его срок, перечитай файлы и примени конфигурацию штатно.'
    ]);
    code('grpc-tls-check', 'bash', 'openssl s_client -connect {{NODE_DOMAIN}}:{{SERVER_PORT}} -servername {{SNI}} -alpn h2 -verify_return_error </dev/null');
    note('grpc-tls-check-note', 'info', 'Проверь ALPN', 'В результате TLS handshake должна согласоваться `ALPN protocol: h2`. Если ALPN отсутствует, проверь TLS endpoint и reverse proxy; если TLS проходит, но gRPC-клиент не подключается, сверяй serviceName и HTTP/2-маршрут.');
    step('Источники', [{ type: 'text', text: '[Xray gRPC](https://xtls.github.io/en/config/transports/grpc.html) · [Xray TLS](https://xtls.github.io/en/config/transports/tls.html) · [Remnawave Config Profiles](https://docs.rw/learn-en/config-profiles/).' }]);
  }}),

  buildManual({ title: 'Hysteria 2 и Salamander в Remnawave', slug: 'hysteria2', description: 'Разбери UDP/QUIC inbound Hysteria2 в Xray, настрой TLS и при необходимости Salamander, затем проверь совместимость клиента и панели.', fields: [
    { key: 'NODE_DOMAIN', label: 'Домен сертификата', placeholder: 'node.example.com', help: 'Имя, для которого выпущен сертификат.' },
    { key: 'SNI', label: 'SNI для Host', placeholder: 'microsoft.com', help: 'Замени на домен из сертификата; он должен совпадать с NODE_DOMAIN.' },
    { key: 'SERVER_IP', label: 'IP ноды', placeholder: '203.0.113.10', help: 'Убедись, что UDP до него проходит.' },
    { key: 'SERVER_PORT', label: 'UDP порт', placeholder: '443', help: 'Разреши именно UDP, а не только TCP.' },
    { key: 'LE_EMAIL', label: 'Почта Certbot', placeholder: 'you@example.com', help: 'Для уведомлений о сертификате; подставится в команду Certbot.' },
    { key: 'PANEL_SSH_USER', label: 'SSH-пользователь Panel (если другой сервер)', placeholder: 'ubuntu', help: 'Учетная запись для защищённой передачи сертификата.' },
    { key: 'PANEL_HOST', label: 'Адрес сервера Panel (если другой сервер)', placeholder: 'panel.example.com', help: 'IP или домен, куда отправляются файлы сертификата.' },
    { key: 'CERT_PATH', label: 'Путь certificateFile в Panel', placeholder: '/var/lib/remnawave/configs/xray/ssl/fullchain.pem', help: 'Путь внутри backend-контейнера Panel после Docker mount.' },
    { key: 'KEY_PATH', label: 'Путь keyFile в Panel', placeholder: '/var/lib/remnawave/configs/xray/ssl/privkey.key', help: 'Закрытый ключ; не коммить.' },
    { key: 'HY2_UP_MBIT', label: 'Лимит/оценка upload', placeholder: '25 mbps', help: 'Подставляй только если настроен и понятен режим congestion control.' },
    { key: 'HY2_DOWN_MBIT', label: 'Лимит/оценка download', placeholder: '25 mbps', help: 'Не указывай выше устойчивой скорости VPS/канала.' }
  ], content: ({ text, note, code, step }) => {
    text('Ниже — шаблон именно для Xray-core/Remnawave Config Profile, соответствующий классу присланного JSON: `protocol: hysteria`, `network: hysteria`, TLS и опциональный FinalMask UDP Salamander. Это не YAML-конфигурация отдельного Hysteria 2 daemon. SNI задаётся в Host/клиенте и должен совпадать с доменом сертификата; замени microsoft.com на {{NODE_DOMAIN}}. В TLS inbound не добавляй выдуманное поле serverName. Поддержка inbound, генерации subscription links, client apps и статистики зависит от установленной версии Remnawave/Node/Xray — сверь release notes и сначала проверь на отдельном тестовом пользователе.');
    note('warning', 'Не ставь обычный HTTP proxy перед UDP inbound', 'Hysteria 2 работает через QUIC/UDP. Стандартный nginx `proxy_pass` и обычный Caddy HTTP reverse_proxy не пересылают такой inbound как HTTP-сайт. Подключай клиента к UDP endpoint ноды; proxy используй только если он явно поддерживает нужный L4/QUIC passthrough.');
    note('warning', 'Секрет из присланного JSON считать раскрытым', 'Пароль Salamander был включён в сообщённый конфиг. Создай новый случайный пароль и замени его и на сервере, и во всех клиентах. Не вставляй пароль в публичный Config Profile или скриншоты.');
    step('Проверь UDP и совместимость', [
      'Уточни, что VPS, облачный firewall и локальный firewall пропускают UDP {{SERVER_PORT}} в обе стороны. Проверка только TCP недостаточна.',
      'Проверь, что выбранные Node/Xray и клиент поддерживают Hysteria2, FinalMask Salamander и совместный формат subscription.',
      'В Xray Hysteria использует UDP/QUIC. Он не становится TCP-транспортом от назначения порта 443.'
    ]);
    step('Подготовь TLS-файлы', [
      'Выпусти сертификат для {{NODE_DOMAIN}} и настрой автоматическое продление. В «Твои данные» замени пример SNI на {{NODE_DOMAIN}}: SNI клиента должен совпадать с доменом сертификата.',
      'Укажи пути к fullchain/key из смонтированного каталога backend Panel. Remnawave передаёт сертификат Node при применении профиля; не считай путь `/etc/letsencrypt` на Panel автоматически существующим внутри контейнера.'
    ]);
    step('Добавь минимальный Hysteria inbound', [
      'Добавь объект в массив inbounds существующего профиля. Пароль пользователя/аутентификацию должен управлять Remnawave для выбранной версии; не встраивай общий пароль в профиль вручную.',
      'Сначала запусти без Salamander и необязательных congestion/packetSize overrides. После подтверждения базового подключения добавь одинаковый Salamander secret на обеих сторонах, если это действительно нужно.'
    ]);
    code('JSON', '{\n  "tag": "HYSTERIA2_UDP",\n  "listen": "0.0.0.0",\n  "port": {{SERVER_PORT}},\n  "protocol": "hysteria",\n  "settings": {\n    "clients": [],\n    "version": 2\n  },\n  "sniffing": {"enabled": false},\n  "streamSettings": {\n    "network": "hysteria",\n    "security": "tls",\n    "tlsSettings": {\n      "alpn": ["h3"],\n      "certificates": [\n        {\n          "certificateFile": "{{CERT_PATH}}",\n          "keyFile": "{{KEY_PATH}}"\n        }\n      ]\n    },\n    "finalmask": {\n      "udp": [\n        {\n          "type": "salamander",\n          "settings": {\n            "password": "СГЕНЕРИРУЙ_ОТДЕЛЬНО_И_ВСТАВЬ_В_ЗАЩИЩЕННОМ_РЕДАКТОРЕ"\n          }\n        }\n      ],\n      "quicParams": {\n        "brutalUp": "{{HY2_UP_MBIT}}",\n        "brutalDown": "{{HY2_DOWN_MBIT}}",\n        "congestion": "brutal",\n        "maxIdleTimeout": 60\n      }\n    },\n    "hysteriaSettings": {"version": 2}\n  }\n}');
    note('info', 'Подстановка чувствительных полей', 'Секрет Salamander намеренно не помещён в форму: она сохраняет значения в браузере. Сгенерируй новый секрет отдельно, вставь непосредственно в защищённый редактор профиля и передай его клиенту защищённым способом. Ограничения скорости в примере — только исходные настройки; измерь реальную полосу и убери quicParams, если ядро их не поддерживает.');
    note('info', 'Проверка TLS для Hysteria 2', 'Hysteria 2 устанавливает TLS внутри QUIC/UDP. Обычный `openssl s_client` проверяет TCP TLS и здесь не подтверждает работу протокола. Проверь сертификат и handshake из совместимого Hysteria2-клиента, затем сверь Xray/Node logs.');
    step('Настрой Host/клиент', [
      'Создай inbound/Host и пользователя штатным способом. Укажи {{SERVER_IP}}, {{SERVER_PORT}}, SNI {{SNI}}, TLS-проверку включённой.',
      'Если клиентская ссылка содержит `obfs=salamander`, пароль должен точно совпасть с inbound. Не меняй только одну сторону.',
      'Проверь, что выдаваемый клиентский формат действительно `hysteria2://` или поддерживается выбранным приложением.'
    ]);
    step('Тест и устранение проблем', [
      'Подключись по UDP с внешней сети; проверяй клиентский лог, Xray log, Node status и реальные передачи данных.',
      'Если timeout — сначала UDP/firewall, затем DNS, TLS/SNI и порт. Если подключение работает, но статистики нет, проверь известные ограничения/исправления текущего релиза Remnawave.',
      'Если после включения Salamander перестало подключаться — сверь пароль/имя метода и версию клиента. Убери Salamander для контрольного теста.',
      'Не включай UDP кэш/проксирование CDN, который не поддерживает QUIC/Hysteria passthrough.'
    ]);
    step('Источники', [{ type: 'text', text: '[Xray transport configuration](https://xtls.github.io/en/config/transport.html) · [Hysteria 2 full server config: Salamander](https://v2.hysteria.network/docs/advanced/Full-Server-Config/) · [Hysteria 2 URI scheme](https://v2.hysteria.network/docs/developers/URI-Scheme/) · [Remnawave releases](https://f.docs.rw/).' }]);
  }}),

  buildManual({ title: 'Shadowsocks 2022', slug: 'shadowsocks-2022', description: 'Настрой управляемый Shadowsocks inbound с методом 2022, проверь ключи и совместимость клиентов.', fields: [
    { key: 'SERVER_IP', label: 'IP / домен сервера', placeholder: '203.0.113.10', help: 'Адрес Host для пользователя.' },
    { key: 'SERVER_PORT', label: 'Порт', placeholder: '8388', help: 'Свободный порт; разреши TCP и при необходимости UDP.' },
    { key: 'SS_METHOD', label: 'Cipher method', placeholder: '2022-blake3-aes-128-gcm', help: 'Выбирай только метод, поддерживаемый твоими версиями Panel, Xray и клиента.' }
  ], content: ({ text, note, code, step, table }) => {
    text('Xray-core поддерживает семейство Shadowsocks 2022 (`2022-blake3-aes-128-gcm`, `2022-blake3-aes-256-gcm`, `2022-blake3-chacha20-poly1305`). Документация Remnawave для управляемого Shadowsocks указывает `chacha20-ietf-poly1305`, а SS2022 использует отдельный формат ключей. Поэтому этот мануал разделяет нативную возможность Xray и готовую поддержку Panel: не вставляй SS2022 inbound в production Config Profile, пока установленная версия Remnawave явно не умеет создавать пользователей и ссылки для него.');
    note('warning', 'Ключи — не обычные пароли', 'Методы 2022 используют ключи заданного формата/длины. Генерируй их штатным инструментом или панелью; не придумывай строку вручную. Не публикуй Base64 key в Git, screenshot, чате или браузерной форме «Твои данные».');
    step('Выбери метод и проверь совместимость', [
      'Уточни, что выбранный cipher `{{SS_METHOD}}` есть в текущем Xray-core, Remnawave UI/API и клиенте каждого устройства.',
      'Не называй `2022-blake3-aes-128-gcm` универсальным выбором, если установленная сборка его не перечисляет. Актуальные списки методов меняются; опирайся на версию компонентов.',
      'Реши, нужен ли UDP relay; открой соответствующие TCP/UDP правила. Не назначай порт 443 автоматически, если его уже использует другой сервис.'
    ]);
    step('Что требует протокол SS2022', [
      'Xray задаёт method на inbound и использует server pre-shared key. Для multi-user SS2022 формат пользовательских credentials зависит от server key и user key; клиенту передают корректно собранную пару.',
      'Remnawave должен генерировать оба значения и выдавать ссылку для выбранного клиента. Стандартное поле SS Password само по себе не доказывает, что этот workflow реализован.',
      'Если установленная Panel не подтверждает SS2022 поддержку, используй управляемый Shadowsocks `chacha20-ietf-poly1305` или разворачивай отдельный Xray без интеграции учётных записей панели.'
    ]);
    code('JSON', '{\n  "tag": "SHADOWSOCKS_2022_STANDALONE_REFERENCE",\n  "listen": "0.0.0.0",\n  "port": {{SERVER_PORT}},\n  "protocol": "shadowsocks",\n  "settings": {\n    "method": "{{SS_METHOD}}",\n    "password": "СЛУЧАЙНЫЙ_SERVER_PSK_BASE64",\n    "network": "tcp,udp",\n    "users": [\n      {\n        "password": "SERVER_PSK:СЛУЧАЙНЫЙ_USER_PSK_BASE64",\n        "email": "user-01"\n      }\n    ]\n  }\n}');
    note('warning', 'Справочный фрагмент Xray-core, не готовый профиль Remnawave', 'Генерируй ключи в требуемой длине и формате для выбранного cipher. Для SS2022 user password должен включать корректные server и user keys. Не применяй этот блок в Remnawave, пока не подтвердил, что Panel сохранит эти поля и выдаст соответствующую клиентскую ссылку.');
    step('Выпусти пользователя и настрой клиента', [
      'Если твоя версия Panel явно поддерживает SS2022, создай тестового пользователя и проверь, что ссылка содержит совместимый method/key. Иначе этот раздел не превращает inbound в управляемый протокол панели.',
      'Импортируй ссылку в клиент, который прямо поддерживает именно выбранный 2022 method. Старые клиенты могут принимать ссылку, но не подключаться.',
      'Ограничивай число методов/портов и выдавай ключ каждому пользователю отдельно.'
    ]);
    step('Проверь трафик и ротацию', [
      'Проверь TCP, затем UDP (если нужен) с реальным клиентом; оцени статистику панели.',
      'При ошибках сравни cipher, формат/длину ключа, URL encoding и версии клиента/сервера. Отключи другие входящие фильтры только после диагностики.',
      'При утечке или смене пользователя отзови credentials в Panel и создай новые. Не пытайся «отозвать» общий статический ключ, не обновив все клиенты.'
    ]);
    table(['Проверка', 'Ожидание'], [
      ['Cipher method', 'Совпадает в серверном inbound и клиентском профиле.'],
      ['Ключ', 'Сгенерирован штатно, индивидуален, правильного формата; отсутствует в документации/репозитории.'],
      ['Сеть', 'Доступны нужные TCP и UDP порты, а не только один из них.'],
      ['Управление', 'Подписка и статистика подтверждены на версии Remnawave, которая используется.']
    ]);
    step('Источники', [{ type: 'text', text: '[Xray Shadowsocks: SS2022 methods and key format](https://xtls.github.io/en/config/inbounds/shadowsocks.html) · [Remnawave server routing: managed Shadowsocks method](https://docs.rw/learn/server-routing/) · [Remnawave Config Profiles](https://docs.rw/learn-en/config-profiles/) · [Remnawave releases](https://f.docs.rw/).' }]);
  }})
];

for (const m of manualsToAdd) {
  const existingIndex = manuals.findIndex((old) => old.path === m.path);
  if (existingIndex >= 0) {
    m.id = manuals[existingIndex].id;
    manuals[existingIndex] = m;
  } else manuals.push(m);
}
await writeFile(manualFile, `${JSON.stringify(manuals, null, 2)}\n`, 'utf8');
const protocols = nav.sections.find((section) => section.id === 'protocols');
if (!protocols) throw new Error('Missing protocols navigation section');
protocols.manualIds = [...manualsToAdd.map((m) => m.id), '86000000-0000-4000-8000-000000000086'];
await writeFile(navFile, `${JSON.stringify(nav, null, 2)}\n`, 'utf8');
console.log(`Built ${manualsToAdd.length} protocol manuals:`);
for (const m of manualsToAdd) console.log(`${m.title}\t${m.path}`);
