class Game {
    constructor() {
        // Инициализация переменных
        this.ws = null;
        this.playerId = null;
        this.playerNumber = null;
        this.playerName = 'Игрок';
        this.roomId = null;
        this.gameState = 'menu'; // menu, placing, playing, gameover
        this.isYourTurn = false;
        this.connectionAttempts = 0;
        this.maxConnectionAttempts = 5;
        this.reconnectTimeout = null;
        this.pingInterval = null;
        
        // Статистика
        this.stats = {
            wins: 0,
            losses: 0,
            superWeapon: false,
            playerName: 'Игрок'
        };
        
        // Доски
        this.yourBoard = this.createEmptyBoard();
        this.enemyBoard = this.createEmptyBoard();
        this.yourShips = [];
        this.enemyShips = [];
        
        // Расстановка кораблей
        this.shipsToPlace = this.generateShipsToPlace();
        this.placedShips = [];
        this.selectedShip = null;
        this.shipOrientation = 'horizontal';
        
        // DOM элементы
        this.elements = {
            menuScreen: document.getElementById('menuScreen'),
            createRoomScreen: document.getElementById('createRoomScreen'),
            joinRoomScreen: document.getElementById('joinRoomScreen'),
            placementScreen: document.getElementById('placementScreen'),
            gameScreen: document.getElementById('gameScreen'),
            gameOverScreen: document.getElementById('gameOverScreen'),
            roomIdDisplay: document.getElementById('roomIdDisplay'),
            player1Name: document.getElementById('player1Name'),
            player2Name: document.getElementById('player2Name'),
            playerTurn: document.getElementById('playerTurn'),
            yourStats: document.getElementById('yourStats'),
            opponentStats: document.getElementById('opponentStats'),
            winnerDisplay: document.getElementById('winnerDisplay'),
            notification: document.getElementById('notification'),
            notificationText: document.getElementById('notificationText'),
            roomIdInput: document.getElementById('roomIdInput'),
            playerNameInput: document.getElementById('playerNameInput'),
            createRoomBtn: document.getElementById('createRoomBtn'),
            joinRoomBtn: document.getElementById('joinRoomBtn'),
            joinRoomConfirmBtn: document.getElementById('joinRoomConfirmBtn'),
            backToMenuBtn: document.getElementById('backToMenuBtn'),
            backToMenuBtn2: document.getElementById('backToMenuBtn2'),
            backToMenuBtn3: document.getElementById('backToMenuBtn3'),
            startGameBtn: document.getElementById('startGameBtn'),
            randomPlacementBtn: document.getElementById('randomPlacementBtn'),
            rotateShipBtn: document.getElementById('rotateShipBtn'),
            useSuperWeaponBtn: document.getElementById('useSuperWeaponBtn'),
            playAgainBtn: document.getElementById('playAgainBtn')
        };
        
        this.init();
    }
    
    init() {
        this.bindEvents();
        this.showScreen('menuScreen');
        this.updateStatsDisplay();
        this.connectToServer();
    }
    
