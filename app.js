// Глобальные переменные
let mediaStream = null;
let audioContext = null;
let websocket = null;
let peerConnection = null; // WebRTC соединение
let audioQueue = [];
let isConnected = false;
let isMuted = false;
let currentSystemPrompt = '';
let currentTranscript = '';
let initTimeout = null;
let sessionReady = false; // Флаг готовности сессии для отправки аудио
let connectionMonitorInterval = null; // Интервал для мониторинга соединения
let keepAliveInterval = null; // Интервал для keep-alive соединения
let isAIResponding = false; // Флаг, что ИИ сейчас отвечает
let lastUserSpeechTime = 0; // Время последней речи пользователя
let remoteAudioElement = null; // Элемент для воспроизведения удаленного аудио
let diagnosticsLog = []; // Лог диагностики
let lastAudioActivityTime = 0; // Время последней активности аудио
let audioActivityMonitorInterval = null; // Интервал мониторинга аудио
let websocketReconnectAttempts = 0; // Счетчик попыток переподключения WebSocket
let websocketReconnectTimeout = null; // Таймаут переподключения WebSocket
let websocketApiKey = null; // API ключ для переподключения
let websocketModel = null; // Модель для переподключения
let websocketVoice = null; // Голос для переподключения

// Элементы DOM
const apiKeyInput = document.getElementById('apiKey');
const toggleApiKeyBtn = document.getElementById('toggleApiKey');
const microphoneSelect = document.getElementById('microphone');
const speakerSelect = document.getElementById('speaker');
const modelSelect = document.getElementById('model');
const voiceSelect = document.getElementById('voice');
const systemPromptFile = document.getElementById('systemPromptFile');
const systemPromptTextarea = document.getElementById('systemPrompt');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const muteBtn = document.getElementById('muteBtn');
const applyPromptBtn = document.getElementById('applyPromptBtn');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const fileName = document.getElementById('fileName');
const transcript = document.getElementById('transcript');
const audioVisualizer = document.getElementById('audioVisualizer');
const diagnostics = document.getElementById('diagnostics');
const clearDiagnosticsBtn = document.getElementById('clearDiagnostics');

// Инициализация
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM загружен, инициализация...');
    
    // Проверяем, что все элементы найдены
    if (!apiKeyInput) console.error('apiKeyInput не найден');
    if (!toggleApiKeyBtn) console.error('toggleApiKeyBtn не найден');
    if (!microphoneSelect) console.error('microphoneSelect не найден');
    if (!speakerSelect) console.error('speakerSelect не найден');
    
    setupEventListeners();
    await loadAudioDevices();
});

// Загрузка аудио устройств
async function loadAudioDevices() {
    try {
        console.log('Загрузка аудио устройств...');
        
        if (!microphoneSelect || !speakerSelect) {
            console.error('Селекты устройств не найдены');
            return;
        }
        
        // Очистка селектов
        microphoneSelect.innerHTML = '<option value="">Загрузка...</option>';
        speakerSelect.innerHTML = '<option value="">Загрузка...</option>';
        
        // Запрос разрешения на доступ к микрофону
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            console.log('Разрешение на микрофон получено');
        } catch (error) {
            console.warn('Не удалось получить разрешение на микрофон:', error);
            // Продолжаем попытку загрузки устройств
        }

        // Получение списка устройств
        const devices = await navigator.mediaDevices.enumerateDevices();
        console.log('Найдено устройств:', devices.length);
        
        // Очистка селектов
        microphoneSelect.innerHTML = '<option value="">Выберите микрофон...</option>';
        speakerSelect.innerHTML = '<option value="">Выберите динамик...</option>';

        let micCount = 0;
        let speakerCount = 0;

        devices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `${device.kind} ${device.deviceId.slice(0, 8)}`;
            
            if (device.kind === 'audioinput') {
                microphoneSelect.appendChild(option);
                micCount++;
            } else if (device.kind === 'audiooutput') {
                speakerSelect.appendChild(option);
                speakerCount++;
            }
        });
        
        console.log(`Загружено устройств: ${micCount} микрофонов, ${speakerCount} динамиков`);
        
        if (micCount === 0) {
            microphoneSelect.innerHTML = '<option value="">Микрофоны не найдены</option>';
        }
        if (speakerCount === 0) {
            speakerSelect.innerHTML = '<option value="">Динамики не найдены</option>';
        }
    } catch (error) {
        console.error('Ошибка при загрузке устройств:', error);
        if (microphoneSelect) {
            microphoneSelect.innerHTML = '<option value="">Ошибка загрузки</option>';
        }
        if (speakerSelect) {
            speakerSelect.innerHTML = '<option value="">Ошибка загрузки</option>';
        }
        alert('Не удалось получить доступ к аудио устройствам. Проверьте разрешения браузера.');
    }
}

// Настройка обработчиков событий
function setupEventListeners() {
    if (!toggleApiKeyBtn) {
        console.error('toggleApiKeyBtn не найден, пропускаем настройку');
        return;
    }
    
    toggleApiKeyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (apiKeyInput.type === 'password') {
            apiKeyInput.type = 'text';
            toggleApiKeyBtn.textContent = '🙈';
        } else {
            apiKeyInput.type = 'password';
            toggleApiKeyBtn.textContent = '👁️';
        }
    });

    systemPromptFile.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            fileName.textContent = file.name;
            try {
                const text = await file.text();
                systemPromptTextarea.value = text;
                currentSystemPrompt = text;
            } catch (error) {
                console.error('Ошибка при чтении файла:', error);
                alert('Не удалось прочитать файл');
            }
        }
    });

    systemPromptTextarea.addEventListener('input', (e) => {
        currentSystemPrompt = e.target.value;
    });

    connectBtn.addEventListener('click', connect);
    disconnectBtn.addEventListener('click', disconnect);
    muteBtn.addEventListener('click', toggleMute);
    
    // Кнопка для применения промпта после подключения
    if (applyPromptBtn) {
        applyPromptBtn.addEventListener('click', () => {
            sendSystemPrompt();
        });
    }
}

