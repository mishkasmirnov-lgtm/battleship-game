// game.js - Полный код клиентской части "Морской бой"
class BattleshipGame {
    constructor() {
        this.ws = null;
        this.playerId = null;
        this.roomId = null;
        this.playerNumber = null;
        this.opponentNumber = null;
        this.gameState = 'menu'; // menu, waiting, placing, playing, result
        this.currentTurn = null;
        this.selectedShip = null;
        this.shipOrientation = 'horizontal';
        this.shipsToPlace = [];
        this.placedShips = [];
        this.yourBoard = this.createEmptyBoard();
        this.enemyBoard = this.createEmptyBoard();
        this.shotsBoard = this.createEmptyBoard();
        this.specialWeapons = { bomb: 2, radar: 1 };
        this.currentWeapon = 'normal';
        this.isYourTurn = false;
        this.chatMessages = [];
        this.gameStats = {
            shots: 0,
            hits: 0,
            misses: 0,
            shipsSunk: 0,
            accuracy: 0,
            startTime: null
        };

        this.init();
    }

    init() {
        this.bindEvents();
        this.showScreen('splashScreen');
        this.preloadSounds();
        console.log('Игра инициализирована');
    }

    bindEvents() {
        // Навигация
        window.showCreateRoom = () => this.showCreateRoom();
        window.showJoinRoom = () => this.showJoinRoom();
        window.showSplash = () => this.showSplash();
        window.createRoom = () => this.createRoom();
        window.joinRoom = () => this.joinRoom();
        window.copyRoomId = () => this.copyRoomId();
        window.copyInviteLink = () => this.copyInviteLink();
        window.leaveRoom = () => this.leaveRoom();
        window.rotateShip = () => this.rotateShip();
        window.randomPlacement = () => this.randomPlacement();
        window.clearBoard = () => this.clearBoard();
        window.confirmPlacement = () => this.confirmPlacement();
        window.useWeapon = (weapon) => this.selectWeapon(weapon);
        window.shotByCoordinates = () => this.shotByCoordinates();
        window.surrender = () => this.surrender();
        window.proposeRematch = () => this.proposeRematch();
        window.showGameMenu = () => this.showGameMenu();
        window.requestRematch = () => this.requestRematch();
        window.newGame = () => this.newGame();
        window.returnToMain = () => this.returnToMain();
        window.sendPlacementChat = () => this.sendChat('placement');
        window.sendGameChat = () => this.sendChat('game');
        window.handleChatKeypress = (e) => {
            if (e.key === 'Enter') this.sendChat('game');
        };

        // Drag & drop для кораблей
        this.setupDragAndDrop();
    }

