class Game {
    constructor() {
        this.ws = null;
        this.playerId = null;
        this.playerNumber = null;
        this.playerName = 'Игрок';
        this.roomId = null;
        this.gameState = 'menu';
        this.isYourTurn = false;
        
        this.stats = { wins: 0, losses: 0, superWeapon: false };
        
        this.yourBoard = this.createEmptyBoard();
        this.enemyBoard = this.createEmptyBoard();
        this.yourShips = [];
        
        this.shipsToPlace = [
            { type: 'carrier', size: 5, placed: false },
            { type: 'battleship', size: 4, placed: false },
            { type: 'cruiser', size: 3, placed: false },
            { type: 'submarine', size: 3, placed: false },
            { type: 'destroyer', size: 2, placed: false }
        ];
        this.placedShips = [];
        this.selectedShip = this.shipsToPlace[0];
        this.shipOrientation = 'horizontal';
        
        this.elements = {
            menuScreen: document.getElementById('menuScreen'),
            createRoomScreen: document.getElementById('createRoomScreen'),
            joinRoomScreen: document.getElementById('joinRoomScreen'),
            placementScreen: document.getElementById('placementScreen'),
            gameScreen: document.getElementById('gameScreen'),
            gameOverScreen: document.getElementById('gameOverScreen')
        };
        
        this.init();
    }
    
    init() {
        this.bindEvents();
        this.showScreen('menuScreen');
        this.connectToServer();
        this.setupInputs();
    }
    
    bindEvents() {
        // Основные кнопки
        document.getElementById('createRoomBtn')?.addEventListener('click', () => this.createRoom());
        document.getElementById('joinRoomBtn')?.addEventListener('click', () => this.showScreen('joinRoomScreen'));
        
        // Кнопки "Назад"
        document.querySelectorAll('.back-to-menu').forEach(btn => {
            btn.addEventListener('click', () => this.returnToMenu());
        });
        
        // Присоединение к комнате
        document.getElementById('joinRoomConfirmBtn')?.addEventListener('click', () => this.joinRoom());
        
        // Расстановка кораблей
        document.getElementById('startGameBtn')?.addEventListener('click', () => this.startGame());
        document.getElementById('randomPlacementBtn')?.addEventListener('click', () => this.randomPlacement());
        document.getElementById('rotateShipBtn')?.addEventListener('click', () => this.rotateShip());
        
        // Игра
        document.getElementById('useSuperWeaponBtn')?.addEventListener('click', () => this.useSuperWeapon());
        document.getElementById('playAgainBtn')?.addEventListener('click', () => this.playAgain());
    }
    
