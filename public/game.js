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
        
        // Статистика
        this.stats = {
            wins: 0,
            losses: 0,
            superWeapon: false
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
            playerNameInput: document.getElementById('playerNameInput')
        };
        
        this.init();
    }
    
    init() {
        this.bindEvents();
        this.showScreen('menuScreen');
        this.updateStatsDisplay();
    }
    
    bindEvents() {
        // Кнопки меню
        document.getElementById('createRoomBtn').addEventListener('click', () => this.createRoom());
        document.getElementById('joinRoomBtn').addEventListener('click', () => this.showScreen('joinRoomScreen'));
        document.getElementById('backToMenuBtn').addEventListener('click', () => this.showScreen('menuScreen'));
        document.getElementById('joinRoomConfirmBtn').addEventListener('click', () => this.joinRoom());
        
        // Расстановка кораблей
        document.getElementById('startGameBtn').addEventListener('click', () => this.startGame());
        document.getElementById('randomPlacementBtn').addEventListener('click', () => this.randomPlacement());
        document.getElementById('rotateShipBtn').addEventListener('click', () => this.rotateShip());
        
        // Игра
        document.getElementById('useSuperWeaponBtn').addEventListener('click', () => this.useSuperWeapon());
        document.getElementById('playAgainBtn').addEventListener('click', () => this.resetGame());
        
        // Ввод имени
        this.elements.playerNameInput.addEventListener('input', (e) => {
            this.playerName = e.target.value || 'Игрок';
        });
    }
    
    // ==================== СЕТЕВОЙ КОД ====================
    
    connectToServer() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        this.ws = new WebSocket(wsUrl);
        
        // ===== ВАЖНО: ЭТОТ КОД ДОБАВЛЯЕМ СЮДА =====
        this.ws.onopen = () => {
            console.log('✅ Подключено к серверу');
            
            // НЕМЕДЛЕННО отправляем PLAYER_READY при подключении
            setTimeout(() => {
                if (this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({
                        type: 'PLAYER_READY'
                    }));
                    console.log('📤 Отправлен PLAYER_READY');
                }
            }, 1000);
            
            this.showNotification('Подключено к серверу', 'success');
        };
        // ===== КОНЕЦ ДОБАВЛЕННОГО КОДА =====
        
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('📨 Получено сообщение:', data.type, data);
                this.handleServerMessage(data);
            } catch (error) {
                console.error('❌ Ошибка парсинга:', error);
            }
        };
        
        this.ws.onclose = () => {
            console.log('🔌 Соединение закрыто');
            this.showNotification('Соединение потеряно', 'error');
        };
        
        this.ws.onerror = (error) => {
            console.error('❌ WebSocket ошибка:', error);
        };
    }
    
    handleServerMessage(data) {
        switch (data.type) {
            case 'CONNECTION_ESTABLISHED':
                this.playerId = data.playerId;
                this.stats = data.stats || this.stats;
                console.log(`🆔 ID игрока: ${this.playerId}`);
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
                break;
                
            case 'PLAYER_CONNECTED':
                this.showNotification(`Игрок ${data.playerNumber} подключился: ${data.playerName}`, 'success');
                this.updatePlayerNames();
                
                // Если подключился второй игрок - автоматически начинаем
                if (data.playerNumber !== this.playerNumber) {
                    setTimeout(() => {
                        this.initPlacementScreen();
                    }, 1000);
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
        }
    }
    
    // ==================== ИГРОВАЯ ЛОГИКА ====================
    
    createRoom() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.connectToServer();
            setTimeout(() => this.createRoom(), 500);
            return;
        }
        
        this.ws.send(JSON.stringify({
            type: 'CREATE_ROOM',
            playerName: this.playerName
        }));
    }
    
    joinRoom() {
        const roomId = this.elements.roomIdInput.value.trim();
        if (!roomId) {
            this.showNotification('Введите ID комнаты', 'error');
            return;
        }
        
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.connectToServer();
            setTimeout(() => this.joinRoom(), 500);
            return;
        }
        
        this.ws.send(JSON.stringify({
            type: 'JOIN_ROOM',
            roomId: roomId,
            playerName: this.playerName
        }));
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
    }
    
    initPlacementScreen() {
        if (this.gameState !== 'placing') return;
        
        this.shipsToPlace = this.generateShipsToPlace();
        this.placedShips = [];
        this.yourBoard = this.createEmptyBoard();
        
        // Очищаем доску
        const placementBoard = document.getElementById('placementBoard');
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
            
            // Проверяем соседние клетки
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = cellX + dx;
                    const ny = cellY + dy;
                    
                    if (nx >= 0 && nx < 10 && ny >= 0 && ny < 10) {
                        if (this.yourBoard[ny][nx] !== 0) {
                            canPlace = false;
                        }
                    }
                }
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
            document.getElementById('startGameBtn').disabled = false;
        }
    }
    
    randomPlacement() {
        this.yourBoard = this.createEmptyBoard();
        this.placedShips = [];
        this.shipsToPlace.forEach(ship => ship.placed = false);
        
        const ships = this.generateShipsToPlace();
        
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
                
                // Временно отключаем проверку соседних клеток для случайной расстановки
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
        document.getElementById('startGameBtn').disabled = false;
    }
    
    rotateShip() {
        this.shipOrientation = this.shipOrientation === 'horizontal' ? 'vertical' : 'horizontal';
        document.getElementById('rotateShipBtn').textContent = 
            `Повернуть: ${this.shipOrientation === 'horizontal' ? 'Горизонтально' : 'Вертикально'}`;
    }
    
    startGame() {
        if (this.placedShips.length !== 5) {
            this.showNotification('Разместите все корабли!', 'error');
            return;
        }
        
        this.ws.send(JSON.stringify({
            type: 'SHIPS_PLACED',
            ships: this.placedShips
        }));
        
        this.gameState = 'playing';
        this.initGameScreen();
        this.showScreen('gameScreen');
    }
    
    initGameScreen() {
        // Очищаем доски
        const yourBoard = document.getElementById('yourBoard');
        const enemyBoard = document.getElementById('enemyBoard');
        yourBoard.innerHTML = '';
        enemyBoard.innerHTML = '';
        
        // Создаем свою доску
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
        
        // Создаем доску противника
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
        
        this.updateStatsDisplay();
        this.updateTurnDisplay();
    }
    
    fireShot(x, y) {
        if (!this.isYourTurn || this.gameState !== 'playing') {
            return;
        }
        
        if (this.enemyBoard[y][x] !== 0) {
            this.showNotification('Уже стреляли сюда!', 'error');
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
        
        if (confirm('Использовать ЯДЕРНУЮ БОМБУ? Уничтожит весь флот противника за один ход!')) {
            this.ws.send(JSON.stringify({
                type: 'USE_SUPER_WEAPON'
            }));
        }
    }
    
    handleShotResult(data) {
        const cell = document.querySelector(`#enemyBoard .game-cell[data-x="${data.x}"][data-y="${data.y}"]`);
        
        if (data.hit) {
            this.enemyBoard[data.y][data.x] = 2; // Попадание
            if (cell) cell.classList.add('hit');
            
            if (data.sunk) {
                this.showNotification(`Потоплен ${this.getShipName(data.shipType)}!`, 'success');
            } else {
                this.showNotification('Попадание!', 'success');
            }
        } else {
            this.enemyBoard[data.y][data.x] = 3; // Промах
            if (cell) cell.classList.add('miss');
            this.showNotification('Промах!', 'info');
        }
        
        this.isYourTurn = data.yourTurn;
        this.updateTurnDisplay();
    }
    
    handleGameOver(data) {
        this.gameState = 'gameover';
        this.stats = data.stats;
        
        const isWinner = data.winnerId === this.playerId;
        this.elements.winnerDisplay.textContent = isWinner ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ';
        this.elements.winnerDisplay.className = isWinner ? 'winner' : 'loser';
        
        this.showScreen('gameOverScreen');
        this.updateStatsDisplay();
        
        if (isWinner) {
            this.showNotification('Вы победили!', 'success');
        } else {
            this.showNotification('Вы проиграли', 'error');
        }
    }
    
    // ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
    
    showScreen(screenName) {
        // Скрываем все экраны
        Object.values(this.elements).forEach(element => {
            if (element && element.classList && element.classList.contains('screen')) {
                element.classList.remove('active');
            }
        });
        
        // Показываем нужный экран
        if (this.elements[screenName]) {
            this.elements[screenName].classList.add('active');
        }
    }
    
    showNotification(message, type = 'info') {
        const notification = this.elements.notification;
        const text = this.elements.notificationText;
        
        text.textContent = message;
        notification.className = `notification ${type}`;
        notification.style.display = 'block';
        
        setTimeout(() => {
            notification.style.display = 'none';
        }, 3000);
    }
    
    updatePlayerNames() {
        if (this.playerNumber === 1) {
            this.elements.player1Name.textContent = this.playerName;
            this.elements.player2Name.textContent = 'Ожидание...';
        } else if (this.playerNumber === 2) {
            this.elements.player2Name.textContent = this.playerName;
        }
    }
    
    updateTurnDisplay() {
        if (this.isYourTurn) {
            this.elements.playerTurn.textContent = 'ВАШ ХОД';
            this.elements.playerTurn.className = 'your-turn';
        } else {
            this.elements.playerTurn.textContent = 'ХОД ПРОТИВНИКА';
            this.elements.playerTurn.className = 'opponent-turn';
        }
    }
    
    updateStatsDisplay() {
        this.elements.yourStats.innerHTML = `
            <strong>Ваша статистика:</strong><br>
            Побед: ${this.stats.wins}<br>
            Поражений: ${this.stats.losses}<br>
            Супер-оружие: ${this.stats.superWeapon ? '✅ Доступно' : '❌ Недоступно'}
        `;
    }
    
    updateRoomInfo(data) {
        // Обновляем информацию о комнате
        console.log('Информация о комнате:', data);
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
        cells.forEach(cell => cell.classList.remove('preview'));
        
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
        this.gameState = 'menu';
        this.isYourTurn = false;
        this.yourBoard = this.createEmptyBoard();
        this.enemyBoard = this.createEmptyBoard();
        this.placedShips = [];
        this.shipsToPlace = this.generateShipsToPlace();
        
        this.showScreen('menuScreen');
    }
}

// Запуск игры при загрузке страницы
window.addEventListener('DOMContentLoaded', () => {
    window.game = new Game();
});