    bindEvents() {
        // Кнопки меню
        this.elements.createRoomBtn.addEventListener('click', () => this.createRoom());
        this.elements.joinRoomBtn.addEventListener('click', () => this.showScreen('joinRoomScreen'));
        
        // Кнопки "Назад"
        if (this.elements.backToMenuBtn) {
            this.elements.backToMenuBtn.addEventListener('click', () => this.returnToMenu());
        }
        if (this.elements.backToMenuBtn2) {
            this.elements.backToMenuBtn2.addEventListener('click', () => this.returnToMenu());
        }
        if (this.elements.backToMenuBtn3) {
            this.elements.backToMenuBtn3.addEventListener('click', () => this.returnToMenu());
        }
        
        // Присоединение к комнате
        this.elements.joinRoomConfirmBtn.addEventListener('click', () => this.joinRoom());
        this.elements.roomIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });
        
        // Имя игрока
        this.elements.playerNameInput.addEventListener('input', (e) => {
            this.playerName = e.target.value || 'Игрок';
            this.stats.playerName = this.playerName;
            this.updatePlayerInfo();
        });
        
        // Расстановка кораблей
        this.elements.startGameBtn.addEventListener('click', () => this.startGame());
        this.elements.randomPlacementBtn.addEventListener('click', () => this.randomPlacement());
        this.elements.rotateShipBtn.addEventListener('click', () => this.rotateShip());
        
        // Игра
        this.elements.useSuperWeaponBtn.addEventListener('click', () => this.useSuperWeapon());
        this.elements.playAgainBtn.addEventListener('click', () => this.resetGame());
    }
    
    // ==================== СОЕДИНЕНИЕ С СЕРВЕРОМ ====================
    
    connectToServer() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.log('✅ Уже подключено к серверу');
            return;
        }
        
        this.connectionAttempts++;
        
        if (this.connectionAttempts > this.maxConnectionAttempts) {
            this.showNotification('Не удалось подключиться к серверу', 'error');
            return;
        }
        
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        console.log(`🔗 Подключаюсь к ${wsUrl} (попытка ${this.connectionAttempts})`);
        
        try {
            this.ws = new WebSocket(wsUrl);
            this.setupWebSocketHandlers();
        } catch (error) {
            console.error('❌ Ошибка создания WebSocket:', error);
            this.scheduleReconnect();
        }
    }
    
    setupWebSocketHandlers() {
        this.ws.onopen = () => {
            console.log('✅ Успешное подключение к серверу');
            this.connectionAttempts = 0;
            this.showNotification('Подключено к серверу', 'success');
            
            // Отправляем информацию об игроке
            setTimeout(() => {
                if (this.ws.readyState === WebSocket.OPEN) {
                    this.updatePlayerInfo();
                    
                    // Отправляем PLAYER_READY только если мы в меню
                    if (this.gameState === 'menu') {
                        this.ws.send(JSON.stringify({
                            type: 'PLAYER_READY'
                        }));
                        console.log('📤 Отправлен PLAYER_READY');
                    }
                }
            }, 500);
            
            // Запускаем ping для поддержания соединения
            this.startPing();
        };
        
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleServerMessage(data);
            } catch (error) {
                console.error('❌ Ошибка парсинга сообщения:', error, event.data);
            }
        };
        
        this.ws.onclose = (event) => {
            console.log(`🔌 Соединение закрыто. Код: ${event.code}, причина: ${event.reason}`);
            
            if (event.code !== 1000 && event.code !== 1001) {
                this.showNotification('Соединение потеряно. Переподключение...', 'error');
                this.scheduleReconnect();
            }
            
            this.stopPing();
        };
        
        this.ws.onerror = (error) => {
            console.error('❌ WebSocket ошибка:', error);
            this.showNotification('Ошибка соединения', 'error');
        };
    }
    
    scheduleReconnect() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }
        
        const delay = Math.min(1000 * Math.pow(2, this.connectionAttempts), 10000);
        console.log(`🔄 Переподключение через ${delay}ms...`);
        
        this.reconnectTimeout = setTimeout(() => {
            this.connectToServer();
        }, delay);
    }
    
    startPing() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
        }
        
        this.pingInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'PING' }));
            }
        }, 25000); // Каждые 25 секунд
    }
    
    stopPing() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }
    
    updatePlayerInfo() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'PLAYER_INFO',
                playerName: this.playerName
            }));
        }
    }
    
    // ==================== ОБРАБОТКА СООБЩЕНИЙ СЕРВЕРА ====================
    
    handleServerMessage(data) {
        console.log('📨 Получено:', data.type, data);
        
        switch (data.type) {
            case 'CONNECTION_ESTABLISHED':
                this.playerId = data.playerId;
                if (data.stats) {
                    this.stats = { ...this.stats, ...data.stats };
                    if (data.stats.playerName) {
                        this.playerName = data.stats.playerName;
                        this.elements.playerNameInput.value = this.playerName;
                    }
                }
                console.log(`🆔 ID игрока: ${this.playerId}`);
                this.updateStatsDisplay();
                break;
                
            case 'ROOM_CREATED':
                this.roomId = data.roomId;
                this.playerNumber = data.playerNumber;
                this.elements.roomIdDisplay.textContent = this.roomId;
                this.showScreen('createRoomScreen');
                this.showNotification(`Комната создана! ID: ${this.roomId}`, 'success');
                this.updatePlayerNames();
                break;
                
            case 'ROOM_JOINED':
                this.roomId = data.roomId;
                this.playerNumber = data.playerNumber;
                this.showScreen('placementScreen');
                this.showNotification(`Присоединились к комнате ${this.roomId}`, 'success');
                this.updatePlayerNames();
                this.initPlacementScreen();
                break;
                
            case 'PLAYER_CONNECTED':
                this.showNotification(`Игрок ${data.playerNumber} подключился: ${data.playerName}`, 'success');
                this.updatePlayerNames();
                
                // Обновляем имя противника
                if (this.playerNumber === 1) {
                    this.elements.player2Name.textContent = data.playerName;
                } else if (this.playerNumber === 2) {
                    this.elements.player1Name.textContent = data.playerName;
                }
                break;
                
            case 'GAME_START':
                this.handleGameStart(data);
                break;
                
            case 'PLAYER_TURN':
                this.isYourTurn = data.yourTurn;
                this.updateTurnDisplay();
                this.showNotification(data.yourTurn ? 'Ваш ход!' : 'Ход противника', 'info');
                break;
                
            case 'SHOT_RESULT':
                this.handleShotResult(data);
                break;
                
            case 'GAME_OVER':
                this.handleGameOver(data);
                break;
                
            case 'ROOM_INFO':
                this.updateRoomInfo(data);
                break;
                
            case 'ERROR':
                this.showNotification(`Ошибка: ${data.message}`, 'error');
                break;
                
            case 'PLAYER_LEFT':
                this.showNotification(`${data.playerName} покинул комнату`, 'error');
                this.returnToMenu();
                break;
                
            case 'LEFT_ROOM':
                this.showNotification(data.message, 'info');
                this.returnToMenu();
                break;
                
            case 'PONG':
                // Heartbeat ответ - ничего не делаем
                break;
        }
    }
    
    // ==================== ОСНОВНЫЕ ФУНКЦИИ ИГРЫ ====================
    
    createRoom() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.showNotification('Нет соединения с сервером', 'error');
            this.connectToServer();
            return;
        }
        
        this.playerName = this.elements.playerNameInput.value || 'Игрок';
        
        this.ws.send(JSON.stringify({
            type: 'CREATE_ROOM',
            playerName: this.playerName
        }));
        
        this.showNotification('Создание комнаты...', 'info');
    }
    
    joinRoom() {
        const roomId = this.elements.roomIdInput.value.trim();
        if (!roomId) {
            this.showNotification('Введите ID комнаты', 'error');
            return;
        }
        
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.showNotification('Нет соединения с сервером', 'error');
            this.connectToServer();
            return;
        }
        
        this.playerName = this.elements.playerNameInput.value || 'Игрок';
        
        this.ws.send(JSON.stringify({
            type: 'JOIN_ROOM',
            roomId: roomId,
            playerName: this.playerName
        }));
        
        this.showNotification(`Присоединение к комнате ${roomId}...`, 'info');
    }
    
    returnToMenu() {
        // Отправляем сообщение о выходе из комнаты
        if (this.ws && this.ws.readyState === WebSocket.OPEN && this.roomId) {
            this.ws.send(JSON.stringify({
                type: 'LEAVE_ROOM'
            }));
        }
        
        // Сбрасываем состояние
        this.roomId = null;
        this.playerNumber = null;
        this.gameState = 'menu';
        this.isYourTurn = false;
        this.yourBoard = this.createEmptyBoard();
        this.enemyBoard = this.createEmptyBoard();
        this.placedShips = [];
        this.shipsToPlace = this.generateShipsToPlace();
        
        // Возвращаемся в меню
        this.showScreen('menuScreen');
        this.showNotification('Возврат в меню', 'info');
    }
    
    handleGameStart(data) {
        console.log('🎮 Начинаем игру!', data);
        this.isYourTurn = data.yourTurn;
        this.gameState = 'placing';
        
        this.initPlacementScreen();
        this.showScreen('placementScreen');
        this.showNotification('Начинаем игру! Расставьте корабли', 'success');
        
        if (data.roomId) {
            this.roomId = data.roomId;
            this.elements.roomIdDisplay.textContent = this.roomId;
        }
        
        // Обновляем имя противника
        if (data.opponentName) {
            if (this.playerNumber === 1) {
                this.elements.player2Name.textContent = data.opponentName;
            } else {
                this.elements.player1Name.textContent = data.opponentName;
            }
        }
    }
    
    initPlacementScreen() {
        if (this.gameState !== 'placing') return;
        
        this.shipsToPlace = this.generateShipsToPlace();
        this.placedShips = [];
        this.yourBoard = this.createEmptyBoard();
        
        // Очищаем доску
        const placementBoard = document.getElementById('placementBoard');
        if (placementBoard) {
            placementBoard.innerHTML = '';
            
            // Создаем доску 10x10
            for (let y = 0; y < 10; y++) {
                for (let x = 0; x < 10; x++) {
                    const cell = document.createElement('div');
                    cell.className = 'placement-cell';
                    cell.dataset.x = x;
                    cell.dataset.y = y;
                    
                    cell.addEventListener('click', () => this.placeShip(x, y));
                    cell.addEventListener('mouseenter', () => this.previewShip(x, y));
                    
                    placementBoard.appendChild(cell);
                }
            }
        }
        
        this.renderShipsList();
        console.log('Экран расстановки инициализирован');
    }
    
    generateShipsToPlace() {
        return [
            { type: 'carrier', size: 5, placed: false },
            { type: 'battleship', size: 4, placed: false },
            { type: 'cruiser', size: 3, placed: false },
            { type: 'submarine', size: 3, placed: false },
            { type: 'destroyer', size: 2, placed: false }
        ];
    }
    
    createEmptyBoard() {
        return Array(10).fill().map(() => Array(10).fill(0));
    }
    
    placeShip(x, y) {
        if (!this.selectedShip || this.selectedShip.placed) return;
        
        const ship = this.selectedShip;
        const cells = [];
        let canPlace = true;
        
        // Проверяем, можно ли разместить корабль
        for (let i = 0; i < ship.size; i++) {
            const cellX = this.shipOrientation === 'horizontal' ? x + i : x;
            const cellY = this.shipOrientation === 'horizontal' ? y : y + i;
            
            if (cellX >= 10 || cellY >= 10) {
                canPlace = false;
                break;
            }
            
            if (this.yourBoard[cellY][cellX] !== 0) {
                canPlace = false;
                break;
            }
            
            cells.push({ x: cellX, y: cellY });
        }
        
        if (!canPlace) {
            this.showNotification('Нельзя разместить корабль здесь', 'error');
            return;
        }
        
        // Размещаем корабль
        cells.forEach(cell => {
            this.yourBoard[cell.y][cell.x] = 1;
        });
        
        ship.placed = true;
        this.placedShips.push({
            type: ship.type,
            size: ship.size,
            coordinates: cells
        });
        
        this.renderPlacementBoard();
        this.renderShipsList();
        
        // Проверяем, все ли корабли размещены
        if (this.shipsToPlace.every(s => s.placed)) {
            this.elements.startGameBtn.disabled = false;
            this.showNotification('Все корабли размещены!', 'success');
        }
    }
    
    randomPlacement() {
        this.yourBoard = this.createEmptyBoard();
        this.placedShips = [];
        this.shipsToPlace.forEach(ship => ship.placed = false);
        
        const ships = [...this.generateShipsToPlace()];
        
        ships.forEach(ship => {
            let placed = false;
            let attempts = 0;
            
            while (!placed && attempts < 100) {
                attempts++;
                const x = Math.floor(Math.random() * 10);
                const y = Math.floor(Math.random() * 10);
                const orientation = Math.random() > 0.5 ? 'horizontal' : 'vertical';
                
                this.selectedShip = ship;
                this.shipOrientation = orientation;
                
                const cells = [];
                let canPlace = true;
                
                for (let i = 0; i < ship.size; i++) {
                    const cellX = orientation === 'horizontal' ? x + i : x;
                    const cellY = orientation === 'horizontal' ? y : y + i;
                    
                    if (cellX >= 10 || cellY >= 10) {
                        canPlace = false;
                        break;
                    }
                    
                    if (this.yourBoard[cellY][cellX] !== 0) {
                        canPlace = false;
                        break;
                    }
                    
                    cells.push({ x: cellX, y: cellY });
                }
                
                if (canPlace) {
                    cells.forEach(cell => {
                        this.yourBoard[cell.y][cell.x] = 1;
                    });
                    
                    ship.placed = true;
                    this.placedShips.push({
                        type: ship.type,
                        size: ship.size,
                        coordinates: cells
                    });
                    
                    placed = true;
                }
            }
        });
        
        this.renderPlacementBoard();
        this.renderShipsList();
        this.elements.startGameBtn.disabled = false;
        this.showNotification('Корабли расставлены случайным образом', 'success');
    }
    
    rotateShip() {
        this.shipOrientation = this.shipOrientation === 'horizontal' ? 'vertical' : 'horizontal';
        if (this.elements.rotateShipBtn) {
            this.elements.rotateShipBtn.textContent = 
                `Повернуть: ${this.shipOrientation === 'horizontal' ? 'Горизонтально' : 'Вертикально'}`;
        }
    }
    
    startGame() {
        if (this.placedShips.length !== 5) {
            this.showNotification('Разместите все корабли!', 'error');
            return;
        }
        
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.showNotification('Нет соединения с сервером', 'error');
            return;
        }
        
        this.ws.send(JSON.stringify({
            type: 'SHIPS_PLACED',
            ships: this.placedShips
        }));
        
        this.gameState = 'playing';
        this.initGameScreen();
        this.showScreen('gameScreen');
        this.showNotification('Игра началась!', 'success');
    }
    
    initGameScreen() {
        // Очищаем доски
        const yourBoard = document.getElementById('yourBoard');
        const enemyBoard = document.getElementById('enemyBoard');
        
        if (yourBoard) yourBoard.innerHTML = '';
        if (enemyBoard) enemyBoard.innerHTML = '';
        
        // Создаем свою доску
        if (yourBoard) {
            for (let y = 0; y < 10; y++) {
                for (let x = 0; x < 10; x++) {
                    const cell = document.createElement('div');
                    cell.className = 'game-cell';
                    cell.dataset.x = x;
                    cell.dataset.y = y;
                    
                    if (this.yourBoard[y][x] === 1) {
                        cell.classList.add('ship');
                    }
                    
                    yourBoard.appendChild(cell);
                }
            }
        }
        
        // Создаем доску противника
        if (enemyBoard) {
            for (let y = 0; y < 10; y++) {
                for (let x = 0; x < 10; x++) {
                    const cell = document.createElement('div');
                    cell.className = 'game-cell';
                    cell.dataset.x = x;
                    cell.dataset.y = y;
                    
                    cell.addEventListener('click', () => this.fireShot(x, y));
                    
                    enemyBoard.appendChild(cell);
                }
            }
        }
        
        this.updateStatsDisplay();
        this.updateTurnDisplay();
        
        // Обновляем кнопку супер-оружия
        if (this.elements.useSuperWeaponBtn) {
            this.elements.useSuperWeaponBtn.disabled = !this.stats.superWeapon;
        }
    }
    
    fireShot(x, y) {
        if (!this.isYourTurn || this.gameState !== 'playing') {
            return;
        }
        
        if (this.enemyBoard[y][x] !== 0) {
            this.showNotification('Уже стреляли сюда!', 'error');
            return;
        }
        
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.showNotification('Нет соединения с сервером', 'error');
            return;
        }
        
        this.ws.send(JSON.stringify({
            type: 'FIRE_SHOT',
            x: x,
            y: y
        }));
        
        this.isYourTurn = false;
        this.updateTurnDisplay();
    }
    
    useSuperWeapon() {
        if (!this.stats.superWeapon) {
            this.showNotification('Супер-оружие недоступно!', 'error');
            return;
        }
        
        if (!this.isYourTurn) {
            this.showNotification('Не ваш ход!', 'error');
            return;
        }
        
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.showNotification('Нет соединения с сервером', 'error');
            return;
        }
        
        if (confirm('Использовать ЯДЕРНУЮ БОМБУ? Уничтожит весь флот противника за один ход!')) {
            this.ws.send(JSON.stringify({
                type: 'USE_SUPER_WEAPON'
            }));
            
            this.showNotification('Ядерная бомба запущена!', 'success');
        }
    }
    
    handleShotResult(data) {
        // Обновляем доску противника
        this.enemyBoard[data.y][data.x] = data.hit ? 2 : 3;
        
        // Обновляем отображение
        const cell = document.querySelector(`#enemyBoard .game-cell[data-x="${data.x}"][data-y="${data.y}"]`);
        if (cell) {
            cell.classList.add(data.hit ? 'hit' : 'miss');
        }
        
        // Показываем уведомление
        if (data.hit) {
            if (data.sunk) {
                this.showNotification(`Потоплен ${this.getShipName(data.shipType)}!`, 'success');
            } else {
                this.showNotification('Попадание!', 'success');
            }
        } else {
            this.showNotification('Промах!', 'info');
        }
        
        // Обновляем очередь хода
        this.isYourTurn = data.yourTurn;
        this.updateTurnDisplay();
    }
    
    handleGameOver(data) {
        this.gameState = 'gameover';
        
        // Обновляем статистику
        if (data.stats) {
            this.stats = { ...this.stats, ...data.stats };
        }
        
        const isWinner = data.winnerId === this.playerId;
        
        // Обновляем отображение
        if (this.elements.winnerDisplay) {
            this.elements.winnerDisplay.textContent = isWinner ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ';
            this.elements.winnerDisplay.className = isWinner ? 'winner' : 'loser';
        }
        
        // Обновляем статистику
        this.updateStatsDisplay();
        
        // Показываем экран окончания игры
        this.showScreen('gameOverScreen');
        
        // Показываем уведомление
        if (isWinner) {
            this.showNotification('Вы победили!', 'success');
        } else {
            this.showNotification('Вы проиграли', 'error');
        }
        
        // Обновляем итоговую статистику
        if (this.elements.finalWins) {
            this.elements.finalWins.textContent = this.stats.wins;
        }
        if (this.elements.finalLosses) {
            this.elements.finalLosses.textContent = this.stats.losses;
        }
        if (this.elements.gameReason) {
            this.elements.gameReason.textContent = data.reason === 'nuclear' ? 'Ядерная победа!' : 'Все корабли потоплены!';
        }
    }
    
    // ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
    
    showScreen(screenName) {
        // Скрываем все экраны
        const screens = ['menuScreen', 'createRoomScreen', 'joinRoomScreen', 
                         'placementScreen', 'gameScreen', 'gameOverScreen'];
        
        screens.forEach(screen => {
            const element = this.elements[screen];
            if (element) {
                element.classList.remove('active');
            }
        });
        
        // Показываем нужный экран
        const targetScreen = this.elements[screenName];
        if (targetScreen) {
            targetScreen.classList.add('active');
            console.log(`📱 Переключено на экран: ${screenName}`);
        }
    }
    
    showNotification(message, type = 'info') {
        const notification = this.elements.notification;
        const text = this.elements.notificationText;
        
        if (!notification || !text) return;
        
        text.textContent = message;
        notification.className = `notification ${type}`;
        notification.style.display = 'block';
        
        console.log(`📢 ${type.toUpperCase()}: ${message}`);
        
        // Автоматическое скрытие через 3 секунды
        setTimeout(() => {
            if (notification.style.display === 'block') {
                notification.style.display = 'none';
            }
        }, 3000);
    }
    
    updatePlayerNames() {
        if (this.playerNumber === 1) {
            if (this.elements.player1Name) {
                this.elements.player1Name.textContent = this.playerName;
            }
            if (this.elements.player2Name) {
                this.elements.player2Name.textContent = 'Ожидание...';
            }
        } else if (this.playerNumber === 2) {
            if (this.elements.player2Name) {
                this.elements.player2Name.textContent = this.playerName;
            }
        }
    }
    
    updateTurnDisplay() {
        if (!this.elements.playerTurn) return;
        
        if (this.isYourTurn) {
            this.elements.playerTurn.textContent = 'ВАШ ХОД';
            this.elements.playerTurn.className = 'your-turn';
        } else {
            this.elements.playerTurn.textContent = 'ХОД ПРОТИВНИКА';
            this.elements.playerTurn.className = 'opponent-turn';
        }
    }
    
    updateStatsDisplay() {
        if (this.elements.yourStats) {
            this.elements.yourStats.innerHTML = `
                <strong>Ваша статистика:</strong><br>
                Имя: ${this.playerName}<br>
                Побед: ${this.stats.wins}<br>
                Поражений: ${this.stats.losses}<br>
                Супер-оружие: ${this.stats.superWeapon ? '✅ Доступно' : '❌ Недоступно'}
            `;
        }
        
        // Обновляем счетчики в меню
        if (document.getElementById('winsCount')) {
            document.getElementById('winsCount').textContent = this.stats.wins;
        }
        if (document.getElementById('superWeaponStatus')) {
            document.getElementById('superWeaponStatus').textContent = this.stats.superWeapon ? '✅' : '❌';
        }
    }
    
    updateRoomInfo(data) {
        // Обновляем информацию о комнате
        console.log('Информация о комнате:', data);
        
        if (data.players) {
            data.players.forEach(player => {
                if (player.playerNumber === 1 && this.playerNumber !== 1) {
                    this.elements.player1Name.textContent = player.playerName;
                } else if (player.playerNumber === 2 && this.playerNumber !== 2) {
                    this.elements.player2Name.textContent = player.playerName;
                }
            });
        }
    }
    
    renderPlacementBoard() {
        const cells = document.querySelectorAll('#placementBoard .placement-cell');
        cells.forEach(cell => {
            const x = parseInt(cell.dataset.x);
            const y = parseInt(cell.dataset.y);
            
            cell.className = 'placement-cell';
            if (this.yourBoard[y][x] === 1) {
                cell.classList.add('ship');
            }
        });
    }
    
    renderShipsList() {
        const list = document.getElementById('shipsList');
        if (!list) return;
        
        list.innerHTML = '';
        
        this.shipsToPlace.forEach((ship, index) => {
            const item = document.createElement('div');
            item.className = `ship-item ${ship.placed ? 'placed' : 'available'}`;
            if (this.selectedShip === ship) item.classList.add('selected');
            
            item.innerHTML = `
                <span>${this.getShipName(ship.type)} (${ship.size})</span>
                <span>${ship.placed ? '✓' : '◯'}</span>
            `;
            
            item.addEventListener('click', () => {
                if (!ship.placed) {
                    this.selectedShip = ship;
                    this.renderShipsList();
                }
            });
            
            list.appendChild(item);
        });
    }
    
    previewShip(x, y) {
        if (!this.selectedShip || this.selectedShip.placed) return;
        
        // Временно подсвечиваем клетки для размещения
        const cells = document.querySelectorAll('#placementBoard .placement-cell');
        cells.forEach(cell => cell.classList.remove('preview', 'invalid'));
        
        const ship = this.selectedShip;
        let canPlace = true;
        
        for (let i = 0; i < ship.size; i++) {
            const cellX = this.shipOrientation === 'horizontal' ? x + i : x;
            const cellY = this.shipOrientation === 'horizontal' ? y : y + i;
            
            if (cellX >= 10 || cellY >= 10) {
                canPlace = false;
                break;
            }
            
            const cell = document.querySelector(
                `#placementBoard .placement-cell[data-x="${cellX}"][data-y="${cellY}"]`
            );
            
            if (cell) {
                cell.classList.add('preview');
                if (this.yourBoard[cellY][cellX] !== 0) {
                    cell.classList.add('invalid');
                    canPlace = false;
                }
            }
        }
    }
    
    getShipName(type) {
        const names = {
            'carrier': 'Авианосец',
            'battleship': 'Линкор',
            'cruiser': 'Крейсер',
            'submarine': 'Подлодка',
            'destroyer': 'Эсминец'
        };
        return names[type] || type;
    }
    
    resetGame() {
        // Отправляем сообщение о выходе из комнаты
        if (this.ws && this.ws.readyState === WebSocket.OPEN && this.roomId) {
            this.ws.send(JSON.stringify({
                type: 'LEAVE_ROOM'
            }));
        }
        
        // Полный сброс состояния
        this.roomId = null;
        this.playerNumber = null;
        this.gameState = 'menu';
        this.isYourTurn = false;
        this.yourBoard = this.createEmptyBoard();
        this.enemyBoard = this.createEmptyBoard();
        this.placedShips = [];
        this.shipsToPlace = this.generateShipsToPlace();
        
        // Возвращаемся в меню
        this.showScreen('menuScreen');
        this.showNotification('Игра сброшена', 'info');
        this.updateStatsDisplay();
    }
}

// Запуск игры при загрузке страницы
window.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Инициализация игры...');
    window.game = new Game();
});