// Подключение к OpenAI Realtime API
async function connect() {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
        alert('Пожалуйста, введите OpenAI API Key');
        return;
    }

    const microphoneId = microphoneSelect.value;
    if (!microphoneId) {
        alert('Пожалуйста, выберите микрофон');
        return;
    }

    try {
        updateStatus('connecting', 'Подключение...');
        connectBtn.disabled = true;

        // Инициализация аудио контекста
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Получение потока с микрофона
        mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: { exact: microphoneId },
                sampleRate: 24000,
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true
            }
        });

        console.log('MediaStream получен:', {
            id: mediaStream.id,
            active: mediaStream.active,
            tracks: mediaStream.getTracks().length
        });

        // Настройка визуализатора
        setupAudioVisualizer();

        // Подключение через WebRTC
        const model = modelSelect.value;
        const voice = voiceSelect.value;
        
        // Разблокируем кнопку отключения
        disconnectBtn.disabled = false;
        
        // Создаем WebRTC соединение (включая DataChannel для управления)
        await setupWebRTCConnection(apiKey, model, voice);
        
        // Начинаем мониторинг исходящего аудиопотока (микрофон)
        startOutgoingAudioMonitoring();

    } catch (error) {
        console.error('Ошибка при подключении:', error);
        alert('Ошибка при подключении: ' + error.message);
        updateStatus('disconnected', 'Ошибка');
        connectBtn.disabled = false;
    }
}

// Отключение
function disconnect() {
    isConnected = false;
    sessionReady = false;
    
    // Очищаем таймаут инициализации
    if (initTimeout) {
        clearTimeout(initTimeout);
        initTimeout = null;
    }
    
    // Останавливаем мониторинг соединения
    if (connectionMonitorInterval) {
        clearInterval(connectionMonitorInterval);
        connectionMonitorInterval = null;
    }
    
    // Останавливаем keep-alive
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
    }
    
    // Останавливаем отслеживание активности микрофона
    if (microphoneActivityCheckInterval) {
        clearInterval(microphoneActivityCheckInterval);
        microphoneActivityCheckInterval = null;
    }
    audioAnalyser = null;
    
    // Сбрасываем флаги
    isAIResponding = false;
    lastUserSpeechTime = 0;
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
        console.log('WebRTC соединение закрыто');
    }
    
    // Закрываем DataChannel, если есть
    if (peerConnection && peerConnection.dataChannel) {
        try {
            peerConnection.dataChannel.close();
        } catch (e) {
            // Игнорируем ошибки при закрытии
        }
        peerConnection.dataChannel = null;
    }

    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }

    if (audioContext) {
        try {
            audioContext.close();
        } catch (e) {
            console.error('Ошибка при закрытии audioContext:', e);
        }
        audioContext = null;
    }

    // Удаляем все аудио элементы
    document.querySelectorAll('audio').forEach(audio => {
        if (audio.srcObject) {
            audio.srcObject.getTracks().forEach(track => track.stop());
            audio.remove();
        }
    });

    connectBtn.disabled = false;
    disconnectBtn.disabled = true;
    muteBtn.disabled = true;
    if (applyPromptBtn) {
        applyPromptBtn.disabled = true;
    }
    updateStatus('disconnected', 'Отключено');
    audioQueue = [];
    audioBufferQueue = [];
    currentTranscript = '';
}