    setupInputs() {
        const nameInput = document.getElementById('playerNameInput');
        if (nameInput) {
            nameInput.value = this.playerName;
            nameInput.addEventListener('input', (e) => {
                this.playerName = e.target.value || 'Игрок';
            });
        }
        
        const roomInput = document.getElementById('roomIdInput');
        if (roomInput) {
            roomInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.joinRoom();
            });
        }
    }
    
    connectToServer() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('✅ Подключено к серверу');
            this.showNotification('Подключено к серверу', 'success');
            
            setTimeout(() => {
                if (this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({
                        type: 'PLAYER_INFO',
                        playerName: this.playerName
                    }));
                }
            }, 500);
        };
        
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleServerMessage(data);
            } catch (error) {
                console.error('❌ Ошибка парсинга:', error);
            }
        };
        
        this.ws.onclose = () => {
            console.log('🔌 Соединение закрыто');
            setTimeout(() => this.connectToServer(), 3000);
        };
        
        this.ws.onerror = (error) => {
            console.error('❌ WebSocket ошибка:', error);
        };
    }
    
    handleServerMessage(data) {
        console.log('📨 Получено:', data.type);
        
        switch (data.type) {
            case 'CONNECTION_ESTABLISHED':
                this.playerId = data.playerId;
                if (data.stats) {
                    this.stats = { ...this.stats, ...data.stats };
                }
                this.updateStatsDisplay();
                break;
                
            case 'ROOM_CREATED':
                this.roomId = data.roomId;
                this.playerNumber = data.playerNumber;
                document.getElementById('roomIdDisplay').textContent = this.roomId;
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
                if (data.playerNumber === 1) {
                    document.getElementById('player1Name').textContent = data.playerName;
                } else {
                    document.getElementById('player2Name').textContent = data.playerName;
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
                
            case 'ERROR':
                this.showNotification(`Ошибка: ${data.message}`, 'error');
                break;
                
            case 'PLAYER_LEFT':
                this.showNotification('Противник покинул комнату', 'error');
                this.returnToMenu();
                break;
        }
    }
    
    createRoom() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.showNotification('Нет соединения', 'error');
            return;
        }
        
        this.ws.send(JSON.stringify({
            type: 'CREATE_ROOM',
            playerName: this.playerName
        }));
    }
    
    joinRoom() {
        const roomId = document.getElementById('roomIdInput').value.trim();
        if (!roomId) {
            this.showNotification('Введите ID комнаты', 'error');
            return;
        }
        
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.showNotification('Нет соединения', 'error');
            return;
        }
        
        this.ws.send(JSON.stringify({
            type: 'JOIN_ROOM',
            roomId: roomId,
            playerName: this.playerName
        }));
    }
    
    returnToMenu() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN && this.roomId) {
            this.ws.send(JSON.stringify({ type: 'LEAVE_ROOM' }));
        }
        
        this.roomId = null;
        this.playerNumber = null;
        this.gameState = 'menu';
        this.isYourTurn = false;
        this.yourBoard = this.createEmptyBoard();
        this.enemyBoard = this.createEmptyBoard();
        this.placedShips = [];
        this.shipsToPlace.forEach(s => s.placed = false);
        this.selectedShip = this.shipsToPlace[0];
        
        this.showScreen('menuScreen');
    }
    
    handleGameStart(data) {
        this.isYourTurn = data.yourTurn;
        this.gameState = 'placing';
        
        this.initPlacementScreen();
        this.showScreen('placementScreen');
        this.showNotification('Расставьте корабли!', 'success');
        
        if (data.opponentName) {
            if (this.playerNumber === 1) {
                document.getElementById('player2Name').textContent = data.opponentName;
            } else {
                document.getElementById('player1Name').textContent = data.opponentName;
            }
        }
    }
    
    initPlacementScreen() {
        if (this.gameState !== 'placing') return;
        
        // Создаем доску для расстановки
        const board = document.getElementById('placementBoard');
        board.innerHTML = '';
        
        for (let y = 0; y < 10; y++) {
            for (let x = 0; x < 10; x++) {
                const cell = document.createElement('div');
                cell.className = 'placement-cell';
                cell.dataset.x = x;
                cell.dataset.y = y;
                
                cell.addEventListener('click', () => this.placeShip(x, y));
                cell.addEventListener('mouseenter', () => this.previewShip(x, y));
                
                board.appendChild(cell);
            }
        }
        
        this.renderShipsList();
        this.renderPlacementBoard();
    }
    
    createEmptyBoard() {
        return Array(10).fill().map(() => Array(10).fill(0));
    }
    
    placeShip(x, y) {
        if (!this.selectedShip || this.selectedShip.placed) return;
        
        const ship = this.selectedShip;
        const cells = [];
        let canPlace = true;
        
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
            this.showNotification('Нельзя разместить здесь', 'error');
            return;
        }
        
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
        
        if (this.shipsToPlace.every(s => s.placed)) {
            document.getElementById('startGameBtn').disabled = false;
            this.showNotification('Все корабли размещены!', 'success');
        }
    }
    
    randomPlacement() {
        this.yourBoard = this.createEmptyBoard();
        this.placedShips = [];
        this.shipsToPlace.forEach(s => s.placed = false);
        
        this.shipsToPlace.forEach(ship => {
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
        document.getElementById('startGameBtn').disabled = false;
        this.showNotification('Корабли расставлены случайно', 'success');
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
        
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.showNotification('Нет соединения', 'error');
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
        // Создаем свою доску
        const yourBoard = document.getElementById('yourBoard');
        yourBoard.innerHTML = '';
        
        for (let y = 0; y < 10; y++) {
            for (let x = 0; x < 10; x++) {
                const cell = document.createElement('div');
                cell.className = 'game-cell';
                if (this.yourBoard[y][x] === 1) {
                    cell.classList.add('ship');
                }
                yourBoard.appendChild(cell);
            }
        }
        
        // Создаем доску противника
        const enemyBoard = document.getElementById('enemyBoard');
        enemyBoard.innerHTML = '';
        
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
        
        this.updateTurnDisplay();
        this.updateStatsDisplay();
    }
    
    fireShot(x, y) {
        if (!this.isYourTurn || this.gameState !== 'playing') return;
        
        if (this.enemyBoard[y][x] !== 0) {
            this.showNotification('Уже стреляли сюда', 'error');
            return;
        }
        
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.showNotification('Нет соединения', 'error');
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
            this.showNotification('Супер-оружие недоступно', 'error');
            return;
        }
        
        if (!this.isYourTurn) {
            this.showNotification('Не ваш ход', 'error');
            return;
        }
        
        if (confirm('Использовать ЯДЕРНУЮ БОМБУ?')) {
            this.ws.send(JSON.stringify({ type: 'USE_SUPER_WEAPON' }));
        }
    }
    
    handleShotResult(data) {
        const cell = document.querySelector(`#enemyBoard .game-cell[data-x="${data.x}"][data-y="${data.y}"]`);
        
        if (data.hit) {
            this.enemyBoard[data.y][data.x] = 2;
            cell.classList.add('hit');
            
            if (data.sunk) {
                this.showNotification(`Потоплен ${this.getShipName(data.shipType)}!`, 'success');
            } else {
                this.showNotification('Попадание!', 'success');
            }
        } else {
            this.enemyBoard[data.y][data.x] = 3;
            cell.classList.add('miss');
            this.showNotification('Промах!', 'info');
        }
        
        this.isYourTurn = data.yourTurn;
        this.updateTurnDisplay();
    }
    
    handleGameOver(data) {
        this.gameState = 'gameover';
        
        if (data.stats) {
            this.stats = { ...this.stats, ...data.stats };
        }
        
        const isWinner = data.winnerId === this.playerId;
        document.getElementById('winnerDisplay').textContent = isWinner ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ';
        document.getElementById('winnerDisplay').className = isWinner ? 'winner' : 'loser';
        
        document.getElementById('finalWins').textContent = this.stats.wins;
        document.getElementById('finalLosses').textContent = this.stats.losses;
        document.getElementById('gameResult').textContent = isWinner ? 'Вы победили!' : 'Вы проиграли';
        
        this.showScreen('gameOverScreen');
        this.showNotification(isWinner ? 'Победа!' : 'Поражение', isWinner ? 'success' : 'error');
    }
    
    playAgain() {
        this.returnToMenu();
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
        
        this.shipsToPlace.forEach(ship => {
            const item = document.createElement('div');
            item.className = `ship-item ${ship.placed ? 'placed' : 'available'} ${this.selectedShip === ship ? 'selected' : ''}`;
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
            
            const cell = document.querySelector(`#placementBoard .placement-cell[data-x="${cellX}"][data-y="${cellY}"]`);
            
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
    
    showScreen(screenName) {
        Object.values(this.elements).forEach(element => {
            if (element) element.classList.remove('active');
        });
        
        const target = this.elements[screenName];
        if (target) target.classList.add('active');
    }
    
    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        const text = document.getElementById('notificationText');
        
        if (!notification || !text) return;
        
        text.textContent = message;
        notification.className = `notification ${type}`;
        notification.style.display = 'block';
        
        setTimeout(() => {
            notification.style.display = 'none';
        }, 3000);
    }
    
    updatePlayerNames() {
        if (this.playerNumber === 1) {
            document.getElementById('player1Name').textContent = this.playerName;
            document.getElementById('player2Name').textContent = 'Ожидание...';
        } else if (this.playerNumber === 2) {
            document.getElementById('player2Name').textContent = this.playerName;
        }
    }
    
    updateTurnDisplay() {
        const element = document.getElementById('playerTurn');
        if (!element) return;
        
        if (this.isYourTurn) {
            element.textContent = 'ВАШ ХОД';
            element.className = 'your-turn';
        } else {
            element.textContent = 'ХОД ПРОТИВНИКА';
            element.className = 'opponent-turn';
        }
    }
    
    updateStatsDisplay() {
        const element = document.getElementById('yourStats');
        if (!element) return;
        
        element.innerHTML = `
            <strong>Статистика:</strong><br>
            Побед: ${this.stats.wins}<br>
            Поражений: ${this.stats.losses}<br>
            Супер-оружие: ${this.stats.superWeapon ? '✅ Доступно' : '❌ Недоступно'}
        `;
        
        const superBtn = document.getElementById('useSuperWeaponBtn');
        if (superBtn) {
            superBtn.disabled = !this.stats.superWeapon;
        }
        
        const winsEl = document.getElementById('winsCount');
        if (winsEl) winsEl.textContent = this.stats.wins;
        
        const weaponEl = document.getElementById('superWeaponStatus');
        if (weaponEl) weaponEl.textContent = this.stats.superWeapon ? '✅' : '❌';
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.game = new Game();
});
