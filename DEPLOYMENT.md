# Инструкция по развертыванию на VPS

## Изменения в коде

Приложение настроено для работы:
- На порту **4000** (вместо 3000)
- По подпути **/callmanager** (для работы вместе с другими приложениями на том же домене)

## Шаг 1: Обновление кода на сервере

```bash
cd /var/www/callmanager
git pull origin main
npm install --production
```

## Шаг 2: Обновление конфигурации PM2

Создайте или обновите файл `ecosystem.config.js`:

```bash
nano ecosystem.config.js
```

Вставьте следующее содержимое:

```javascript
module.exports = {
  apps: [{
    name: 'callmanager',
    script: './server.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 4000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_memory_restart: '500M'
  }]
};
```

Создайте директорию для логов:

```bash
mkdir -p logs
```

Перезапустите приложение:

```bash
pm2 delete callmanager  # Если уже запущено
pm2 start ecosystem.config.js
pm2 save
```

## Шаг 3: Обновление конфигурации nginx

Отредактируйте конфигурацию nginx:

```bash
sudo nano /etc/nginx/sites-available/callmanager
```

Вставьте следующую конфигурацию (замените `your-domain.com` на ваш домен):

```nginx
# HTTP сервер
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;
    # Или используйте IP, если нет домена:
    # server_name your-vps-ip;

    # Размеры для больших WebSocket сообщений
    client_max_body_size 10M;
    
    # CallManager приложение по пути /callmanager
    location /callmanager {
        # Убираем /callmanager из пути при проксировании
        rewrite ^/callmanager/?(.*)$ /$1 break;
        
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        
        # WebSocket поддержка
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # Базовые заголовки
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Таймауты для WebSocket
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
        proxy_connect_timeout 60;
        
        # Буферизация
        proxy_buffering off;
    }
    
    # WebSocket прокси для /callmanager/ws-proxy
    location /callmanager/ws-proxy {
        rewrite ^/callmanager/ws-proxy$ /ws-proxy break;
        
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Длинные таймауты для WebSocket
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
        proxy_connect_timeout 60;
        proxy_buffering off;
    }
    
    # Endpoint для WebRTC (если используется через сервер)
    location /callmanager/realtime {
        rewrite ^/callmanager/realtime/(.*)$ /realtime/$1 break;
        
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
        proxy_connect_timeout 60;
        proxy_buffering off;
    }
    
    # Ваше другое приложение (телефония) остается на корневом пути
    # Добавьте здесь конфигурацию для вашего другого приложения
    # location / {
    #     proxy_pass http://localhost:ДРУГОЙ_ПОРТ;
    #     ...
    # }
}
```

Проверьте и примените конфигурацию:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Шаг 4: Проверка работы

1. Откройте в браузере: `http://your-domain.com/callmanager` или `http://your-vps-ip/callmanager`
2. Проверьте логи:
   ```bash
   pm2 logs callmanager
   sudo tail -f /var/log/nginx/error.log
   ```

## Шаг 5: Настройка firewall (если нужно)

```bash
# Если используете UFW
sudo ufw allow 4000/tcp  # Для прямого доступа (если нужно)
sudo ufw status
```

## Полезные команды

```bash
# Просмотр статуса приложения
pm2 status

# Просмотр логов
pm2 logs callmanager

# Перезапуск приложения
pm2 restart callmanager

# Остановка
pm2 stop callmanager

# Мониторинг
pm2 monit

# Обновление кода из репозитория
cd /var/www/callmanager
git pull origin main
npm install --production
pm2 restart callmanager
```

## Устранение неполадок

**Приложение не открывается:**
- Проверьте, что приложение запущено: `pm2 status`
- Проверьте логи: `pm2 logs callmanager`
- Проверьте конфигурацию nginx: `sudo nginx -t`
- Проверьте, что порт 4000 слушается: `sudo netstat -tlnp | grep 4000`

**WebSocket не работает:**
- Убедитесь, что в nginx правильно настроены заголовки Upgrade и Connection
- Проверьте таймауты в конфигурации nginx
- Проверьте логи nginx: `sudo tail -f /var/log/nginx/error.log`

**Статические файлы не загружаются:**
- Убедитесь, что в nginx правильно настроен rewrite для /callmanager
- Проверьте, что base tag в index.html установлен правильно

