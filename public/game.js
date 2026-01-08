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
        this.enemyShips = [];
        this.shotsMade = new Set();
        
        // Корабли по правилам: 1x4, 2x3, 3x2, 4x1
        this.shipsToPlace = [
            // 1 четырехпалубный
            { type: 'battleship', size: 4, placed: false, count: 1 },
            // 2 трехпалубных
            { type: 'cruiser', size: 3, placed: false, count: 2 },
            { type: 'cruiser', size: 3, placed: false, count: 2 },
            // 3 двухпалубных
            { type: 'destroyer', size: 2, placed: false, count: 3 },
            { type: 'destroyer', size: 2, placed: false, count: 3 },
            { type: 'destroyer', size: 2, placed: false, count: 3 },
            // 4 однопалубных
            { type: 'submarine', size: 1, placed: false, count: 4 },
            { type: 'submarine', size: 1, placed: false, count: 4 },
            { type: 'submarine', size: 1, placed: false, count: 4 },
            { type: 'submarine', size: 1, placed: false, count: 4 }
        ];
        
        this.placedShips = [];
        this.selectedShip = null;
        this.shipOrientation = 'horizontal';
        this.availableShips = this.getAvailableShips();
        
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
        this.updateStatsDisplay();
    }
    
    getAvailableShips() {
        return {
            'battleship': { size: 4, count: 1, placed: 0 },
            'cruiser': { size: 3, count: 2, placed: 0 },
            'destroyer': { size: 2, count: 3, placed: 0 },
            'submarine': { size: 1, count: 4, placed: 0 }
        };
    }
    
    bindEvents() {
        document.getElementById('createRoomBtn')?.addEventListener('click', () => this.createRoom());
        document.getElementById('joinRoomBtn')?.addEventListener('click', () => this.showScreen('joinRoomScreen'));
        
        document.querySelectorAll('.back-to-menu').forEach(btn => {
            btn.addEventListener('click', () => this.returnToMenu());
        });
        
        document.getElementById('joinRoomConfirmBtn')?.addEventListener('click', () => this.joinRoom());
        
        document.getElementById('startGameBtn')?.addEventListener('click', () => this.startGame());
        document.getElementById('randomPlacementBtn')?.addEventListener('click', () => this.randomPlacement());
        document.getElementById('rotateShipBtn')?.addEventListener('click', () => this.rotateShip());
        
        document.getElementById('useSuperWeaponBtn')?.addEventListener('click', () => this.useSuperWeapon());
        document.getElementById('playAgainBtn')?.addEventListener('click', () => this.playAgain());
    }
    
    setupInputs() {
        const nameInput = document.getElementById('playerNameInput');
        if (nameInput) {
            nameInput.value = this.playerName;
            nameInput.addEventListener('input', (e) => {
                this.playerName = e.target.value || 'Игрок';
                this.updatePlayerInfo();
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
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            return;
        }
        
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        console.log(`🔗 Подключение к ${wsUrl}`);
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('✅ Подключено к серверу');
            this.showNotification('Подключено к серверу', 'success');
            
            setTimeout(() => {
                if (this.ws.readyState === WebSocket.OPEN) {
                    this.updatePlayerInfo();
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
            this.showNotification('Соединение потеряно', 'error');
            
            setTimeout(() => {
                this.connectToServer();
            }, 3000);
        };
        
        this.ws.onerror = (error) => {
            console.error('❌ WebSocket ошибка:', error);
        };
    }
    
    handleServerMessage(data) {
        console.log('📨 Получено:', data.type, data);
        
        switch (data.type) {
            case 'CONNECTION_ESTABLISHED':
                this.playerId = data.playerId;
                if (data.stats) {
                    this.stats = { ...this.stats, ...data.stats };
                    if (data.stats.playerName) {
                        this.playerName = data.stats.playerName;
                        document.getElementById('playerNameInput').value = this.playerName;
                    }
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
                
            case 'UPDATE_STATS':
                if (data.stats) {
                    this.stats = { ...this.stats, ...data.stats };
                    this.updateStatsDisplay();
                }
                break;
                
            case 'ERROR':
                this.showNotification(`Ошибка: ${data.message}`, 'error');
                break;
                
            case 'PLAYER_LEFT':
                this.showNotification('Противник покинул комнату', 'error');
                this.returnToMenu();
                break;
                
            case 'PLAYER_READY_ACK':
                this.showNotification(data.message, 'info');
                break;
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
    
    createRoom() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.showNotification('Нет соединения с сервером', 'error');
            this.connectToServer();
            return;
        }
        
        this.playerName = document.getElementById('playerNameInput').value || 'Игрок';
        
        this.ws.send(JSON.stringify({
            type: 'CREATE_ROOM',
            playerName: this.playerName
        }));
        
        this.showNotification('Создание комнаты...', 'info');
    }
    
    joinRoom() {
        const roomId = document.getElementById('roomIdInput').value.trim();
        if (!roomId) {
            this.showNotification('Введите ID комнаты', 'error');
            return;
        }
        
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.showNotification('Нет соединения с сервером', 'error');
            this.connectToServer();
            return;
        }
        
        this.playerName = document.getElementById('playerNameInput').value || 'Игрок';
        
        this.ws.send(JSON.stringify({
            type: 'JOIN_ROOM',
            roomId: roomId,
            playerName: this.playerName
        }));
        
        this.showNotification(`Присоединение к комнате ${roomId}...`, 'info');
    }
    
    returnToMenu() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN && this.roomId) {
            this.ws.send(JSON.stringify({ type: 'LEAVE_ROOM' }));
        }
        
        this.resetGameState();
        this.showScreen('menuScreen');
        this.showNotification('Возврат в меню', 'info');
    }
    
    resetGameState() {
        this.roomId = null;
        this.playerNumber = null;
        this.gameState = 'menu';
        this.isYourTurn = false;
        this.yourBoard = this.createEmptyBoard();
        this.enemyBoard = this.createEmptyBoard();
        this.placedShips = [];
        this.shotsMade.clear();
        this.shipsToPlace.forEach(s => s.placed = false);
        this.selectedShip = null;
        this.availableShips = this.getAvailableShips();
    }
    
    handleGameStart(data) {
        console.log('🎮 Начинаем игру!', data);
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
        
        document.getElementById('startGameBtn').disabled = true;
    }
    
    initPlacementScreen() {
        if (this.gameState !== 'placing') return;
        
        const board = document.getElementById('placementBoard');
        if (!board) return;
        
        board.innerHTML = '';
        
        for (let y = 0; y < 10; y++) {
            for (let x = 0; x < 10; x++) {
                const cell = document.createElement('div');
                cell.className = 'placement-cell';
                cell.dataset.x = x;
                cell.dataset.y = y;
                
                cell.addEventListener('click', () => this.placeShip(x, y));
                cell.addEventListener('mouseenter', () => this.previewShip(x, y));
                cell.addEventListener('mouseleave', () => this.clearPreview());
                
                board.appendChild(cell);
            }
        }
        
        this.renderShipsList();
        this.renderPlacementBoard();
        
        if (!this.selectedShip) {
            this.selectedShip = this.shipsToPlace.find(ship => !ship.placed) || this.shipsToPlace[0];
        }
        
        document.getElementById('rotateShipBtn').textContent = 
            `Повернуть: ${this.shipOrientation === 'horizontal' ? 'Горизонтально' : 'Вертикально'}`;
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
            
            // Проверяем соседние клетки (корабли не должны касаться)
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
        
        cells.forEach(cell => {
            this.yourBoard[cell.y][cell.x] = ship.type;
        });
        
        ship.placed = true;
        this.placedShips.push({
            type: ship.type,
            size: ship.size,
            coordinates: cells
        });
        
        this.availableShips[ship.type].placed++;
        
        this.renderPlacementBoard();
        this.renderShipsList();
        this.clearPreview();
        
        const allPlaced = this.shipsToPlace.every(s => s.placed);
        if (allPlaced) {
            document.getElementById('startGameBtn').disabled = false;
            this.showNotification('Все корабли размещены! Нажмите "Начать игру"', 'success');
        }
        
        this.selectedShip = this.shipsToPlace.find(s => !s.placed);
        if (this.selectedShip) {
            this.renderShipsList();
        }
    }
    
    randomPlacement() {
        this.yourBoard = this.createEmptyBoard();
        this.placedShips = [];
        this.shipsToPlace.forEach(s => s.placed = false);
        this.availableShips = this.getAvailableShips();
        
        const ships = [...this.shipsToPlace];
        
        ships.forEach(ship => {
            let placed = false;
            let attempts = 0;
            
            while (!placed && attempts < 100) {
                attempts++;
                const x = Math.floor(Math.random() * 10);
                const y = Math.floor(Math.random() * 10);
                const orientation = Math.random() > 0.5 ? 'horizontal' : 'vertical';
                
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
                
                if (canPlace) {
                    cells.forEach(cell => {
                        this.yourBoard[cell.y][cell.x] = ship.type;
                    });
                    
                    ship.placed = true;
                    this.placedShips.push({
                        type: ship.type,
                        size: ship.size,
                        coordinates: cells
                    });
                    
                    this.availableShips[ship.type].placed++;
                    placed = true;
                }
            }
        });
        
        this.renderPlacementBoard();
        this.renderShipsList();
        document.getElementById('startGameBtn').disabled = false;
        this.showNotification('Корабли расставлены случайным образом', 'success');
    }
    
    rotateShip() {
        this.shipOrientation = this.shipOrientation === 'horizontal' ? 'vertical' : 'horizontal';
        document.getElementById('rotateShipBtn').textContent = 
            `Повернуть: ${this.shipOrientation === 'horizontal' ? 'Горизонтально' : 'Вертикально'}`;
    }
    
    startGame() {
        if (this.placedShips.length !== 10) {
            this.showNotification('Разместите все 10 кораблей!', 'error');
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
        const yourBoard = document.getElementById('yourBoard');
        const enemyBoard = document.getElementById('enemyBoard');
        
        if (!yourBoard || !enemyBoard) return;
        
        yourBoard.innerHTML = '';
        enemyBoard.innerHTML = '';
        
        for (let y = 0; y < 10; y++) {
            for (let x = 0; x < 10; x++) {
                const cell = document.createElement('div');
                cell.className = 'game-cell';
                if (this.yourBoard[y][x] !== 0) {
                    cell.classList.add('ship');
                }
                yourBoard.appendChild(cell);
            }
        }
        
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
        
        const superBtn = document.getElementById('useSuperWeaponBtn');
        if (superBtn) {
            superBtn.disabled = !this.stats.superWeapon || !this.isYourTurn;
        }
    }
    
    fireShot(x, y) {
        if (!this.isYourTurn || this.gameState !== 'playing') {
            return;
        }
        
        const shotKey = `${x},${y}`;
        if (this.shotsMade.has(shotKey)) {
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
        
        this.shotsMade.add(shotKey);
        this.isYourTurn = false;
        this.updateTurnDisplay();
        this.showNotification('Выстрел сделан...', 'info');
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
        
        if (confirm('💣 Использовать ЯДЕРНУЮ БОМБУ?\nУничтожит весь флот противника за один ход!')) {
            this.ws.send(JSON.stringify({
                type: 'USE_SUPER_WEAPON'
            }));
            
            this.showNotification('Ядерная бомба запущена!', 'success');
            this.isYourTurn = false;
            this.updateTurnDisplay();
        }
    }
    
    handleShotResult(data) {
        const cell = document.querySelector(`#enemyBoard .game-cell[data-x="${data.x}"][data-y="${data.y}"]`);
        
        if (data.hit) {
            this.enemyBoard[data.y][data.x] = 2;
            if (cell) {
                cell.classList.add('hit');
                this.createExplosionEffect(cell);
            }
            
            if (data.sunk) {
                this.showNotification(`💥 Потоплен ${this.getShipName(data.shipType)}!`, 'success');
                this.createSunkEffect();
            } else {
                this.showNotification('🎯 Попадание!', 'success');
            }
        } else {
            this.enemyBoard[data.y][data.x] = 3;
            if (cell) {
                cell.classList.add('miss');
                this.createSplashEffect(cell);
            }
            this.showNotification('💦 Промах!', 'info');
        }
        
        this.isYourTurn = data.yourTurn;
        this.updateTurnDisplay();
    }
    
    createExplosionEffect(element) {
        const explosion = document.createElement('div');
        explosion.className = 'explosion';
        explosion.style.cssText = `
            position: absolute;
            width: 30px;
            height: 30px;
            background: radial-gradient(circle, #ff0000, #ff5500, #ffaa00);
            border-radius: 50%;
            pointer-events: none;
            animation: explode 0.5s ease-out;
        `;
        
        const rect = element.getBoundingClientRect();
        explosion.style.left = (rect.left + rect.width/2 - 15) + 'px';
        explosion.style.top = (rect.top + rect.height/2 - 15) + 'px';
        
        document.body.appendChild(explosion);
        
        setTimeout(() => {
            explosion.remove();
        }, 500);
    }
    
    createSplashEffect(element) {
        const splash = document.createElement('div');
        splash.className = 'splash';
        splash.style.cssText = `
            position: absolute;
            width: 40px;
            height: 40px;
            border: 2px solid #4a69bd;
            border-radius: 50%;
            pointer-events: none;
            animation: splash 0.8s ease-out;
        `;
        
        const rect = element.getBoundingClientRect();
        splash.style.left = (rect.left + rect.width/2 - 20) + 'px';
        splash.style.top = (rect.top + rect.height/2 - 20) + 'px';
        
        document.body.appendChild(splash);
        
        setTimeout(() => {
            splash.remove();
        }, 800);
    }
    
    createSunkEffect() {
        const sunk = document.createElement('div');
        sunk.className = 'sunk-effect';
        sunk.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: 48px;
            color: #ff0000;
            text-shadow: 0 0 20px #ff0000;
            pointer-events: none;
            animation: sunkText 1.5s ease-out;
            z-index: 1000;
        `;
        sunk.textContent = '💥 ПОТОПЛЕН! 💥';
        
        document.body.appendChild(sunk);
        
        setTimeout(() => {
            sunk.remove();
        }, 1500);
    }
    
    handleGameOver(data) {
        this.gameState = 'gameover';
        
        if (data.stats) {
            this.stats = { ...this.stats, ...data.stats };
        }
        
        const isWinner = data.winnerId === this.playerId;
        
        document.getElementById('winnerDisplay').textContent = isWinner ? '🎉 ПОБЕДА!' : '💔 ПОРАЖЕНИЕ';
        document.getElementById('winnerDisplay').className = isWinner ? 'winner' : 'loser';
        
        document.getElementById('finalWins').textContent = this.stats.wins;
        document.getElementById('finalLosses').textContent = this.stats.losses;
        document.getElementById('gameResult').textContent = isWinner ? 'Вы победили!' : 'Вы проиграли';
        document.getElementById('gameReason').textContent = data.reason === 'nuclear' ? 'Ядерная победа!' : 'Все корабли потоплены!';
        
        this.showScreen('gameOverScreen');
        
        if (isWinner) {
            this.showNotification('🏆 Победа!', 'success');
            this.createVictoryEffect();
        } else {
            this.showNotification('💔 Поражение', 'error');
        }
    }
    
    createVictoryEffect() {
        const victory = document.createElement('div');
        victory.className = 'victory-effect';
        victory.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: radial-gradient(circle, rgba(120,224,143,0.3), transparent);
            pointer-events: none;
            animation: victoryPulse 2s ease-out;
            z-index: 999;
        `;
        
        document.body.appendChild(victory);
        
        setTimeout(() => {
            victory.remove();
        }, 2000);
    }
    
    playAgain() {
        this.resetGameState();
        this.showScreen('menuScreen');
    }
    
    renderPlacementBoard() {
        const cells = document.querySelectorAll('#placementBoard .placement-cell');
        cells.forEach(cell => {
            const x = parseInt(cell.dataset.x);
            const y = parseInt(cell.dataset.y);
            
            cell.className = 'placement-cell';
            if (this.yourBoard[y][x] !== 0) {
                cell.classList.add('ship');
            }
        });
    }
    
    renderShipsList() {
        const list = document.getElementById('shipsList');
        if (!list) return;
        
        list.innerHTML = '<h3>Корабли для размещения:</h3>';
        
        Object.entries(this.availableShips).forEach(([type, info]) => {
            const remaining = info.count - info.placed;
            if (remaining <= 0) return;
            
            const item = document.createElement('div');
            item.className = `ship-item ${remaining > 0 ? 'available' : 'placed'}`;
            if (this.selectedShip && this.selectedShip.type === type) {
                item.classList.add('selected');
            }
            
            item.innerHTML = `
                <span>${this.getShipName(type)} (${info.size}-палубный)</span>
                <span>Осталось: ${remaining}/${info.count}</span>
            `;
            
            item.addEventListener('click', () => {
                const availableShip = this.shipsToPlace.find(s => s.type === type && !s.placed);
                if (availableShip) {
                    this.selectedShip = availableShip;
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
                
                // Проверяем соседние клетки
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const nx = cellX + dx;
                        const ny = cellY + dy;
                        
                        if (nx >= 0 && nx < 10 && ny >= 0 && ny < 10) {
                            if (this.yourBoard[ny][nx] !== 0) {
                                const neighborCell = document.querySelector(
                                    `#placementBoard .placement-cell[data-x="${nx}"][data-y="${ny}"]`
                                );
                                if (neighborCell && !neighborCell.classList.contains('preview')) {
                                    neighborCell.classList.add('invalid');
                                    canPlace = false;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    clearPreview() {
        const cells = document.querySelectorAll('#placementBoard .placement-cell');
        cells.forEach(cell => {
            cell.classList.remove('preview', 'invalid');
        });
    }
    
    getShipName(type) {
        const names = {
            'battleship': 'Линкор',
            'cruiser': 'Крейсер', 
            'destroyer': 'Эсминец',
            'submarine': 'Подлодка'
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
            element.textContent = '🎮 ВАШ ХОД';
            element.className = 'turn-display your-turn';
        } else {
            element.textContent = '⏳ ХОД ПРОТИВНИКА';
            element.className = 'turn-display opponent-turn';
        }
        
        const superBtn = document.getElementById('useSuperWeaponBtn');
        if (superBtn) {
            superBtn.disabled = !this.stats.superWeapon || !this.isYourTurn;
        }
    }
    
    updateStatsDisplay() {
        const element = document.getElementById('yourStats');
        if (element) {
            element.innerHTML = `
                <strong>Статистика:</strong><br>
                Имя: ${this.playerName}<br>
                Побед: ${this.stats.wins}<br>
                Поражений: ${this.stats.losses}<br>
                Супер-оружие: ${this.stats.superWeapon ? '✅ Доступно' : '❌ Недоступно'}
            `;
        }
        
        const winsEl = document.getElementById('winsCount');
        if (winsEl) winsEl.textContent = this.stats.wins;
        
        const weaponEl = document.getElementById('superWeaponStatus');
        if (weaponEl) weaponEl.textContent = this.stats.superWeapon ? '✅' : '❌';
    }
}

// Добавляем CSS анимации
const style = document.createElement('style');
style.textContent = `
    @keyframes explode {
        0% { transform: scale(0); opacity: 1; }
        100% { transform: scale(3); opacity: 0; }
    }
    
    @keyframes splash {
        0% { transform: scale(0); opacity: 1; border-width: 2px; }
        100% { transform: scale(2); opacity: 0; border-width: 0; }
    }
    
    @keyframes sunkText {
        0% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
        50% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
        100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
    }
    
    @keyframes victoryPulse {
        0% { opacity: 0; }
        50% { opacity: 0.5; }
        100% { opacity: 0; }
    }
    
    .ship {
        background: #4a69bd !important;
        animation: shipFloat 2s infinite ease-in-out;
    }
    
    @keyframes shipFloat {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-2px); }
    }
    
    .hit {
        background: #e55039 !important;
        animation: hitPulse 0.5s;
    }
    
    @keyframes hitPulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.1); }
        100% { transform: scale(1); }
    }
    
    .miss {
        background: #82ccdd !important;
        animation: missDrop 0.5s;
    }
    
    @keyframes missDrop {
        0% { transform: scale(0); }
        100% { transform: scale(1); }
    }
    
    .your-turn {
        animation: turnPulse 1s infinite;
    }
    
    @keyframes turnPulse {
        0%, 100% { box-shadow: 0 0 10px rgba(120, 224, 143, 0.5); }
        50% { box-shadow: 0 0 20px rgba(120, 224, 143, 0.8); }
    }
`;
document.head.appendChild(style);

window.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Инициализация игры...');
    window.game = new Game();
});
