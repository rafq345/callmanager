const express = require('express');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const WebSocket = require('ws');
const fetch = require('node-fetch');
const FormData = require('form-data');

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws-proxy' });

// Разрешение CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Парсинг JSON и текстовых данных
app.use(express.json());
app.use(express.text({ type: ['application/sdp', 'text/plain'] }));

app.use(express.static('.'));

// Хранилище для API ключей по сессиям
const sessionConfigs = new Map();

// Проксирование WebSocket соединений
wss.on('connection', (clientWs, req) => {
    console.log('Клиент подключен');

    let openaiWs = null;
    let apiKey = null;
    let model = null;
    let voice = null;

    clientWs.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());

            // Первое сообщение содержит параметры подключения
            if (data.type === 'connect') {
                apiKey = data.apiKey;
                model = data.model || 'gpt-4o-realtime-preview-2024-10-01';
                voice = data.voice || 'alloy';

                if (!apiKey) {
                    clientWs.send(JSON.stringify({
                        type: 'error',
                        error: 'API ключ не предоставлен'
                    }));
                    return;
                }

                // Подключение к OpenAI Realtime API
                const wsUrl = `wss://api.openai.com/v1/realtime?model=${model}&voice=${voice}`;
                openaiWs = new WebSocket(wsUrl, {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'OpenAI-Beta': 'realtime=v1'
                    }
                });

                openaiWs.on('open', () => {
                    console.log('Подключено к OpenAI API');
                    clientWs.send(JSON.stringify({ type: 'connected' }));
                });

                openaiWs.on('message', (data) => {
                    // Пересылка сообщений от OpenAI к клиенту
                    if (clientWs.readyState === WebSocket.OPEN) {
                        // Логируем тип сообщения для отладки
                        if (Buffer.isBuffer(data) || data instanceof ArrayBuffer) {
                            // Бинарные данные
                            const size = Buffer.isBuffer(data) ? data.length : data.byteLength;
                            console.log('OpenAI -> Client: бинарные данные, размер:', size);
                            // Отправляем как есть
                            clientWs.send(data);
                        } else {
                            // Текстовые данные
                            try {
                                const msg = JSON.parse(data.toString());
                                if (msg.type) {
                                    console.log('OpenAI -> Client:', msg.type);
                                    // Если есть ошибка, логируем её подробно
                                    if (msg.type === 'error' || msg.error) {
                                        console.error('Ошибка от OpenAI:', JSON.stringify(msg, null, 2));
                                    }
                                }
                                // Отправляем как строку
                                clientWs.send(data.toString());
                            } catch (e) {
                                // Не JSON, отправляем как есть
                                console.log('OpenAI -> Client: не-JSON текст, размер:', data.length);
                                clientWs.send(data);
                            }
                        }
                    }
                });

                openaiWs.on('error', (error) => {
                    console.error('Ошибка OpenAI WebSocket:', error);
                    console.error('Детали ошибки:', {
                        message: error.message,
                        code: error.code,
                        stack: error.stack
                    });
                    if (clientWs.readyState === WebSocket.OPEN) {
                        clientWs.send(JSON.stringify({
                            type: 'error',
                            error: error.message || 'Ошибка подключения к OpenAI API'
                        }));
                    }
                });

                openaiWs.on('close', (code, reason) => {
                    console.log('Соединение с OpenAI закрыто. Код:', code, 'Причина:', reason?.toString() || 'нет причины');
                    console.log('Код закрытия:', code, 'означает:', code === 1000 ? 'нормальное закрытие' : code === 1001 ? 'удаленный узел ушел' : code === 1006 ? 'аномальное закрытие' : 'другое');
                    if (clientWs.readyState === WebSocket.OPEN) {
                        clientWs.send(JSON.stringify({ 
                            type: 'disconnected',
                            code: code,
                            reason: reason?.toString() || 'нет причины'
                        }));
                    }
                });

            } else if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
                // Пересылка остальных сообщений к OpenAI
                try {
                    const msg = JSON.parse(message.toString());
                    if (msg.type) {
                        console.log('Client -> OpenAI:', msg.type);
                        if (msg.type === 'session.update') {
                            console.log('Отправка session.update:', JSON.stringify(msg, null, 2));
                        }
                        if (msg.type === 'input_audio_buffer.append') {
                            // Логируем только первые несколько пакетов
                            if (Math.random() < 0.01) {
                                console.log('Отправка аудио пакета, размер:', msg.audio?.length || 0);
                            }
                        }
                    }
                } catch (e) {
                    // Бинарные данные
                    console.log('Client -> OpenAI: бинарные данные');
                }
                openaiWs.send(message);
            } else {
                console.warn('Попытка отправить сообщение, но OpenAI WebSocket не готов:', openaiWs?.readyState);
            }
        } catch (error) {
            console.error('Ошибка при обработке сообщения:', error);
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({
                    type: 'error',
                    error: error.message
                }));
            }
        }
    });

    clientWs.on('close', () => {
        console.log('Клиент отключен');
        if (openaiWs) {
            openaiWs.close();
        }
    });

    clientWs.on('error', (error) => {
        console.error('Ошибка клиентского WebSocket:', error);
    });
});

// Endpoint для WebRTC соединения
app.post('/realtime/calls', async (req, res) => {
    try {
        // Получаем данные из JSON тела запроса
        const { sdp: sdpOffer, model: modelParam, voice: voiceParam, instructions } = req.body;
        const apiKey = req.headers.authorization?.replace('Bearer ', '');
        const model = modelParam || 'gpt-realtime-mini';
        const voice = voiceParam || 'alloy';

        if (!apiKey) {
            return res.status(401).json({ error: 'API ключ не предоставлен' });
        }

        if (!sdpOffer) {
            return res.status(400).json({ error: 'SDP offer не предоставлен' });
        }

        console.log('Получен SDP offer для WebRTC, модель:', model, 'голос:', voice);

        // Создаем конфигурацию сессии
        const sessionConfigObj = {
            model: model,
            voice: voice,
            // Настройки для обработки прерываний
            turn_detection: {
                type: 'server_vad',
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 500,
                create_response: true,
                interrupt_response: true  // Разрешаем прерывание ответов
            }
        };
        
        // Добавляем системный промпт, если он есть
        if (instructions && instructions.trim() !== '') {
            sessionConfigObj.instructions = instructions;
            console.log('Системный промпт добавлен в конфигурацию сессии');
        }
        
        const sessionConfig = JSON.stringify(sessionConfigObj);

        // Отправляем SDP offer в OpenAI
        const formData = new FormData();
        formData.append('sdp', sdpOffer);
        formData.append('session', sessionConfig);

        const response = await fetch('https://api.openai.com/v1/realtime/calls', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'OpenAI-Beta': 'realtime=v1'
            },
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Ошибка от OpenAI API:', response.status, errorText);
            return res.status(response.status).send(errorText);
        }

        const sdpAnswer = await response.text();
        console.log('Получен SDP answer от OpenAI');
        
        // Сохраняем конфигурацию для этой сессии
        const sessionId = response.headers.get('x-session-id') || Date.now().toString();
        sessionConfigs.set(sessionId, { apiKey, model, voice });

        res.set('Content-Type', 'application/sdp');
        res.send(sdpAnswer);
    } catch (error) {
        console.error('Ошибка при обработке WebRTC запроса:', error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
    console.log('Откройте браузер и перейдите по адресу http://localhost:3000');
});
