// game.js - Исправленная версия с правильным подключением
class BattleshipGame {
    constructor() {
        this.ws = null;
        this.playerId = null;
        this.roomId = null;
        this.playerNumber = null;
        this.gameState = 'menu';
        this.isHost = false;
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.showScreen('splashScreen');
        console.log('Игра инициализирована');
    }

    bindEvents() {
        window.showCreateRoom = () => this.showCreateRoom();
        window.showJoinRoom = () => this.showJoinRoom();
        window.showSplash = () => this.showSplash();
        window.createRoom = () => this.createRoom();
        window.joinRoom = () => this.joinRoom();
        window.copyRoomId = () => this.copyRoomId();
        window.copyInviteLink = () => this.copyInviteLink();
        window.leaveRoom = () => this.leaveRoom();
    }

    // ==================== ПОДКЛЮЧЕНИЕ К СЕРВЕРУ ====================
    connectToServer(roomId = null, isHost = false) {
        this.isHost = isHost;
        
        // Определяем протокол для WebSocket (ws или wss)
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = roomId ? 
            `${protocol}//${window.location.host}?room=${roomId}` : 
            `${protocol}//${window.location.host}`;
        
        console.log(`Подключение к: ${wsUrl}`);
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('✅ Подключено к серверу');
            this.updateStatus('Соединение установлено', 'success');
            
            if (!isHost && roomId) {
                // Для присоединяющегося игрока сразу отправляем запрос
                this.sendPlayerInfo();
            }
        };
        
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('Получено от сервера:', data);
                this.handleServerMessage(data);
            } catch (error) {
                console.error('Ошибка обработки сообщения:', error);
            }
        };
        
        this.ws.onclose = () => {
            console.log('❌ Соединение закрыто');
            this.updateStatus('Соединение потеряно', 'error');
            this.showScreen('splashScreen');
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket ошибка:', error);
            this.updateStatus('Ошибка подключения', 'error');
        };
    }

    sendPlayerInfo() {
        const playerName = this.isHost ? 
            (document.getElementById('playerName')?.value || 'Хост') :
            (document.getElementById('joinPlayerName')?.value || 'Игрок 2');
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'PLAYER_INFO',
                playerName: playerName,
                isHost: this.isHost
            }));
        }
    }

    handleServerMessage(data) {
        switch(data.type) {
            case 'ROOM_CREATED':
                this.handleRoomCreated(data);
                break;
            case 'ROOM_JOINED':
                this.handleRoomJoined(data);
                break;
            case 'PLAYER_CONNECTED':
                this.handlePlayerConnected(data);
                break;
            case 'GAME_START':
                this.handleGameStart(data);
                break;
            case 'PLAYER_DISCONNECTED':
                this.handlePlayerDisconnected(data);
                break;
            case 'ERROR':
                this.showError(data.message);
                break;
            default:
                console.log('Неизвестный тип сообщения:', data.type);
        }
    }

    // ==================== ОБРАБОТКА СООБЩЕНИЙ ====================
    handleRoomCreated(data) {
        this.playerId = data.playerId;
        this.roomId = data.roomId;
        this.playerNumber = data.playerNumber;
        
        console.log(`✅ Комната создана: ${this.roomId}, вы игрок ${this.playerNumber}`);
        
        // Обновляем отображение ID комнаты
        this.updateRoomIdDisplay();
        this.updateInviteLink();
        
        this.showScreen('waitingScreen');
        this.updateStatus('Комната создана. Ожидание соперника...', 'info');
    }

    handleRoomJoined(data) {
        this.playerId = data.playerId;
        this.roomId = data.roomId;
        this.playerNumber = data.playerNumber;
        
        console.log(`✅ Присоединились к комнате: ${this.roomId}, вы игрок ${this.playerNumber}`);
        
        this.updateRoomIdDisplay();
        this.showScreen('waitingScreen');
        this.updateStatus('Подключено к комнате. Ожидание подтверждения...', 'info');
    }

    handlePlayerConnected(data) {
        if (data.playerNumber !== this.playerNumber) {
            // Подключился другой игрок
            console.log(`✅ Игрок ${data.playerNumber} подключился к комнате`);
            this.updateStatus('Соперник найден! Начинаем игру...', 'success');
            
            // Уведомляем сервер, что оба игрока готовы
            setTimeout(() => {
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({
                        type: 'PLAYER_READY'
                    }));
                }
            }, 1000);
        }
    }

    handleGameStart(data) {
        this.showScreen('placementScreen');
        this.updateStatus('Игра начинается! Расставьте корабли', 'success');
        this.showNotification('Начинаем игру!', 'success');
    }

    handlePlayerDisconnected(data) {
        this.showNotification(`Игрок ${data.playerNumber} отключился`, 'warning');
        this.showScreen('splashScreen');
    }

    // ==================== УПРАВЛЕНИЕ КОМНАТАМИ ====================
    createRoom() {
        console.log('Создание новой комнаты...');
        this.connectToServer(null, true); // isHost = true
        
        // Показываем экран ожидания сразу
        this.showScreen('waitingScreen');
        document.getElementById('displayRoomId').textContent = 'Создание...';
    }

    joinRoom() {
        const roomId = document.getElementById('roomIdInput')?.value.toUpperCase().trim();
        
        if (!roomId || roomId.length !== 6) {
            this.showError('Введите корректный ID комнаты (6 символов)');
            return;
        }
        
        console.log(`Присоединение к комнате: ${roomId}`);
        this.connectToServer(roomId, false); // isHost = false
        
        // Показываем экран ожидания
        this.showScreen('waitingScreen');
        document.getElementById('displayRoomId').textContent = roomId;
        this.updateStatus(`Подключение к комнате ${roomId}...`, 'info');
    }

    // ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
    updateRoomIdDisplay() {
        const elements = [
            document.getElementById('displayRoomId'),
            document.getElementById('placementRoomId'),
            document.getElementById('gameRoomId')
        ];
        
        elements.forEach(element => {
            if (element && this.roomId) {
                element.textContent = this.roomId;
            }
        });
    }

    updateInviteLink() {
        if (!this.roomId) return;
        
        const inviteLink = `${window.location.origin}?room=${this.roomId}`;
        const input = document.getElementById('inviteLink');
        if (input) {
            input.value = inviteLink;
        }
        
        // Обновляем QR-код если есть
        this.updateQRCode(inviteLink);
    }

    updateQRCode(url) {
        const container = document.getElementById('qrCodeContainer');
        if (!container || !window.QRCode) return;
        
        container.innerHTML = '';
        new QRCode(container, {
            text: url,
            width: 128,
            height: 128,
            colorDark: "#64ffda",
            colorLight: "#112240",
            correctLevel: QRCode.CorrectLevel.H
        });
    }

    copyRoomId() {
        if (!this.roomId) return;
        
        navigator.clipboard.writeText(this.roomId).then(() => {
            this.showNotification('ID комнаты скопирован', 'success');
        }).catch(err => {
            console.error('Ошибка копирования:', err);
        });
    }

    copyInviteLink() {
        const link = document.getElementById('inviteLink')?.value;
        if (!link) return;
        
        navigator.clipboard.writeText(link).then(() => {
            this.showNotification('Ссылка скопирована', 'success');
        }).catch(err => {
            console.error('Ошибка копирования:', err);
        });
    }

    leaveRoom() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.close();
        }
        
        this.showScreen('splashScreen');
        this.showNotification('Вы вышли из комнаты', 'info');
    }

    // ==================== УВЕДОМЛЕНИЯ И СТАТУС ====================
    showNotification(message, type = 'info') {
        console.log(`[${type.toUpperCase()}] ${message}`);
        
        // Создаем элемент уведомления
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : 
                              type === 'error' ? 'exclamation-circle' : 
                              type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;
        
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#4CAF50' : 
                         type === 'error' ? '#F44336' : 
                         type === 'warning' ? '#FF9800' : '#2196F3'};
            color: white;
            padding: 15px 20px;
            border-radius: 5px;
            z-index: 10000;
            display: flex;
            align-items: center;
            gap: 10px;
            animation: slideIn 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        // Автоудаление через 5 секунд
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            notification.style.transition = 'all 0.3s ease';
            
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 5000);
    }

    updateStatus(message, type = 'info') {
        const statusElement = document.getElementById('status') || 
                             document.getElementById('connectionStatus');
        
        if (statusElement) {
            statusElement.innerHTML = `
                <div class="status-${type}">
                    <i class="fas fa-${type === 'success' ? 'check' : 
                                     type === 'error' ? 'times' : 'info'}"></i>
                    <span>${message}</span>
                </div>
            `;
        }
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    // ==================== УПРАВЛЕНИЕ ЭКРАНАМИ ====================
    showScreen(screenId) {
        // Скрываем все экраны
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.add('hidden');
        });
        
        // Показываем нужный экран
        const screen = document.getElementById(screenId);
        if (screen) {
            screen.classList.remove('hidden');
        }
        
        console.log(`Переход на экран: ${screenId}`);
    }

    showCreateRoom() {
        this.showScreen('roomScreen');
        this.switchTab('create');
    }

    showJoinRoom() {
        this.showScreen('roomScreen');
        this.switchTab('join');
    }

    showSplash() {
        this.showScreen('splashScreen');
    }

    switchTab(tabName) {
        // Убираем активный класс со всех вкладок
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
        });
        
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        
        // Активируем выбранную вкладку
        document.querySelectorAll('.tab').forEach(tab => {
            if (tab.textContent.includes(tabName.toUpperCase())) {
                tab.classList.add('active');
            }
        });
        
        const content = document.getElementById(`${tabName}Tab`);
        if (content) content.classList.add('active');
    }
}

// Инициализация игры
let game;
window.addEventListener('DOMContentLoaded', () => {
    game = new BattleshipGame();
    window.game = game;
    
    // Проверяем, есть ли room в URL параметрах
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');
    
    if (roomId && roomId.length === 6) {
        // Автоматически присоединяемся к комнате из ссылки
        document.getElementById('roomIdInput').value = roomId;
        game.joinRoom();
    }
});