// Настройка WebRTC соединения
async function setupWebRTCConnection(apiKey, model, voice) {
    try {
        console.log('Настройка WebRTC соединения...');
        
        // Создаем RTCPeerConnection
        peerConnection = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        
        // Добавляем аудиотрек и отслеживаем активность пользователя
        mediaStream.getAudioTracks().forEach(track => {
            // Убеждаемся, что трек активен
            if (track.readyState === 'live') {
                peerConnection.addTrack(track, mediaStream);
                console.log('Аудиотрек добавлен в peer connection:', track.id);
                logDiagnostic('info', `Исходящий аудиотрек добавлен: id=${track.id}, enabled=${track.enabled}, muted=${track.muted}`);
                
                // Отслеживаем активность микрофона для обнаружения прерываний
                setupMicrophoneActivityDetection(track);
                
                // Отслеживаем изменения состояния трека
                track.onended = () => {
                    logDiagnostic('error', 'Исходящий аудиотрек (микрофон) завершился!');
                };
                
                track.onmute = () => {
                    logDiagnostic('warn', 'Исходящий аудиотрек (микрофон) заглушен');
                };
                
                track.onunmute = () => {
                    logDiagnostic('info', 'Исходящий аудиотрек (микрофон) разглушен');
                };
            } else {
                logDiagnostic('error', `Аудиотрек не готов: readyState=${track.readyState}`);
            }
        });
        
        // Обработка входящего аудиопотока
        peerConnection.ontrack = (event) => {
            logDiagnostic('success', 'Получен аудиотрек от OpenAI');
            logDiagnostic('info', `Track event: kind=${event.track.kind}, id=${event.track.id}, enabled=${event.track.enabled}`);
            const [remoteStream] = event.streams;
            logDiagnostic('info', `Remote stream: id=${remoteStream.id}, active=${remoteStream.active}, tracks=${remoteStream.getTracks().length}`);
            playRemoteAudio(remoteStream);
        };
        
        // Обработка ICE кандидатов
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('ICE кандидат:', event.candidate.candidate);
            }
        };
        
        // Обработка изменения состояния соединения
        peerConnection.onconnectionstatechange = () => {
            const state = peerConnection.connectionState;
            logDiagnostic('info', `WebRTC connectionState: ${state}`);
            console.log('Состояние WebRTC соединения:', state);
            
            if (state === 'connected') {
                isConnected = true;
                sessionReady = true;
                updateStatus('connected', 'Подключено');
                connectBtn.disabled = true;
                disconnectBtn.disabled = false;
                muteBtn.disabled = false;
                if (applyPromptBtn) {
                    applyPromptBtn.disabled = false;
                }
                logDiagnostic('success', 'WebRTC соединение установлено');
            } else if (state === 'disconnected') {
                logDiagnostic('warn', 'WebRTC соединение разорвано, пытаемся восстановить...');
                updateStatus('connecting', 'Переподключение...');
                // Пытаемся восстановить соединение
                setTimeout(() => {
                    if (peerConnection && peerConnection.connectionState === 'disconnected') {
                        logDiagnostic('error', 'Не удалось восстановить соединение');
                        disconnect();
                    }
                }, 5000);
            } else if (state === 'failed') {
                logDiagnostic('error', 'WebRTC соединение не удалось');
                alert('Соединение разорвано. Попробуйте переподключиться.');
                disconnect();
            } else if (state === 'closed') {
                logDiagnostic('info', 'WebRTC соединение закрыто');
                if (isConnected) {
                    disconnect();
                }
            }
        };
        
        // Обработка изменения состояния ICE соединения
        peerConnection.oniceconnectionstatechange = () => {
            const iceState = peerConnection.iceConnectionState;
            logDiagnostic('info', `ICE connectionState: ${iceState}`);
            console.log('Состояние ICE соединения:', iceState);
            
            if (iceState === 'failed' || iceState === 'disconnected') {
                logDiagnostic('warn', `ICE соединение: ${iceState}`);
                // Пытаемся восстановить через перезапуск ICE
                if (iceState === 'failed') {
                    logDiagnostic('info', 'Попытка восстановления ICE соединения...');
                    peerConnection.restartIce();
                }
            } else if (iceState === 'connected') {
                logDiagnostic('success', 'ICE соединение установлено');
            }
        };
        
        // Обработка изменения состояния ICE gathering
        peerConnection.onicegatheringstatechange = () => {
            const gatheringState = peerConnection.iceGatheringState;
            logDiagnostic('info', `ICE gatheringState: ${gatheringState}`);
        };
        
        // Обработка ICE кандидатов
        peerConnection.onicecandidateerror = (event) => {
            // Ошибка 701 (STUN timeout) не критична, если есть другие рабочие кандидаты
            if (event.errorCode === 701) {
                logDiagnostic('warn', `ICE candidate error: ${event.errorCode} - ${event.errorText} (не критично, если есть другие кандидаты)`);
            } else {
                logDiagnostic('warn', `ICE candidate error: ${event.errorCode} - ${event.errorText}`);
            }
        };
        
        // Создаем DataChannel для управления сессией (как в рабочем коде)
        const dataChannel = peerConnection.createDataChannel('oai-events');
        
        dataChannel.addEventListener('open', () => {
            logDiagnostic('success', 'DataChannel открыт, отправляем session.update');
            
            // Получаем актуальный промпт из textarea (как в рабочем коде)
            const promptText = systemPromptTextarea.value.trim() || currentSystemPrompt || 'Ты голосовой ассистент, говоришь по-русски, отвечаешь коротко и дружелюбно.';
            currentSystemPrompt = promptText;
            
            logDiagnostic('info', `Отправляем промпт: ${promptText.substring(0, 50)}...`);
            
            // Отправляем session.update через DataChannel
            const sessionUpdate = {
                type: 'session.update',
                session: {
                    instructions: promptText,
                    input_audio_format: 'opus',
                    output_audio_format: 'opus',
                    modalities: ['audio'],
                    turn_detection: {
                        type: 'server_vad',
                        threshold: 0.5,
                        prefix_padding_ms: 300,
                        silence_duration_ms: 500,
                        create_response: true,
                        interrupt_response: true
                    }
                }
            };
            
            const updateMessage = JSON.stringify(sessionUpdate);
            logDiagnostic('debug', `Отправляем session.update: ${updateMessage.substring(0, 200)}...`);
            
            dataChannel.send(updateMessage);
            logDiagnostic('success', 'session.update отправлен через DataChannel');
        });
        
        dataChannel.addEventListener('message', (event) => {
            try {
                const data = JSON.parse(event.data);
                
                if (data.type === 'session.updated') {
                    logDiagnostic('success', 'Модель подтвердила обновление системного промпта');
                } else if (data.type === 'response.text.delta') {
                    logDiagnostic('debug', `Текст ответа: ${data.delta?.text || ''}`);
                } else {
                    logDiagnostic('debug', `Событие DataChannel: ${data.type}`);
                }
            } catch (e) {
                logDiagnostic('debug', `Сообщение DataChannel: ${event.data}`);
            }
        });
        
        // Сохраняем dataChannel для последующего использования
        peerConnection.dataChannel = dataChannel;
        
        // Создаем offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        console.log('SDP offer создан');
        logDiagnostic('info', 'SDP offer создан');
        
        // Отправляем offer напрямую в OpenAI (как в рабочем коде)
        const voiceParam = encodeURIComponent(voice);
        const modelParam = encodeURIComponent(model);
        const response = await fetch(
            `https://api.openai.com/v1/realtime?model=${modelParam}&voice=${voiceParam}`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/sdp'
                },
                body: offer.sdp
            }
        );
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ошибка при создании WebRTC соединения: ${response.status} ${errorText}`);
        }
        
        // Получаем answer
        const answerSdp = await response.text();
        const answer = {
            type: 'answer',
            sdp: answerSdp
        };
        
        await peerConnection.setRemoteDescription(answer);
        console.log('SDP answer установлен, соединение установлено');
        logDiagnostic('success', 'SDP answer установлен, соединение установлено');
        
        // Начинаем мониторинг соединения
        startConnectionMonitoring();
        
    } catch (error) {
        console.error('Ошибка при настройке WebRTC:', error);
        alert('Ошибка при подключении: ' + error.message);
        disconnect();
    }
}

// Мониторинг состояния соединения
function startConnectionMonitoring() {
    // Останавливаем предыдущий мониторинг, если есть
    if (connectionMonitorInterval) {
        clearInterval(connectionMonitorInterval);
    }
    
    connectionMonitorInterval = setInterval(() => {
        if (!peerConnection || !isConnected) {
            if (connectionMonitorInterval) {
                clearInterval(connectionMonitorInterval);
                connectionMonitorInterval = null;
            }
            return;
        }
        
        const state = peerConnection.connectionState;
        const iceState = peerConnection.iceConnectionState;
        
        // Логируем состояние каждые 30 секунд (10% вероятность)
        if (Math.random() < 0.1) {
            console.log('Мониторинг соединения:', {
                connectionState: state,
                iceConnectionState: iceState,
                signalingState: peerConnection.signalingState
            });
        }
        
        // Проверяем, что соединение активно
        if (state === 'connected' && iceState === 'connected') {
            // Соединение активно, все хорошо
            return;
        }
        
        // Если соединение разорвано, пытаемся восстановить
        if (state === 'disconnected' || iceState === 'disconnected') {
            logDiagnostic('warn', 'Обнаружено разорванное соединение, пытаемся восстановить...');
            // Пытаемся перезапустить ICE
            try {
                if (peerConnection.connectionState === 'disconnected') {
                    peerConnection.restartIce();
                }
            } catch (e) {
                logDiagnostic('error', `Ошибка при перезапуске ICE: ${e.message}`);
            }
        }
        
        // Если соединение полностью упало, отключаемся
        if (state === 'failed' || iceState === 'failed') {
            logDiagnostic('error', 'Соединение упало, отключаемся');
            if (connectionMonitorInterval) {
                clearInterval(connectionMonitorInterval);
                connectionMonitorInterval = null;
            }
            disconnect();
        }
    }, 5000); // Проверяем каждые 5 секунд
    
    // Запускаем keep-alive
    startKeepAlive();
}

// Keep-alive для поддержания соединения
function startKeepAlive() {
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
    }
    
    keepAliveInterval = setInterval(() => {
        if (!peerConnection || !isConnected) {
            if (keepAliveInterval) {
                clearInterval(keepAliveInterval);
                keepAliveInterval = null;
            }
            return;
        }
        
        // Проверяем состояние соединения
        const state = peerConnection.connectionState;
        const iceState = peerConnection.iceConnectionState;
        
        // Если соединение активно, проверяем активность треков
        if (state === 'connected' && iceState === 'connected') {
            try {
                // Проверяем, что отправители активны
                const senders = peerConnection.getSenders();
                if (senders.length > 0) {
                    senders.forEach(sender => {
                        if (sender.track && sender.track.readyState === 'live') {
                            // Трек активен, соединение живое
                        } else if (sender.track && sender.track.readyState === 'ended') {
                            logDiagnostic('error', 'Исходящий трек завершился!');
                        }
                    });
                }
                
                // Проверяем получатели
                const receivers = peerConnection.getReceivers();
                if (receivers.length > 0) {
                    receivers.forEach(receiver => {
                        if (receiver.track && receiver.track.readyState === 'live') {
                            // Входящий трек активен
                        } else if (receiver.track && receiver.track.readyState === 'ended') {
                            logDiagnostic('error', 'Входящий трек завершился!');
                        }
                    });
                }
            } catch (e) {
                logDiagnostic('warn', `Ошибка при проверке keep-alive: ${e.message}`);
            }
        }
    }, 30000); // Проверяем каждые 30 секунд
}

// Константы для переподключения WebSocket
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 3000; // 3 секунды

// Настройка WebSocket для управления сессией (отправка системного промпта)
async function setupWebSocketForControl(apiKey, model, voice) {
    try {
        // Сохраняем параметры для переподключения
        websocketApiKey = apiKey;
        websocketModel = model;
        websocketVoice = voice;
        websocketReconnectAttempts = 0;
        
        console.log('Настройка WebSocket для управления сессией...');
        logDiagnostic('info', 'Настройка WebSocket для управления...');
        
        const wsUrl = `ws://localhost:3000/ws-proxy`;
        websocket = new WebSocket(wsUrl);
        
        websocket.onopen = () => {
            websocketReconnectAttempts = 0; // Сбрасываем счетчик при успешном подключении
            console.log('WebSocket для управления подключен');
            logDiagnostic('success', 'WebSocket для управления подключен');
            // Отправка параметров подключения
            websocket.send(JSON.stringify({
                type: 'connect',
                apiKey: apiKey,
                model: model,
                voice: voice
            }));
        };
        
        websocket.onmessage = (event) => {
            try {
                // Проверяем, это строка или бинарные данные
                let data;
                if (typeof event.data === 'string') {
                    data = JSON.parse(event.data);
                    logDiagnostic('debug', `WebSocket сообщение: ${data.type || 'unknown'}`);
                } else if (event.data instanceof Blob) {
                    // Бинарные данные - пропускаем
                    logDiagnostic('debug', 'Получены бинарные данные через WebSocket управления');
                    return;
                } else {
                    // Пробуем преобразовать в строку
                    const text = new TextDecoder().decode(event.data);
                    data = JSON.parse(text);
                }
                
                if (data.type === 'connected') {
                    console.log('WebSocket подключен к OpenAI API для управления');
                    logDiagnostic('success', 'WebSocket подключен к OpenAI API для управления');
                    // Отправляем системный промпт после подключения
                    sendSystemPrompt();
                } else if (data.type === 'disconnected') {
                    // При использовании WebRTC, WebSocket для управления не критичен
                    // Сессия уже настроена через WebRTC, поэтому не переподключаемся
                    logDiagnostic('info', `WebSocket отключен от OpenAI API (код: ${data.code}). Это нормально при использовании WebRTC - сессия работает через WebRTC.`);
                    // Не переподключаемся - WebSocket не критичен для WebRTC сессий
                    return;
                } else if (data.type === 'session.created') {
                    console.log('Сессия создана через WebSocket, отправляем системный промпт');
                    // Отправляем системный промпт после создания сессии
                    setTimeout(() => {
                        sendSystemPrompt();
                    }, 500);
                } else if (data.type === 'error') {
                    logDiagnostic('error', `Ошибка WebSocket: ${data.error || 'Неизвестная ошибка'}`);
                }
            } catch (e) {
                console.error('Ошибка при обработке сообщения WebSocket:', e, 'Данные:', event.data);
                logDiagnostic('error', `Ошибка при обработке сообщения WebSocket: ${e.message}`);
            }
        };
        
        websocket.onerror = (error) => {
            console.error('Ошибка WebSocket для управления:', error);
            logDiagnostic('error', 'Ошибка WebSocket для управления');
        };
        
        websocket.onclose = (event) => {
            console.log('WebSocket для управления закрыт', event.code, event.reason);
            
            // Код 1000 означает нормальное закрытие - это нормально для WebRTC сессий
            if (event.code === 1000) {
                logDiagnostic('info', `WebSocket закрыт (нормальное закрытие). Это нормально при использовании WebRTC.`);
                // Не переподключаемся при нормальном закрытии
                return;
            }
            
            logDiagnostic('warn', `WebSocket закрыт. Код: ${event.code}, Причина: ${event.reason || 'нет причины'}`);
            
            // Если это не было запланированное закрытие, пытаемся переподключиться
            if (isConnected) {
                reconnectWebSocket();
            }
        };
        
    } catch (error) {
        console.error('Ошибка при настройке WebSocket для управления:', error);
        logDiagnostic('error', `Ошибка при настройке WebSocket: ${error.message}`);
    }
}