    // ==================== СЕТЕВОЕ ВЗАИМОДЕЙСТВИЕ ====================
    connectToServer() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('Подключено к серверу');
            this.updateStatus('Соединение установлено', 'success');
        };
        
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleServerMessage(data);
            } catch (error) {
                console.error('Ошибка обработки сообщения:', error);
            }
        };
        
        this.ws.onclose = () => {
            console.log('Соединение закрыто');
            this.updateStatus('Соединение потеряно', 'error');
            this.showScreen('splashScreen');
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket ошибка:', error);
            this.updateStatus('Ошибка подключения', 'error');
        };
    }

    handleServerMessage(data) {
        console.log('Получено от сервера:', data);
        
        switch(data.type) {
            case 'ROOM_CREATED':
                this.handleRoomCreated(data);
                break;
            case 'ROOM_JOINED':
                this.handleRoomJoined(data);
                break;
            case 'GAME_START':
                this.handleGameStart(data);
                break;
            case 'PLAYER_TURN':
                this.handlePlayerTurn(data);
                break;
            case 'SHIPS_PLACED':
                this.handleShipsPlaced(data);
                break;
            case 'SHOT_RESULT':
                this.handleShotResult(data);
                break;
            case 'SPECIAL_WEAPON':
                this.handleSpecialWeapon(data);
                break;
            case 'GAME_OVER':
                this.handleGameOver(data);
                break;
            case 'CHAT_MESSAGE':
                this.handleChatMessage(data);
                break;
            case 'PLAYER_DISCONNECTED':
                this.handlePlayerDisconnected(data);
                break;
            case 'ERROR':
                this.showError(data.message);
                break;
            case 'REMATCH_REQUEST':
                this.handleRematchRequest(data);
                break;
            case 'REMATCH_ACCEPTED':
                this.handleRematchAccepted(data);
                break;
        }
    }

    handleRoomCreated(data) {
        this.playerId = data.playerId;
        this.roomId = data.roomId;
        this.playerNumber = data.playerNumber;
        
        this.updateGameLink();
        this.showScreen('waitingScreen');
        this.updateStatus('Комната создана. Ожидание соперника...', 'info');
        
        if (data.opponentConnected) {
            this.handleOpponentConnected();
        }
    }

    handleRoomJoined(data) {
        this.roomId = data.roomId;
        this.playerNumber = data.playerNumber;
        
        this.showScreen('waitingScreen');
        this.updateStatus('Подключено к комнате', 'success');
        
        if (data.opponentConnected) {
            this.handleOpponentConnected();
        }
    }

    handleOpponentConnected() {
        this.updateStatus('Соперник найден! Начинаем игру...', 'success');
        setTimeout(() => {
            this.showScreen('placementScreen');
            this.initPlacementScreen();
        }, 2000);
    }

    handleGameStart(data) {
        this.isYourTurn = data.yourTurn;
        this.currentTurn = this.isYourTurn ? this.playerNumber : this.opponentNumber;
        
        if (!data.rematch) {
            this.initPlacementScreen();
        } else {
            this.resetForRematch();
        }
        
        this.updateGamePhase();
    }

    handlePlayerTurn(data) {
        this.isYourTurn = data.yourTurn;
        this.currentTurn = this.isYourTurn ? this.playerNumber : this.opponentNumber;
        this.updateGamePhase();
        
        if (this.isYourTurn) {
            this.playSound('turn');
            this.showNotification('Ваш ход!', 'info');
        }
    }

    // ==================== ЭКРАНЫ И НАВИГАЦИЯ ====================
    showScreen(screenId) {
        // Скрываем все экраны
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.add('hidden');
        });
        
        // Показываем нужный экран
        const screen = document.getElementById(screenId);
        if (screen) {
            screen.classList.remove('hidden');
            this.gameState = screenId.replace('Screen', '');
        }
        
        // Особые действия для экранов
        switch(screenId) {
            case 'placementScreen':
                this.initPlacementScreen();
                break;
            case 'gameScreen':
                this.initGameScreen();
                break;
            case 'resultScreen':
                this.initResultScreen();
                break;
        }
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
        const tab = document.querySelector(`.tab[onclick*="${tabName}"]`);
        const content = document.getElementById(`${tabName}Tab`);
        
        if (tab) tab.classList.add('active');
        if (content) content.classList.add('active');
    }

    // ==================== ИГРОВАЯ ЛОГИКА ====================
    createEmptyBoard() {
        return Array(10).fill().map(() => Array(10).fill(0));
    }

    initPlacementScreen() {
        if (this.gameState === 'placing') return;
        
        this.gameState = 'placing';
        this.shipsToPlace = this.generateShipsToPlace();
        this.placedShips = [];
        this.yourBoard = this.createEmptyBoard();
        this.shipOrientation = 'horizontal';
        
        this.renderPlacementBoard();
        this.renderShipsList();
        this.updatePlacementStats();
        
        // Установка таймера
        this.startPlacementTimer(120); // 2 минуты
        
        // Обновление информации о сопернике
        this.updateOpponentStatus('Расставляет корабли');
    }

    generateShipsToPlace() {
        const ships = [];
        const config = [
            { size: 4, count: 1 },
            { size: 3, count: 2 },
            { size: 2, count: 3 },
            { size: 1, count: 4 }
        ];
        
        config.forEach(shipType => {
            for (let i = 0; i < shipType.count; i++) {
                ships.push({
                    id: `ship-${shipType.size}-${i}`,
                    size: shipType.size,
                    placed: false,
                    cells: []
                });
            }
        });
        
        return ships;
    }

    renderPlacementBoard() {
        const board = document.getElementById('placementBoard');
        if (!board) return;
        
        board.innerHTML = '';
        
        // Создаем координаты
        this.renderBoardCoordinates(board);
        
        // Создаем клетки
        for (let y = 0; y < 10; y++) {
            for (let x = 0; x < 10; x++) {
                const cell = document.createElement('div');
                cell.className = 'cell placement-cell';
                cell.dataset.x = x;
                cell.dataset.y = y;
                
                // Проверяем, занята ли клетка кораблем
                if (this.yourBoard[y][x] === 1) {
                    cell.classList.add('ship');
                }
                
                // События для drag & drop
                cell.addEventListener('dragover', (e) => this.handleDragOver(e));
                cell.addEventListener('drop', (e) => this.handleDrop(e));
                cell.addEventListener('dragenter', (e) => this.handleDragEnter(e));
                cell.addEventListener('dragleave', (e) => this.handleDragLeave(e));
                
                board.appendChild(cell);
            }
        }
    }

    setupDragAndDrop() {
        // Для кораблей в списке
        document.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('ship-item')) {
                const shipId = e.target.dataset.shipId;
                this.selectedShip = this.shipsToPlace.find(s => s.id === shipId);
                
                if (this.selectedShip && !this.selectedShip.placed) {
                    e.dataTransfer.setData('text/plain', shipId);
                    e.target.classList.add('dragging');
                } else {
                    e.preventDefault();
                }
            }
        });
        
        document.addEventListener('dragend', (e) => {
            if (e.target.classList.contains('ship-item')) {
                e.target.classList.remove('dragging');
                this.selectedShip = null;
            }
        });
    }

    handleDragOver(e) {
        e.preventDefault();
    }

    handleDragEnter(e) {
        if (this.selectedShip && !this.selectedShip.placed) {
            e.target.classList.add('drag-over');
        }
    }

    handleDragLeave(e) {
        e.target.classList.remove('drag-over');
    }

    handleDrop(e) {
        e.preventDefault();
        e.target.classList.remove('drag-over');
        
        if (!this.selectedShip || this.selectedShip.placed) return;
        
        const x = parseInt(e.target.dataset.x);
        const y = parseInt(e.target.dataset.y);
        
        if (this.canPlaceShip(x, y, this.selectedShip.size, this.shipOrientation)) {
            this.placeShip(x, y, this.selectedShip.size, this.shipOrientation);
            this.renderPlacementBoard();
            this.updatePlacementStats();
            this.playSound('place');
        } else {
            this.showNotification('Невозможно разместить корабль здесь', 'error');
        }
    }

    canPlaceShip(startX, startY, size, orientation) {
        const cells = [];
        
        for (let i = 0; i < size; i++) {
            let x = startX + (orientation === 'horizontal' ? i : 0);
            let y = startY + (orientation === 'vertical' ? i : 0);
            
            // Проверка границ
            if (x >= 10 || y >= 10) return false;
            
            // Проверка на пересечение с другими кораблями
            if (this.yourBoard[y][x] === 1) return false;
            
            // Проверка соседних клеток (правило "не касаться")
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    
                    if (nx >= 0 && nx < 10 && ny >= 0 && ny < 10) {
                        if (this.yourBoard[ny][nx] === 1) return false;
                    }
                }
            }
            
            cells.push({ x, y });
        }
        
        return true;
    }

    placeShip(startX, startY, size, orientation) {
        const shipCells = [];
        
        for (let i = 0; i < size; i++) {
            let x = startX + (orientation === 'horizontal' ? i : 0);
            let y = startY + (orientation === 'vertical' ? i : 0);
            
            this.yourBoard[y][x] = 1;
            shipCells.push({ x, y, hit: false });
        }
        
        this.placedShips.push({
            id: this.selectedShip.id,
            size: size,
            cells: shipCells,
            sunk: false
        });
        
        this.selectedShip.placed = true;
        this.selectedShip.cells = shipCells;
        
        // Обновляем список кораблей
        this.renderShipsList();
        
        // Проверяем, все ли корабли расставлены
        this.checkAllShipsPlaced();
    }

    rotateShip() {
        this.shipOrientation = this.shipOrientation === 'horizontal' ? 'vertical' : 'horizontal';
        this.showNotification(`Ориентация: ${this.shipOrientation === 'horizontal' ? 'горизонтальная' : 'вертикальная'}`, 'info');
    }

    randomPlacement() {
        if (this.gameState !== 'placing') return;
        
        this.clearBoard();
        
        const ships = this.generateShipsToPlace();
        let attempts = 0;
        const maxAttempts = 1000;
        
        ships.forEach(ship => {
            let placed = false;
            
            while (!placed && attempts < maxAttempts) {
                attempts++;
                
                // Случайные координаты и ориентация
                const x = Math.floor(Math.random() * 10);
                const y = Math.floor(Math.random() * 10);
                const orientation = Math.random() > 0.5 ? 'horizontal' : 'vertical';
                
                this.selectedShip = ship;
                
                if (this.canPlaceShip(x, y, ship.size, orientation)) {
                    this.placeShip(x, y, ship.size, orientation);
                    placed = true;
                }
            }
            
            if (!placed) {
                console.warn(`Не удалось разместить корабль ${ship.id}`);
            }
        });
        
        this.renderPlacementBoard();
        this.updatePlacementStats();
        this.playSound('place');
        this.showNotification('Авторасстановка завершена', 'success');
    }

    clearBoard() {
        this.yourBoard = this.createEmptyBoard();
        this.placedShips = [];
        this.shipsToPlace.forEach(ship => {
            ship.placed = false;
            ship.cells = [];
        });
        
        this.renderPlacementBoard();
        this.renderShipsList();
        this.updatePlacementStats();
        this.updateReadyButton();
    }

    checkAllShipsPlaced() {
        const allPlaced = this.shipsToPlace.every(ship => ship.placed);
        
        if (allPlaced) {
            document.getElementById('readyButton').disabled = false;
            document.getElementById('readyText').textContent = 'Все корабли расставлены!';
            document.getElementById('readyIcon').innerHTML = '<i class="fas fa-check-circle"></i>';
            
            this.showNotification('Все корабли расставлены!', 'success');
        }
        
        return allPlaced;
    }

    confirmPlacement() {
        if (!this.checkAllShipsPlaced()) {
            this.showNotification('Расставьте все корабли!', 'error');
            return;
        }
        
        // Отправляем информацию о кораблях на сервер
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const shipsData = this.placedShips.map(ship => ({
                id: ship.id,
                size: ship.size,
                cells: ship.cells
            }));
            
            this.ws.send(JSON.stringify({
                type: 'SHIPS_PLACED',
                ships: shipsData
            }));
            
            this.showNotification('Расстановка подтверждена!', 'success');
            document.getElementById('readyButton').disabled = true;
        }
    }

    // ==================== ИГРОВОЙ ПРОЦЕСС ====================
    initGameScreen() {
        this.gameState = 'playing';
        this.gameStats.startTime = Date.now();
        
        this.renderGameBoards();
        this.updateGameStats();
        this.updateWeaponsDisplay();
        this.updateGamePhase();
        
        // Запуск игрового таймера
        this.startGameTimer(900); // 15 минут
    }

    renderGameBoards() {
        this.renderBoard('yourBoard', true);
        this.renderBoard('enemyBoard', false);
        this.renderMinimap();
    }

    renderBoard(boardId, isYourBoard) {
        const board = document.getElementById(boardId);
        if (!board) return;
        
        board.innerHTML = '';
        
        for (let y = 0; y < 10; y++) {
            for (let x = 0; x < 10; x++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.x = x;
                cell.dataset.y = y;
                
                if (isYourBoard) {
                    // Ваша доска: показываем корабли
                    if (this.yourBoard[y][x] === 1) {
                        cell.classList.add('ship');
                        
                        // Проверяем, подбита ли эта клетка
                        const shipCell = this.findShipCell(x, y);
                        if (shipCell && shipCell.hit) {
                            cell.classList.add('hit');
                        }
                    }
                    
                    // Показываем попадания по вам
                    if (this.shotsBoard[y][x] === 2) { // hit
                        cell.classList.add('hit');
                    } else if (this.shotsBoard[y][x] === 3) { // miss
                        cell.classList.add('miss');
                    }
                    
                } else {
                    // Доска противника: показываем только выстрелы
                    if (this.enemyBoard[y][x] === 2) { // hit
                        cell.classList.add('hit');
                        cell.innerHTML = '<i class="fas fa-fire"></i>';
                    } else if (this.enemyBoard[y][x] === 3) { // miss
                        cell.classList.add('miss');
                        cell.innerHTML = '<i class="fas fa-water"></i>';
                    } else if (this.enemyBoard[y][x] === 4) { // around sunk ship
                        cell.classList.add('checked');
                    } else {
                        // Только для вражеской доски добавляем обработчик клика
                        if (this.isYourTurn && this.gameState === 'playing') {
                            cell.addEventListener('click', () => this.makeShot(x, y));
                            cell.classList.add('enemy-cell');
                        }
                    }
                }
                
                board.appendChild(cell);
            }
        }
    }

    findShipCell(x, y) {
        for (const ship of this.placedShips) {
            for (const cell of ship.cells) {
                if (cell.x === x && cell.y === y) {
                    return cell;
                }
            }
        }
        return null;
    }

    makeShot(x, y) {
        if (!this.isYourTurn || this.gameState !== 'playing') {
            this.showNotification('Сейчас не ваш ход!', 'warning');
            return;
        }
        
        // Проверяем, не стреляли ли уже в эту клетку
        if (this.enemyBoard[y][x] !== 0) {
            this.showNotification('Вы уже стреляли сюда!', 'warning');
            return;
        }
        
        // Отправляем выстрел на сервер
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'SHOT',
                x: x,
                y: y,
                weapon: this.currentWeapon === 'normal' ? undefined : this.currentWeapon
            }));
            
            this.gameStats.shots++;
            this.updateGameStats();
            this.playSound('shot');
            
            // Временно помечаем выстрел (сервер подтвердит результат)
            this.enemyBoard[y][x] = 1; // pending
            
            if (this.currentWeapon === 'bomb') {
                // Для бомбы помечаем область 3x3
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        const tx = x + dx;
                        const ty = y + dy;
                        if (tx >= 0 && tx < 10 && ty >= 0 && ty < 10) {
                            this.enemyBoard[ty][tx] = 1; // pending
                        }
                    }
                }
                this.specialWeapons.bomb--;
            } else if (this.currentWeapon === 'radar') {
                this.specialWeapons.radar--;
            }
            
            this.currentWeapon = 'normal';
            this.updateWeaponsDisplay();
            this.renderGameBoards();
        }
    }

    selectWeapon(weapon) {
        if (!this.isYourTurn || this.gameState !== 'playing') {
            this.showNotification('Можно выбрать оружие только во время своего хода', 'warning');
            return;
        }
        
        if (weapon === 'bomb' && this.specialWeapons.bomb <= 0) {
            this.showNotification('Бомбы закончились!', 'error');
            return;
        }
        
        if (weapon === 'radar' && this.specialWeapons.radar <= 0) {
            this.showNotification('Радары закончились!', 'error');
            return;
        }
        
        this.currentWeapon = weapon;
        this.updateWeaponsDisplay();
        this.showNotification(`Выбрано: ${weapon === 'bomb' ? 'Бомба' : weapon === 'radar' ? 'Радар' : 'Обычный выстрел'}`, 'info');
    }

    handleShotResult(data) {
        const { x, y, hit, sunk, shipCells, nextTurn } = data;
        
        // Обновляем доску противника
        if (hit) {
            this.enemyBoard[y][x] = 2; // hit
            this.gameStats.hits++;
            this.playSound('hit');
            
            if (sunk) {
                this.gameStats.shipsSunk++;
                this.playSound('sunk');
                this.showNotification('Корабль потоплен!', 'success');
                
                // Помечаем клетки вокруг потопленного корабля
                if (shipCells) {
                    shipCells.forEach(cell => {
                        for (let dx = -1; dx <= 1; dx++) {
                            for (let dy = -1; dy <= 1; dy++) {
                                const tx = cell.x + dx;
                                const ty = cell.y + dy;
                                if (tx >= 0 && tx < 10 && ty >= 0 && ty < 10 && 
                                    this.enemyBoard[ty][tx] === 0) {
                                    this.enemyBoard[ty][tx] = 4; // around sunk
                                }
                            }
                        }
                    });
                }
            }
        } else {
            this.enemyBoard[y][x] = 3; // miss
            this.gameStats.misses++;
        }
        
        this.isYourTurn = nextTurn;
        this.updateGameStats();
        this.renderGameBoards();
        this.addEventToLog(data.playerNumber === this.playerNumber ? 
            `Вы: ${hit ? 'ПОПАДАНИЕ' : 'ПРОМАХ'} в ${this.coordToString(x, y)}` :
            `Соперник: ${hit ? 'ПОПАДАНИЕ' : 'ПРОМАХ'} в ${this.coordToString(x, y)}`
        );
    }

    handleSpecialWeapon(data) {
        const { weapon, hits, results } = data;
        
        if (weapon === 'bomb' && hits) {
            hits.forEach(hit => {
                if (hit.hit) {
                    this.enemyBoard[hit.y][hit.x] = 2;
                    this.gameStats.hits++;
                } else {
                    this.enemyBoard[hit.y][hit.x] = 3;
                    this.gameStats.misses++;
                }
            });
            this.playSound('bomb');
        } else if (weapon === 'radar' && results) {
            results.forEach(result => {
                if (result.hasShip) {
                    // Помечаем радарное обнаружение
                    this.enemyBoard[result.y][result.x] = 5;
                }
            });
            this.playSound('radar');
        }
        
        this.updateWeaponsDisplay();
        this.renderGameBoards();
        this.addEventToLog(`Использовано: ${weapon === 'bomb' ? 'Бомба' : 'Радар'}`);
    }

    // ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
    coordToString(x, y) {
        const letters = 'ABCDEFGHIJ';
        return `${letters[x]}${y + 1}`;
    }

    updateGameStats() {
        const totalShots = this.gameStats.shots;
        this.gameStats.accuracy = totalShots > 0 ? 
            Math.round((this.gameStats.hits / totalShots) * 100) : 0;
        
        // Обновляем отображение статистики
        if (document.getElementById('accuracyStat')) {
            document.getElementById('accuracyStat').textContent = `${this.gameStats.accuracy}%`;
        }
        
        if (document.getElementById('sunkShipsStat')) {
            document.getElementById('sunkShipsStat').textContent = 
                `${this.gameStats.shipsSunk}/10`;
        }
        
        // Обновляем счет игроков
        if (document.getElementById('player1Shots')) {
            if (this.playerNumber === 1) {
                document.getElementById('player1Shots').textContent = this.gameStats.shots;
                document.getElementById('player1Ships').textContent = 
                    10 - this.gameStats.shipsSunk;
            } else {
                document.getElementById('player2Shots').textContent = this.gameStats.shots;
                document.getElementById('player2Ships').textContent = 
                    10 - this.gameStats.shipsSunk;
            }
        }
    }

    updateWeaponsDisplay() {
        // Обновляем счетчики оружия
        if (document.getElementById('bombCount')) {
            document.getElementById('bombCount').textContent = this.specialWeapons.bomb;
        }
        
        if (document.getElementById('radarCount')) {
            document.getElementById('radarCount').textContent = this.specialWeapons.radar;
        }
        
        // Обновляем отображение текущего оружия
        const weaponDisplay = document.getElementById('currentWeaponDisplay');
        if (weaponDisplay) {
            let icon, text;
            
            switch(this.currentWeapon) {
                case 'bomb':
                    icon = '<i class="fas fa-bomb"></i>';
                    text = 'Бомба';
                    break;
                case 'radar':
                    icon = '<i class="fas fa-satellite-dish"></i>';
                    text = 'Радар';
                    break;
                default:
                    icon = '<i class="fas fa-crosshairs"></i>';
                    text = 'Обычный выстрел';
            }
            
            weaponDisplay.innerHTML = `${icon}<span>${text}</span>`;
        }
        
        // Подсвечиваем выбранное оружие
        document.querySelectorAll('.weapon-card').forEach(card => {
            card.classList.remove('active');
        });
        
        if (this.currentWeapon !== 'normal') {
            const weaponCard = document.getElementById(`${this.currentWeapon}Weapon`);
            if (weaponCard) {
                weaponCard.classList.add('active');
            }
        }
    }

    updateGamePhase() {
        const phaseElement = document.getElementById('gamePhase');
        if (!phaseElement) return;
        
        let text = '';
        
        if (this.gameState === 'placing') {
            text = 'РАССТАНОВКА КОРАБЛЕЙ';
        } else if (this.gameState === 'playing') {
            text = this.isYourTurn ? 'ВАШ ХОД' : 'ХОД СОПЕРНИКА';
        }
        
        phaseElement.innerHTML = `<i class="fas fa-${this.isYourTurn ? 'play' : 'pause'}"></i><span>${text}</span>`;
        
        // Обновляем индикатор хода
        const turnIndicator = document.getElementById('yourTurnIndicator');
        if (turnIndicator) {
            if (this.isYourTurn) {
                turnIndicator.classList.remove('hidden');
            } else {
                turnIndicator.classList.add('hidden');
            }
        }
    }

    // ==================== ТАЙМЕРЫ ====================
    startPlacementTimer(seconds) {
        let timeLeft = seconds;
        const timerElement = document.getElementById('placementTimer');
        
        this.placementTimer = setInterval(() => {
            if (timeLeft <= 0) {
                clearInterval(this.placementTimer);
                this.showNotification('Время на расстановку вышло!', 'error');
                this.confirmPlacement(); // Автоподтверждение
                return;
            }
            
            const minutes = Math.floor(timeLeft / 60);
            const secs = timeLeft % 60;
            
            if (timerElement) {
                timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            }
            
            timeLeft--;
            
            // Предупреждение за 30 секунд
            if (timeLeft === 30) {
                this.showNotification('Осталось 30 секунд!', 'warning');
            }
        }, 1000);
    }

    startGameTimer(seconds) {
        let timeLeft = seconds;
        const timerElement = document.getElementById('gameTimer');
        
        this.gameTimer = setInterval(() => {
            if (timeLeft <= 0) {
                clearInterval(this.gameTimer);
                this.handleTimeOut();
                return;
            }
            
            const minutes = Math.floor(timeLeft / 60);
            const secs = timeLeft % 60;
            
            if (timerElement) {
                timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            }
            
            timeLeft--;
        }, 1000);
    }

    handleTimeOut() {
        if (this.gameState === 'playing') {
            // Проигрывает игрок, чей ход был
            const loser = this.isYourTurn ? this.playerNumber : this.opponentNumber;
            const winner = loser === 1 ? 2 : 1;
            
            this.showNotification('Время вышло!', 'error');
            this.showGameResult(winner, 'timeout');
        }
    }

    // ==================== ЧАТ ====================
    sendChat(context) {
        let inputElement, messagesElement;
        
        if (context === 'placement') {
            inputElement = document.getElementById('placementChatInput');
            messagesElement = document.getElementById('placementChat');
        } else {
            inputElement = document.getElementById('gameChatInput');
            messagesElement = document.getElementById('gameChat');
        }
        
        if (!inputElement || !messagesElement) return;
        
        const message = inputElement.value.trim();
        if (!message) return;
        
        // Отправляем сообщение на сервер
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'CHAT',
                message: message,
                context: context
            }));
            
            // Локально добавляем свое сообщение
            this.addChatMessage(this.playerNumber, message, messagesElement);
            inputElement.value = '';
        }
    }

    addChatMessage(playerNumber, message, container) {
        const messageElement = document.createElement('div');
        messageElement.className = `chat-message ${playerNumber === this.playerNumber ? 'own' : 'opponent'}`;
        
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        messageElement.innerHTML = `
            <div class="message-header">
                <span class="message-sender">${playerNumber === this.playerNumber ? 'Вы' : 'Соперник'}</span>
                <span class="message-time">${time}</span>
            </div>
            <div class="message-content">${this.escapeHtml(message)}</div>
        `;
        
        container.appendChild(messageElement);
        container.scrollTop = container.scrollHeight;
        
        this.chatMessages.push({
            player: playerNumber,
            message: message,
            time: time,
            context: this.gameState
        });
    }

    handleChatMessage(data) {
        const { playerNumber, message, timestamp } = data;
        
        let messagesElement;
        if (this.gameState === 'placing') {
            messagesElement = document.getElementById('placementChat');
        } else {
            messagesElement = document.getElementById('gameChat');
        }
        
        if (messagesElement) {
            this.addChatMessage(playerNumber, message, messagesElement);
        }
    }

    // ==================== ЗВУКИ ====================
    preloadSounds() {
        // Звуки будут загружаться по требованию
        this.sounds = {};
    }

    playSound(soundName) {
        const soundMap = {
            'shot': document.getElementById('soundShot'),
            'hit': document.getElementById('soundHit'),
            'sunk': document.getElementById('soundSunk'),
            'place': document.getElementById('soundPlace'),
            'turn': document.getElementById('soundWin') // Используем win звук для хода
        };
        
        const sound = soundMap[soundName];
        if (sound) {
            sound.currentTime = 0;
            sound.play().catch(e => console.log('Не удалось воспроизвести звук:', e));
        }
    }

    // ==================== УВЕДОМЛЕНИЯ ====================
    showNotification(message, type = 'info') {
        console.log(`[${type.toUpperCase()}] ${message}`);
        
        // Создаем элемент уведомления
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;
        
        // Добавляем в контейнер уведомлений или прямо в body
        let container = document.getElementById('notifications');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notifications';
            container.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10000;
            `;
            document.body.appendChild(container);
        }
        
        container.appendChild(notification);
        
        // Автоудаление через 5 секунд
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
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
                    <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'times' : 'info'}"></i>
                    <span>${message}</span>
                </div>
            `;
        }
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    // ==================== РЕЗУЛЬТАТ ИГРЫ ====================
    handleGameOver(data) {
        const { winner, playerNumber, shots } = data;
        
        this.gameState = 'result';
        this.isYourTurn = false;
        
        // Останавливаем таймеры
        if (this.placementTimer) clearInterval(this.placementTimer);
        if (this.gameTimer) clearInterval(this.gameTimer);
        
        this.showGameResult(winner, playerNumber === winner ? 'win' : 'lose');
    }

    showGameResult(winner, reason) {
        this.showScreen('resultScreen');
        
        const resultContent = document.getElementById('resultContent');
        if (!resultContent) return;
        
        const isWin = winner === this.playerNumber;
        const title = isWin ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ';
        const icon = isWin ? 'trophy' : 'skull-crossbones';
        const colorClass = isWin ? 'win' : 'lose';
        const reasonText = this.getReasonText(reason);
        
        resultContent.innerHTML = `
            <div class="result-title ${colorClass}">
                <i class="fas fa-${icon}"></i>
                <h1>${title}</h1>
            </div>
            <div class="result-reason">
                <p>${reasonText}</p>
            </div>
            <div class="result-player">
                <p>Победитель: <strong>Игрок ${winner}</strong></p>
            </div>
        `;
        
        // Обновляем статистику
        this.updateResultStats();
        
        // Проигрываем звук
        this.playSound(isWin ? 'win' : 'sunk');
        
        // Запускаем анимацию конфетти для победы
        if (isWin) {
            this.createConfetti();
        }
    }

    getReasonText(reason) {
        const reasons = {
            'win': 'Вы уничтожили все корабли противника!',
            'lose': 'Все ваши корабли были потоплены.',
            'surrender': 'Противник сдался.',
            'timeout': 'Время игры истекло.',
            'disconnect': 'Противник отключился.'
        };
        
        return reasons[reason] || 'Игра завершена.';
    }

    updateResultStats() {
        const statsElement = document.getElementById('gameStats');
        if (!statsElement) return;
        
        const gameDuration = this.gameStats.startTime ? 
            Math.round((Date.now() - this.gameStats.startTime) / 1000) : 0;
        const minutes = Math.floor(gameDuration / 60);
        const seconds = gameDuration % 60;
        
        statsElement.innerHTML = `
            <div class="stat-item">
                <span class="stat-label">Точность:</span>
                <span class="stat-value">${this.gameStats.accuracy}%</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Выстрелов:</span>
                <span class="stat-value">${this.gameStats.shots}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Попаданий:</span>
                <span class="stat-value">${this.gameStats.hits}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Потоплено:</span>
                <span class="stat-value">${this.gameStats.shipsSunk}/10</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Время игры:</span>
                <span class="stat-value">${minutes}:${seconds.toString().padStart(2, '0')}</span>
            </div>
        `;
    }

    createConfetti() {
        const colors = ['#64ffda', '#ff6b6b', '#ffd166', '#4cc9f0', '#c77dff'];
        
        for (let i = 0; i < 150; i++) {
            const confetti = document.createElement('div');
            confetti.style.cssText = `
                position: fixed;
                width: 10px;
                height: 10px;
                background: ${colors[Math.floor(Math.random() * colors.length)]};
                border-radius: ${Math.random() > 0.5 ? '50%' : '0'};
                top: -20px;
                left: ${Math.random() * 100}vw;
                z-index: 10000;
                pointer-events: none;
            `;
            
            document.body.appendChild(confetti);
            
            // Анимация падения
            const animation = confetti.animate([
                { 
                    transform: `translateY(0) rotate(0deg)`, 
                    opacity: 1 
                },
                { 
                    transform: `translateY(${window.innerHeight}px) rotate(${Math.random() * 720}deg)`, 
                    opacity: 0 
                }
            ], {
                duration: 3000 + Math.random() * 2000,
                easing: 'cubic-bezier(0.215, 0.610, 0.355, 1)'
            });
            
            animation.onfinish = () => confetti.remove();
        }
    }

    // ==================== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ====================
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    addEventToLog(eventText) {
        const logElement = document.getElementById('eventsLog');
        if (!logElement) return;
        
        const eventElement = document.createElement('div');
        eventElement.className = 'event-item';
        
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        eventElement.innerHTML = `<span class="event-time">${time}</span><span class="event-text">${eventText}</span>`;
        
        logElement.appendChild(eventElement);
        logElement.scrollTop = logElement.scrollHeight;
        
        // Ограничиваем количество записей
        if (logElement.children.length > 50) {
            logElement.removeChild(logElement.firstChild);
        }
    }

    renderMinimap() {
        const minimap = document.getElementById('minimap');
        if (!minimap) return;
        
        minimap.innerHTML = '';
        const cellSize = 8;
        
        for (let y = 0; y < 10; y++) {
            for (let x = 0; x < 10; x++) {
                const cell = document.createElement('div');
                cell.style.cssText = `
                    width: ${cellSize}px;
                    height: ${cellSize}px;
                    position: absolute;
                    left: ${x * cellSize}px;
                    top: ${y * cellSize}px;
                    background: ${this.enemyBoard[y][x] === 2 ? '#ff6b6b' : 
                                this.enemyBoard[y][x] === 3 ? '#8892b0' : 
                                this.enemyBoard[y][x] === 4 ? '#49516f' : 
                                this.enemyBoard[y][x] === 5 ? '#64ffda' : 
                                'transparent'};
                    border: 1px solid rgba(255, 255, 255, 0.1);
                `;
                minimap.appendChild(cell);
            }
        }
    }

    renderBoardCoordinates(boardElement) {
        // Добавляем буквы (A-J) сверху
        const letters = document.createElement('div');
        letters.className = 'board-letters';
        
        for (let i = 0; i < 10; i++) {
            const letter = document.createElement('div');
            letter.className = 'coordinate';
            letter.textContent = String.fromCharCode(65 + i); // A-J
            letters.appendChild(letter);
        }
        
        // Добавляем цифры (1-10) слева
        const numbers = document.createElement('div');
        numbers.className = 'board-numbers';
        
        for (let i = 1; i <= 10; i++) {
            const number = document.createElement('div');
            number.className = 'coordinate';
            number.textContent = i;
            numbers.appendChild(number);
        }
        
        boardElement.appendChild(letters);
        boardElement.appendChild(numbers);
    }

    renderShipsList() {
        const shipsList = document.getElementById('shipsList');
        if (!shipsList) return;
        
        shipsList.innerHTML = '';
        
        this.shipsToPlace.forEach(ship => {
            const shipElement = document.createElement('div');
            shipElement.className = `ship-item ${ship.placed ? 'placed' : 'available'}`;
            shipElement.dataset.shipId = ship.id;
            shipElement.draggable = !ship.placed;
            
            // Создаем визуальное представление корабля
            const shipVisual = document.createElement('div');
            shipVisual.className = 'ship-visual';
            shipVisual.style.width = `${ship.size * 30}px`;
            
            for (let i = 0; i < ship.size; i++) {
                const segment = document.createElement('div');
                segment.className = 'ship-segment';
                shipVisual.appendChild(segment);
            }
            
            const shipInfo = document.createElement('div');
            shipInfo.className = 'ship-info';
            shipInfo.innerHTML = `
                <span class="ship-name">${ship.size}-палубный</span>
                <span class="ship-status">${ship.placed ? '✓ Размещен' : 'Перетащите'}</span>
            `;
            
            shipElement.appendChild(shipVisual);
            shipElement.appendChild(shipInfo);
            shipsList.appendChild(shipElement);
        });
    }

    updatePlacementStats() {
        const placedCount = this.shipsToPlace.filter(s => s.placed).length;
        const cellsCount = this.placedShips.reduce((sum, ship) => sum + ship.size, 0);
        
        if (document.getElementById('shipsPlacedCount')) {
            document.getElementById('shipsPlacedCount').textContent = placedCount;
        }
        
        if (document.getElementById('cellsPlacedCount')) {
            document.getElementById('cellsPlacedCount').textContent = cellsCount;
        }
        
        this.updateReadyButton();
    }

    updateReadyButton() {
        const readyButton = document.getElementById('readyButton');
        const readyText = document.getElementById('readyText');
        const readyIcon = document.getElementById('readyIcon');
        
        if (!readyButton || !readyText || !readyIcon) return;
        
        const allPlaced = this.checkAllShipsPlaced();
        readyButton.disabled = !allPlaced;
        
        if (allPlaced) {
            readyText.textContent = 'Все корабли расставлены!';
            readyIcon.innerHTML = '<i class="fas fa-check-circle"></i>';
        } else {
            const placedCount = this.shipsToPlace.filter(s => s.placed).length;
            const totalCount = this.shipsToPlace.length;
            readyText.textContent = `Корабли: ${placedCount}/${totalCount}`;
            readyIcon.innerHTML = '<i class="fas fa-hourglass-half"></i>';
        }
    }

    updateOpponentStatus(status) {
        const opponentStatus = document.getElementById('opponentStatus');
        if (opponentStatus) {
            opponentStatus.textContent = status;
        }
    }

    updateGameLink() {
        const roomIdDisplay = document.getElementById('displayRoomId') || 
                             document.getElementById('placementRoomId') ||
                             document.getElementById('gameRoomId');
        
        if (roomIdDisplay) {
            roomIdDisplay.textContent = this.roomId;
        }
        
        // Обновляем ссылку для приглашения
        const inviteLink = document.getElementById('inviteLink');
        if (inviteLink) {
            inviteLink.value = `${window.location.origin}?room=${this.roomId}`;
        }
    }

    // ==================== УПРАВЛЕНИЕ ИГРОЙ ====================
    createRoom() {
        const playerName = document.getElementById('playerName')?.value || 'Игрок 1';
        this.connectToServer();
        
        // Отправляем запрос на создание комнаты
        setTimeout(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: 'CREATE_ROOM',
                    playerName: playerName
                }));
            }
        }, 1000);
    }

    joinRoom() {
        const playerName = document.getElementById('joinPlayerName')?.value || 'Игрок 2';
        const roomId = document.getElementById('roomIdInput')?.value.toUpperCase();
        
        if (!roomId || roomId.length !== 6) {
            this.showError('Введите корректный ID комнаты (6 символов)');
            return;
        }
        
        this.roomId = roomId;
        this.connectToServer();
        
        // Отправляем запрос на присоединение
        setTimeout(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: 'JOIN_ROOM',
                    roomId: roomId,
                    playerName: playerName
                }));
            }
        }, 1000);
    }

    copyRoomId() {
        if (!this.roomId) return;
        
        navigator.clipboard.writeText(this.roomId).then(() => {
            this.showNotification('ID комнаты скопирован', 'success');
        });
    }

    copyInviteLink() {
        const link = document.getElementById('inviteLink')?.value;
        if (!link) return;
        
        navigator.clipboard.writeText(link).then(() => {
            this.showNotification('Ссылка скопирована', 'success');
        });
    }

    leaveRoom() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.close();
        }
        
        this.showScreen('splashScreen');
        this.showNotification('Вы вышли из комнаты', 'info');
    }

    shotByCoordinates() {
        const coordInput = document.getElementById('coordInput');
        if (!coordInput || !coordInput.value) return;
        
        const coord = coordInput.value.toUpperCase();
        const match = coord.match(/^([A-J])(10|[1-9])$/);
        
        if (!match) {
            this.showError('Введите координаты в формате A1-J10');
            return;
        }
        
        const letter = match[1];
        const number = parseInt(match[2]);
        
        const x = letter.charCodeAt(0) - 65; // A=0, B=1, ...
        const y = number - 1; // 1=0, 2=1, ...
        
        this.makeShot(x, y);
        coordInput.value = '';
    }

    surrender() {
        if (confirm('Вы действительно хотите сдаться?')) {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: 'SURRENDER'
                }));
            }
        }
    }

    proposeRematch() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'REMATCH_REQUEST'
            }));
            
            this.showNotification('Запрос на реванш отправлен', 'info');
        }
    }

    handleRematchRequest(data) {
        if (confirm(`Игрок ${data.playerNumber} предлагает реванш. Принять?`)) {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: 'REMATCH_ACCEPT'
                }));
            }
        }
    }

    handleRematchAccepted(data) {
        this.showNotification('Реванш принят! Начинаем новую игру', 'success');
        this.resetForRematch();
    }

    resetForRematch() {
        // Сбрасываем игровое состояние
        this.placedShips = [];
        this.yourBoard = this.createEmptyBoard();
        this.enemyBoard = this.createEmptyBoard();
        this.shotsBoard = this.createEmptyBoard();
        this.specialWeapons = { bomb: 2, radar: 1 };
        this.currentWeapon = 'normal';
        this.gameStats = {
            shots: 0,
            hits: 0,
            misses: 0,
            shipsSunk: 0,
            accuracy: 0,
            startTime: Date.now()
        };
        
        // Возвращаемся к расстановке
        this.showScreen('placementScreen');
        this.initPlacementScreen();
    }

    requestRematch() {
        this.proposeRematch();
    }

    newGame() {
        this.ws.close();
        this.showScreen('splashScreen');
    }

    returnToMain() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.close();
        }
        
        this.showScreen('splashScreen');
    }

    handlePlayerDisconnected(data) {
        this.showNotification(`Игрок ${data.playerNumber} отключился`, 'warning');
        
        if (this.gameState === 'playing') {
            // Автоматическая победа при отключении соперника
            const winner = data.playerNumber === 1 ? 2 : 1;
            this.showGameResult(winner, 'disconnect');
        }
    }

    showGameMenu() {
        // Простое модальное окно с опциями
        const menu = document.createElement('div');
        menu.className = 'game-menu';
        menu.innerHTML = `
            <div class="menu-content">
                <h3><i class="fas fa-cog"></i> Меню игры</h3>
                <button onclick="game.surrender()">
                    <i class="fas fa-flag"></i> Сдаться
                </button>
                <button onclick="game.proposeRematch()">
                    <i class="fas fa-redo"></i> Предложить реванш
                </button>
                <button onclick="game.returnToMain()">
                    <i class="fas fa-home"></i> В главное меню
                </button>
                <button onclick="game.closeMenu()">
                    <i class="fas fa-times"></i> Закрыть
                </button>
            </div>
        `;
        
        document.body.appendChild(menu);
        
        // Стили для меню
        menu.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;
        
        menu.querySelector('.menu-content').style.cssText = `
            background: #112240;
            padding: 30px;
            border-radius: 15px;
            min-width: 300px;
            border: 2px solid #64ffda;
        `;
        
        // Добавляем метод для закрытия
        this.closeMenu = () => {
            if (menu.parentNode) {
                menu.parentNode.removeChild(menu);
            }
        };
    }
}

// Инициализация игры при загрузке страницы
let game;
window.addEventListener('DOMContentLoaded', () => {
    game = new BattleshipGame();
    window.game = game; // Делаем глобально доступным для вызовов из HTML
});