// Переподключение WebSocket
function reconnectWebSocket() {
    // При использовании WebRTC, WebSocket для управления не критичен
    // Сессия уже настроена через WebRTC, поэтому не переподключаемся бесконечно
    logDiagnostic('info', 'WebSocket для управления не критичен при использовании WebRTC. Сессия работает через WebRTC.');
    return;
}

// Отправка системного промпта
// Отправка системного промпта через DataChannel
function sendSystemPrompt() {
    if (!peerConnection || !peerConnection.dataChannel) {
        logDiagnostic('warn', 'DataChannel не создан');
        return;
    }
    
    if (peerConnection.dataChannel.readyState !== 'open') {
        logDiagnostic('warn', `DataChannel не готов (состояние: ${peerConnection.dataChannel.readyState})`);
        return;
    }
    
    // Получаем актуальный промпт из textarea
    const promptText = systemPromptTextarea.value.trim() || currentSystemPrompt;
    
    if (!promptText || promptText.trim() === '') {
        logDiagnostic('warn', 'Системный промпт пуст, пропускаем отправку');
        return;
    }
    
    currentSystemPrompt = promptText;
    
    console.log('Отправка системного промпта через DataChannel:', promptText.substring(0, 50) + '...');
    logDiagnostic('info', `Отправка системного промпта через DataChannel: ${promptText.substring(0, 50)}...`);
    
    try {
        const message = {
            type: 'session.update',
            session: {
                instructions: promptText
            }
        };
        
        const messageStr = JSON.stringify(message);
        logDiagnostic('debug', `Отправляем: ${messageStr}`);
        
        peerConnection.dataChannel.send(messageStr);
        console.log('Системный промпт отправлен через DataChannel');
        logDiagnostic('success', 'Системный промпт отправлен через DataChannel');
    } catch (error) {
        logDiagnostic('error', `Не удалось отправить системный промпт через DataChannel: ${error.message}`);
        console.error('Ошибка отправки промпта:', error);
    }
}

// Отслеживание активности микрофона для обнаружения прерываний
let audioAnalyser = null;
let microphoneActivityCheckInterval = null;

function setupMicrophoneActivityDetection(track) {
    try {
        // Создаем AudioContext для анализа аудио
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        const source = audioContext.createMediaStreamSource(mediaStream);
        audioAnalyser = audioContext.createAnalyser();
        audioAnalyser.fftSize = 256;
        audioAnalyser.smoothingTimeConstant = 0.8;
        source.connect(audioAnalyser);
        
        const dataArray = new Uint8Array(audioAnalyser.frequencyBinCount);
        let silenceCount = 0;
        const SILENCE_THRESHOLD = 20; // Порог тишины
        const ACTIVITY_THRESHOLD = 30; // Порог активности речи
        
        microphoneActivityCheckInterval = setInterval(() => {
            if (!audioAnalyser || !isConnected) {
                return;
            }
            
            audioAnalyser.getByteFrequencyData(dataArray);
            
            // Вычисляем средний уровень звука
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i];
            }
            const average = sum / dataArray.length;
            
            // Если есть активность и ИИ отвечает, отправляем response.cancel
            if (average > ACTIVITY_THRESHOLD && isAIResponding) {
                lastUserSpeechTime = Date.now();
                console.log('Обнаружена активность пользователя во время ответа ИИ, отправляем response.cancel');
                cancelAIResponse();
                silenceCount = 0;
            } else if (average < SILENCE_THRESHOLD) {
                silenceCount++;
            } else {
                silenceCount = 0;
            }
        }, 100); // Проверяем каждые 100мс
        
        console.log('Отслеживание активности микрофона настроено');
    } catch (error) {
        console.error('Ошибка при настройке отслеживания активности микрофона:', error);
    }
}

// Отмена ответа ИИ
function cancelAIResponse() {
    if (websocket && websocket.readyState === WebSocket.OPEN && isAIResponding) {
        const message = {
            type: 'response.cancel'
        };
        websocket.send(JSON.stringify(message));
        console.log('Отправлен response.cancel');
        isAIResponding = false;
    }
}

// Мониторинг активности аудио (входящий поток от ИИ)
function startAudioActivityMonitoring(stream) {
    if (audioActivityMonitorInterval) {
        clearInterval(audioActivityMonitorInterval);
    }
    
    audioActivityMonitorInterval = setInterval(() => {
        if (!stream || !isConnected) {
            if (audioActivityMonitorInterval) {
                clearInterval(audioActivityMonitorInterval);
                audioActivityMonitorInterval = null;
            }
            return;
        }
        
        const tracks = stream.getAudioTracks();
        if (tracks.length === 0) {
            logDiagnostic('error', 'Нет активных аудиотреков во входящем потоке!');
            return;
        }
        
        const track = tracks[0];
        const now = Date.now();
        const timeSinceLastActivity = now - lastAudioActivityTime;
        
        // Проверяем состояние трека (входящий поток от ИИ)
        if (track.readyState === 'ended') {
            logDiagnostic('error', 'Входящий аудиотрек завершился (ended)');
        } else if (track.readyState === 'live' && track.enabled && !track.muted) {
            // Трек активен, но это нормально если ИИ не говорит
            // Не логируем отсутствие активности для входящего потока
        }
        
        // Проверяем состояние аудио элемента
        if (remoteAudioElement) {
            if (remoteAudioElement.paused && !remoteAudioElement.ended) {
                logDiagnostic('warn', 'Аудио элемент приостановлен');
            }
            if (remoteAudioElement.ended) {
                logDiagnostic('error', 'Аудио элемент завершился');
            }
        }
    }, 5000); // Проверяем каждые 5 секунд (реже, так как это входящий поток)
}

// Мониторинг исходящего аудиопотока (микрофон пользователя)
function startOutgoingAudioMonitoring() {
    if (!mediaStream || !isConnected) {
        return;
    }
    
    const outgoingTracks = mediaStream.getAudioTracks();
    if (outgoingTracks.length === 0) {
        logDiagnostic('error', 'Нет исходящих аудиотреков (микрофон)!');
        return;
    }
    
    const track = outgoingTracks[0];
    logDiagnostic('info', `Исходящий аудиотрек: id=${track.id}, enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);
    
    // Отслеживаем изменения состояния трека
    track.onended = () => {
        logDiagnostic('error', 'Исходящий аудиотрек (микрофон) завершился!');
    };
    
    track.onmute = () => {
        logDiagnostic('warn', 'Исходящий аудиотрек (микрофон) заглушен');
    };
    
    track.onunmute = () => {
        logDiagnostic('info', 'Исходящий аудиотрек (микрофон) разглушен');
    };
    
    // Периодическая проверка состояния
    setInterval(() => {
        if (!isConnected || !mediaStream) {
            return;
        }
        
        const tracks = mediaStream.getAudioTracks();
        if (tracks.length === 0) {
            logDiagnostic('error', 'Исходящий аудиотрек (микрофон) отсутствует!');
            return;
        }
        
        const currentTrack = tracks[0];
        if (currentTrack.readyState === 'ended') {
            logDiagnostic('error', 'Исходящий аудиотрек (микрофон) завершился!');
        } else if (currentTrack.muted) {
            logDiagnostic('warn', 'Исходящий аудиотрек (микрофон) заглушен');
        } else if (!currentTrack.enabled) {
            logDiagnostic('warn', 'Исходящий аудиотрек (микрофон) отключен');
        }
    }, 10000); // Проверяем каждые 10 секунд
}

// Воспроизведение удаленного аудио
function playRemoteAudio(stream) {
    try {
        // Удаляем предыдущий элемент, если есть
        if (remoteAudioElement) {
            remoteAudioElement.pause();
            remoteAudioElement.srcObject = null;
            if (remoteAudioElement.parentNode) {
                remoteAudioElement.parentNode.removeChild(remoteAudioElement);
            }
        }
        
        // Создаем аудио элемент для воспроизведения
        remoteAudioElement = document.createElement('audio');
        remoteAudioElement.autoplay = true;
        remoteAudioElement.srcObject = stream;
        
        // Устанавливаем выбранный динамик (если поддерживается)
        if (speakerSelect.value && 'setSinkId' in remoteAudioElement) {
            remoteAudioElement.setSinkId(speakerSelect.value).catch(e => {
                logDiagnostic('warn', 'Не удалось установить динамик: ' + e.message);
            });
        }
        
        // Добавляем в DOM (скрыто)
        remoteAudioElement.style.display = 'none';
        document.body.appendChild(remoteAudioElement);
        
        // Отслеживание состояния аудио
        remoteAudioElement.onloadedmetadata = () => {
            logDiagnostic('success', 'Аудио метаданные загружены, начинаем воспроизведение');
            logDiagnostic('info', `Аудио: duration=${remoteAudioElement.duration}, readyState=${remoteAudioElement.readyState}`);
        };
        
        remoteAudioElement.onplay = () => {
            lastAudioActivityTime = Date.now();
            logDiagnostic('success', 'Аудио начало воспроизведение');
        };
        
        remoteAudioElement.onpause = () => {
            logDiagnostic('warn', 'Аудио приостановлено');
        };
        
        remoteAudioElement.onended = () => {
            logDiagnostic('warn', 'Аудио завершилось');
        };
        
        remoteAudioElement.onerror = (error) => {
            logDiagnostic('error', 'Ошибка при воспроизведении аудио: ' + (error.message || 'Неизвестная ошибка'));
        };
        
        // Отслеживание активности аудиопотока
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length > 0) {
            const track = audioTracks[0];
            logDiagnostic('info', `Аудиотрек получен: id=${track.id}, enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);
            
            track.onended = () => {
                logDiagnostic('error', 'Аудиотрек завершился!');
            };
            
            track.onmute = () => {
                logDiagnostic('warn', 'Аудиотрек заглушен');
            };
            
            track.onunmute = () => {
                logDiagnostic('info', 'Аудиотрек разглушен');
            };
        }
        
        // Мониторинг активности аудио
        startAudioActivityMonitoring(stream);
        
        logDiagnostic('success', 'Аудио элемент создан для воспроизведения');
    } catch (error) {
        logDiagnostic('error', 'Ошибка при создании аудио элемента: ' + error.message);
        console.error('Ошибка при создании аудио элемента:', error);
    }
}

// Функции startAudioCapture и initializeSession больше не нужны для WebRTC
// Аудио передается напрямую через RTCPeerConnection

// Обработка сообщений от WebSocket
function handleWebSocketMessage(event) {
    try {
        // Проверяем, что это строка, а не бинарные данные
        if (typeof event.data !== 'string') {
            console.log('Получены бинарные данные от OpenAI, размер:', event.data.byteLength || event.data.size);
            return;
        }
        
        const data = JSON.parse(event.data);
        
        // Логируем все сообщения для отладки
        console.log('Получено сообщение от OpenAI:', data.type, data);
        
        switch (data.type) {
            case 'session.created':
                console.log('Сессия создана (WebSocket сообщение, но используется WebRTC)');
                break;
                
            case 'session.updated':
                console.log('Сессия обновлена (WebSocket сообщение, но используется WebRTC)');
                break;
                
            case 'conversation.item.input_audio_transcription.completed':
                if (data.transcript) {
                    addToTranscript('user', data.transcript);
                }
                break;
                
            case 'conversation.item.output_audio_transcript.delta':
                if (data.delta) {
                    currentTranscript += data.delta;
                    updateTranscript('ai', currentTranscript);
                }
                break;
                
            case 'response.audio_transcript.delta':
                if (data.delta) {
                    currentTranscript += data.delta;
                    updateTranscript('ai', currentTranscript);
                }
                break;
                
            case 'response.audio.delta':
                // Аудио теперь приходит через WebRTC, не через WebSocket
                console.log('Получен audio.delta через WebSocket (но используется WebRTC)');
                break;
                
            case 'response.audio_transcript.done':
                if (data.transcript) {
                    currentTranscript = '';
                    addToTranscript('ai', data.transcript);
                }
                break;
                
            case 'response.created':
                isAIResponding = true;
                logDiagnostic('info', 'ИИ начал отвечать (response.created)');
                break;
                
            case 'response.output_item.added':
                isAIResponding = true;
                logDiagnostic('info', 'ИИ добавляет элемент ответа');
                break;
                
            case 'response.done':
                isAIResponding = false;
                currentTranscript = '';
                logDiagnostic('info', 'Ответ завершен (response.done)');
                break;
                
            case 'response.cancelled':
                isAIResponding = false;
                logDiagnostic('warn', 'Ответ отменен (response.cancelled)');
                break;
                
            case 'error':
                console.error('Ошибка от API:', JSON.stringify(data, null, 2));
                const errorMsg = data.error?.message || data.error?.code || data.error || 'Неизвестная ошибка';
                console.error('Детали ошибки:', {
                    type: data.error?.type,
                    code: data.error?.code,
                    message: data.error?.message,
                    event_id: data.event_id
                });
                
                // Если это server_error, возможно это временная проблема
                if (data.error?.type === 'server_error') {
                    console.warn('Ошибка сервера OpenAI - возможно временная проблема');
                    // Не показываем alert для server_error, так как это может быть временная проблема
                } else {
                    alert('Ошибка от OpenAI API: ' + errorMsg);
                }
                // Не отключаемся сразу, возможно это не критическая ошибка
                break;
                
            default:
                // Логируем неизвестные типы сообщений для отладки
                if (data.type && !data.type.startsWith('ping') && !data.type.startsWith('pong')) {
                    console.log('Необработанный тип сообщения:', data.type, data);
                }
        }
    } catch (error) {
        // Если не JSON, возможно это бинарные данные - игнорируем
        if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
            return;
        }
        console.error('Ошибка при обработке сообщения:', error);
    }
}

// Воспроизведение аудио чанка
let audioQueueBuffer = [];
let isPlaying = false;
let audioBufferQueue = [];

async function playAudioChunk(base64Audio) {
    console.log('Получен аудио чанк, размер:', base64Audio.length);
    try {
        // Конвертируем base64 PCM16 в AudioBuffer
        const pcm16Data = base64ToArrayBuffer(base64Audio);
        const pcm16Array = new Int16Array(pcm16Data);
        
        // Конвертируем PCM16 в Float32 для Web Audio API
        const float32Array = new Float32Array(pcm16Array.length);
        for (let i = 0; i < pcm16Array.length; i++) {
            float32Array[i] = pcm16Array[i] / 32768.0;
        }
        
        // Создаем AudioBuffer с частотой 24kHz (как требует OpenAI)
        const sampleRate = 24000;
        const audioBuffer = audioContext.createBuffer(1, float32Array.length, sampleRate);
        audioBuffer.getChannelData(0).set(float32Array);
        
        audioBufferQueue.push(audioBuffer);
        
        if (!isPlaying) {
            playAudioQueue();
        }
    } catch (error) {
        console.error('Ошибка при обработке аудио чанка:', error);
    }
}

async function playAudioQueue() {
    if (audioBufferQueue.length === 0) {
        isPlaying = false;
        return;
    }
    
    isPlaying = true;
    
    try {
        const audioBuffer = audioBufferQueue.shift();
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        
        // Установка выбранного динамика (если поддерживается)
        if (speakerSelect.value && 'setSinkId' in audioContext) {
            try {
                await audioContext.setSinkId(speakerSelect.value);
            } catch (e) {
                console.warn('Не удалось установить динамик:', e);
            }
        }
        
        source.connect(audioContext.destination);
        
        source.onended = () => {
            playAudioQueue();
        };
        
        source.start();
    } catch (error) {
        console.error('Ошибка при воспроизведении аудио:', error);
        isPlaying = false;
        playAudioQueue();
    }
}

// Настройка визуализатора аудио
function setupAudioVisualizer() {
    if (!mediaStream || !audioContext) return;

    const canvas = audioVisualizer;
    const ctx = canvas.getContext('2d');
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(mediaStream);
    
    analyser.fftSize = 256;
    source.connect(analyser);
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    function draw() {
        if (!isConnected) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }
        
        requestAnimationFrame(draw);
        
        analyser.getByteFrequencyData(dataArray);
        
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        const barWidth = (canvas.width / bufferLength) * 2.5;
        let barHeight;
        let x = 0;
        
        for (let i = 0; i < bufferLength; i++) {
            barHeight = (dataArray[i] / 255) * canvas.height;
            
            const r = barHeight + 25 * (i / bufferLength);
            const g = 250 * (i / bufferLength);
            const b = 50;
            
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
            
            x += barWidth + 1;
        }
    }
    
    draw();
}

// Утилиты для конвертации аудио
function convertFloat32ToPCM16(float32Array) {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    let offset = 0;
    for (let i = 0; i < float32Array.length; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, float32Array[i]));
        // Правильная конвертация: s * 32767 для положительных, s * 32768 для отрицательных
        const sample = Math.max(-32768, Math.min(32767, Math.round(s * 32767)));
        view.setInt16(offset, sample, true); // little-endian
    }
    return new Int16Array(buffer);
}

function arrayBufferToBase64(buffer) {
    // Более эффективный способ конвертации
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000; // 32KB chunks
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}

function base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

// Функция логирования диагностики
function logDiagnostic(level, message) {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = {
        timestamp,
        level,
        message
    };
    
    diagnosticsLog.push(logEntry);
    
    // Ограничиваем размер лога (последние 200 записей)
    if (diagnosticsLog.length > 200) {
        diagnosticsLog = diagnosticsLog.slice(-200);
    }
    
    // Выводим в консоль
    const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
    console[consoleMethod](`[${timestamp}] ${message}`);
    
    // Отображаем в UI
    if (diagnostics) {
        const entryDiv = document.createElement('div');
        entryDiv.className = `log-entry ${level}`;
        entryDiv.textContent = `[${timestamp}] ${message}`;
        diagnostics.appendChild(entryDiv);
        
        // Автопрокрутка вниз
        diagnostics.scrollTop = diagnostics.scrollHeight;
    }
}

// Управление статусом
function updateStatus(status, text) {
    statusDot.className = `status-dot ${status}`;
    statusText.textContent = text;
    logDiagnostic('info', `Статус: ${text}`);
}

// Добавление в транскрипцию
function addToTranscript(type, message) {
    const div = document.createElement('div');
    div.className = `${type}-message`;
    div.textContent = message;
    transcript.appendChild(div);
    transcript.scrollTop = transcript.scrollHeight;
}

// Обновление транскрипции в реальном времени
function updateTranscript(type, text) {
    const lastMessage = transcript.querySelector(`.${type}-message:last-child`);
    if (lastMessage) {
        lastMessage.textContent = text;
    } else {
        addToTranscript(type, text);
    }
    transcript.scrollTop = transcript.scrollHeight;
}

// Переключение микрофона
function toggleMute() {
    isMuted = !isMuted;
    
    // Отключаем/включаем аудиотреки в mediaStream
    if (mediaStream) {
        mediaStream.getAudioTracks().forEach(track => {
            track.enabled = !isMuted;
        });
    }
    
    muteBtn.classList.toggle('muted', isMuted);
    muteBtn.querySelector('span.icon').textContent = isMuted ? '🎤' : '🔇';
    muteBtn.querySelector('span:last-child').textContent = isMuted ? 'Включить микрофон' : 'Отключить микрофон';
}

