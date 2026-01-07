// game.js - ПОЛНЫЙ рабочий код с подключением и игровой логикой
class BattleshipGame {
    constructor() {
        this.ws = null;
        this.playerId = null;
        this.roomId = null;
        this.playerNumber = null;
        this.gameState = 'menu';
        this.isHost = false;
        this.isYourTurn = false;
        
        // Игровые данные
        this.selectedShip = null;
        this.shipOrientation = 'horizontal';
        this.shipsToPlace = [];
        this.placedShips = [];
        this.yourBoard = this.createEmptyBoard();
        this.enemyBoard = this.createEmptyBoard();
        this.specialWeapons = { bomb: 2, radar: 1 };
        this.currentWeapon = 'normal';
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.showScreen('splashScreen');
        console.log('Игра инициализирована');
        
        // Автоподключение если есть room в URL
        setTimeout(() => {
            this.checkAutoConnect();
        }, 500);
    }

    checkAutoConnect() {
        const urlParams = new URLSearchParams(window.location.search);
        const roomId = urlParams.get('room');
        
        if (roomId && roomId.length === 6) {
            document.getElementById('roomIdInput').value = roomId;
            this.showJoinRoom();
        }
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
        
        // Игровые кнопки (для placementScreen)
        window.rotateShip = () => this.rotateShip();
        window.randomPlacement = () => this.randomPlacement();
        window.clearBoard = () => this.clearBoard();
        window.confirmPlacement = () => this.confirmPlacement();
        window.sendPlacementChat = () => this.sendChat('placement');
        
        // Игровые кнопки (для gameScreen)
        window.useWeapon = (weapon) => this.selectWeapon(weapon);
        window.shotByCoordinates = () => this.shotByCoordinates();
        window.surrender = () => this.surrender();
        window.proposeRematch = () => this.proposeRematch();
        window.showGameMenu = () => this.showGameMenu();
        window.sendGameChat = () => this.sendChat('game');
        window.handleChatKeypress = (e) => {
            if (e.key === 'Enter') this.sendChat('game');
        };
        
        // Кнопки результата
        window.requestRematch = () => this.requestRematch();
        window.newGame = () => this.newGame();
        window.returnToMain = () => this.returnToMain();
    }

    // ==================== ПОДКЛЮЧЕНИЕ К СЕРВЕРУ ====================
    connectToServer(roomId = null, isHost = false) {
        this.isHost = isHost;
        
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = roomId ? 
            `${protocol}//${window.location.host}?room=${roomId}` : 
            `${protocol}//${window.location.host}`;
        
        console.log(`Подключение к: ${wsUrl}`);
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('✅ Подключено к серверу');
            this.updateStatus('Соединение установлено', 'success');
            
            // Отправляем информацию об игроке
            setTimeout(() => {
                this.sendPlayerInfo();
            }, 500);
        };
        
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('Получено от сервера:', data.type);
                this.handleServerMessage(data);
            } catch (error) {
                console.error('Ошибка обработки сообщения:', error);
            }
        };
        
        this.ws.onclose = () => {
            console.log('❌ Соединение закрыто');
            this.updateStatus('Соединение потеряно', 'error');
            this.showNotification('Соединение с сервером потеряно', 'error');
            this.showScreen('splashScreen');
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket ошибка:', error);
            this.updateStatus('Ошибка подключения', 'error');
        };
    }

    sendPlayerInfo() {
        const playerName = this.isHost ? 
            (document.getElementById('playerName')?.value || 'Игрок 1') :
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
            case 'PLAYER_TURN':
                this.handlePlayerTurn(data);
                break;
            case 'SHOT_RESULT':
                this.handleShotResult(data);
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
            default:
                console.log('Неизвестный тип:', data.type);
        }
    }

    // ==================== ОБРАБОТКА СООБЩЕНИЙ ====================
    handleRoomCreated(data) {
        this.playerId = data.playerId;
        this.roomId = data.roomId;
        this.playerNumber = data.playerNumber;
        
        console.log(`✅ Комната создана: ${this.roomId}, вы игрок ${this.playerNumber}`);
        
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
        this.updateStatus('Подключено к комнате. Ожидание начала игры...', 'info');
    }

    handlePlayerConnected(data) {
        console.log(`✅ Игрок ${data.playerNumber} подключился`);
        this.showNotification(`Игрок ${data.playerNumber} подключился к комнате`, 'success');
        this.updateStatus('Соперник найден! Начинаем игру...', 'success');
        
        // Отправляем готовность
        setTimeout(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: 'PLAYER_READY'
                }));
            }
        }, 1000);
    }

    handleGameStart(data) {
        this.isYourTurn = data.yourTurn;
        console.log(`🎮 Начинаем игру! Ваш ход: ${this.isYourTurn ? 'ДА' : 'НЕТ'}`);
        
        this.initPlacementScreen();
        this.showScreen('placementScreen');
        this.showNotification('Начинаем игру! Расставьте корабли', 'success');
    }

    handlePlayerTurn(data) {
        this.isYourTurn = data.yourTurn;
        console.log(`🔄 Ход: ${this.isYourTurn ? 'ВАШ' : 'соперника'}`);
        
        if (this.isYourTurn) {
            this.showNotification('Ваш ход!', 'info');
        }
        
        this.updateGamePhase();
    }

    handleShotResult(data) {
        console.log('Результат выстрела:', data);
        
        // Обновляем доску
        if (data.hit) {
            this.enemyBoard[data.y][data.x] = 2; // попадание
            this.showNotification(data.sunk ? 'Корабль потоплен!' : 'Попадание!', 'success');
        } else {
            this.enemyBoard[data.y][data.x] = 3; // промах
            this.showNotification('Промах!', 'info');
        }
        
        this.isYourTurn = data.nextTurn;
        this.updateGamePhase();
        this.renderGameBoards();
    }

    handleGameOver(data) {
        console.log('Игра окончена, победитель:', data.winner);
        this.showGameResult(data.winner === this.playerNumber ? 'win' : 'lose', data.winner);
    }

    handleChatMessage(data) {
        this.addChatMessage(data.playerNumber, data.message, data.timestamp);
    }

    handlePlayerDisconnected(data) {
        this.showNotification(`Игрок ${data.playerNumber} отключился`, 'warning');
        this.showScreen('splashScreen');
    }

    // ==================== ЭКРАН РАССТАНОВКИ ====================
    initPlacementScreen() {
        this.gameState = 'placing';
        this.shipsToPlace = this.generateShipsToPlace();
        this.placedShips = [];
        this.yourBoard = this.createEmptyBoard();
        
        this.renderPlacementBoard();
        this.renderShipsList();
        this.updatePlacementStats();
        
        // Настройка drag & drop
        this.setupDragAndDrop();
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
            this.showNotification('Корабль размещен', 'success');
        } else {
            this.showNotification('Невозможно разместить корабль здесь', 'error');
        }
    }

    canPlaceShip(startX, startY, size, orientation) {
        const cells = [];
        
        for (let i = 0; i < size; i++) {
            let x = startX + (orientation === 'horizontal' ? i : 0);
            let y = startY + (orientation === 'vertical' ? i : 0);
            
            if (x >= 10 || y >= 10) return false;
            if (this.yourBoard[y][x] === 1) return false;
            
            // Проверка соседних клеток
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
        
        this.renderShipsList();
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
                
                const x = Math.floor(Math.random() * 10);
                const y = Math.floor(Math.random() * 10);
                const orientation = Math.random() > 0.5 ? 'horizontal' : 'vertical';
                
                this.selectedShip = ship;
                
                if (this.canPlaceShip(x, y, ship.size, orientation)) {
                    this.placeShip(x, y, ship.size, orientation);
                    placed = true;
                }
            }
        });
        
        this.renderPlacementBoard();
        this.updatePlacementStats();
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
            const readyButton = document.getElementById('readyButton');
            const readyText = document.getElementById('readyText');
            const readyIcon = document.getElementById('readyIcon');
            
            if (readyButton) readyButton.disabled = false;
            if (readyText) readyText.textContent = 'Все корабли расставлены!';
            if (readyIcon) readyIcon.innerHTML = '<i class="fas fa-check-circle"></i>';
            
            this.showNotification('Все корабли расставлены!', 'success');
        }
        
        return allPlaced;
    }

    confirmPlacement() {
        if (!this.checkAllShipsPlaced()) {
            this.showNotification('Расставьте все корабли!', 'error');
            return;
        }
        
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
            
            const readyButton = document.getElementById('readyButton');
            if (readyButton) readyButton.disabled = true;
        }
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
        
        const shipsCountEl = document.getElementById('shipsPlacedCount');
        const cellsCountEl = document.getElementById('cellsPlacedCount');
        
        if (shipsCountEl) shipsCountEl.textContent = placedCount;
        if (cellsCountEl) cellsCountEl.textContent = cellsCount;
        
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

    // ==================== ИГРОВОЙ ПРОЦЕСС ====================
    initGameScreen() {
        this.gameState = 'playing';
        this.renderGameBoards();
        this.updateWeaponsDisplay();
        this.updateGamePhase();
    }

    renderGameBoards() {
        this.renderBoard('yourBoard', true);
        this.renderBoard('enemyBoard', false);
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
                    // Ваша доска
                    if (this.yourBoard[y][x] === 1) {
                        cell.classList.add('ship');
                        
                        // Проверяем подбитые клетки
                        const shipCell = this.findShipCell(x, y);
                        if (shipCell && shipCell.hit) {
                            cell.classList.add('hit');
                        }
                    }
                } else {
                    // Доска противника
                    if (this.enemyBoard[y][x] === 2) {
                        cell.classList.add('hit');
                        cell.innerHTML = '💥';
                    } else if (this.enemyBoard[y][x] === 3) {
                        cell.classList.add('miss');
                        cell.innerHTML = '💦';
                    } else if (this.enemyBoard[y][x] === 0) {
                        // Добавляем обработчик клика только для пустых клеток
                        if (this.isYourTurn && this.gameState === 'playing') {
                            cell.addEventListener('click', () => this.makeShot(x, y));
                            cell.classList.add('clickable');
                            cell.title = 'Выстрелить сюда';
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
        
        if (this.enemyBoard[y][x] !== 0) {
            this.showNotification('Вы уже стреляли сюда!', 'warning');
            return;
        }
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'SHOT',
                x: x,
                y: y,
                weapon: this.currentWeapon === 'normal' ? undefined : this.currentWeapon
            }));
            
            this.playSound('shot');
            
            // Временно помечаем
            this.enemyBoard[y][x] = 1;
            
            if (this.currentWeapon === 'bomb') {
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

    updateWeaponsDisplay() {
        const bombCount = document.getElementById('bombCount');
        const radarCount = document.getElementById('radarCount');
        const weaponDisplay = document.getElementById('currentWeaponDisplay');
        
        if (bombCount) bombCount.textContent = this.specialWeapons.bomb;
        if (radarCount) radarCount.textContent = this.specialWeapons.radar;
        
        if (weaponDisplay) {
            let icon, text;
            
            switch(this.currentWeapon) {
                case 'bomb':
                    icon = '💣';
                    text = 'Бомба';
                    break;
                case 'radar':
                    icon = '📡';
                    text = 'Радар';
                    break;
                default:
                    icon = '🎯';
                    text = 'Обычный выстрел';
            }
            
            weaponDisplay.innerHTML = `${icon} ${text}`;
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
        
        const x = letter.charCodeAt(0) - 65;
        const y = number - 1;
        
        this.makeShot(x, y);
        coordInput.value = '';
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
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'CHAT',
                message: message,
                context: context
            }));
            
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
    }

    // ==================== РЕЗУЛЬТАТ ИГРЫ ====================
    showGameResult(result, winner) {
        this.showScreen('resultScreen');
        
        const resultContent = document.getElementById('resultContent');
        if (!resultContent) return;
        
        const isWin = result === 'win';
        const title = isWin ? '🏆 ПОБЕДА!' : '💀 ПОРАЖЕНИЕ';
        const message = isWin ? 
            'Вы уничтожили все корабли противника!' : 
            'Все ваши корабли были потоплены.';
        
        resultContent.innerHTML = `
            <div class="result-title ${isWin ? 'win' : 'lose'}">
                <h1>${title}</h1>
            </div>
            <div class="result-reason">
                <p>${message}</p>
                <p>Победитель: <strong>Игрок ${winner}</strong></p>
            </div>
        `;
        
        if (isWin) {
            this.createConfetti();
        }
    }

    createConfetti() {
        const colors = ['#64ffda', '#ff6b6b', '#ffd166', '#4cc9f0', '#c77dff'];
        
        for (let i = 0; i < 100; i++) {
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
            
            const animation = confetti.animate([
                { transform: `translateY(0) rotate(0deg)`, opacity: 1 },
                { transform: `translateY(${window.innerHeight}px) rotate(${Math.random() * 720}deg)`, opacity: 0 }
            ], {
                duration: 3000 + Math.random() * 2000,
                easing: 'cubic-bezier(0.215, 0.610, 0.355, 1)'
            });
            
            animation.onfinish = () => confetti.remove();
        }
    }

    // ==================== УПРАВЛЕНИЕ КОМНАТАМИ ====================
    createRoom() {
        console.log('Создание новой комнаты...');
        this.connectToServer(null, true);
        
        this.showScreen('waitingScreen');
        const roomIdDisplay = document.getElementById('displayRoomId');
        if (roomIdDisplay) roomIdDisplay.textContent = 'Создание...';
    }

    joinRoom() {
        const roomId = document.getElementById('roomIdInput')?.value.toUpperCase().trim();
        
        if (!roomId || roomId.length !== 6) {
            this.showError('Введите корректный ID комнаты (6 символов)');
            return;
        }
        
        console.log(`Присоединение к комнате: ${roomId}`);
        this.connectToServer(roomId, false);
        
        this.showScreen('waitingScreen');
        const roomIdDisplay = document.getElementById('displayRoomId');
        if (roomIdDisplay) roomIdDisplay.textContent = roomId;
        this.updateStatus(`Подключение к комнате ${roomId}...`, 'info');
    }

    surrender() {
        if (confirm('Вы действительно хотите сдаться?')) {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'SURRENDER' }));
            }
        }
    }

    proposeRematch() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'REMATCH_REQUEST' }));
            this.showNotification('Запрос на реванш отправлен', 'info');
        }
    }

    requestRematch() {
        this.proposeRematch();
    }

    newGame() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.close();
        }
        this.showScreen('splashScreen');
    }

    returnToMain() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.close();
        }
        this.showScreen('splashScreen');
    }

    // ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
    createEmptyBoard() {
        return Array(10).fill().map(() => Array(10).fill(0));
    }

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

    showNotification(message, type = 'info') {
        console.log(`[${type.toUpperCase()}] ${message}`);
        
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

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.add('hidden');
        });
        
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
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
        });
        
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        
        document.querySelectorAll('.tab').forEach(tab => {
            if (tab.textContent.includes(tabName.toUpperCase())) {
                tab.classList.add('active');
            }
        });
        
        const content = document.getElementById(`${tabName}Tab`);
        if (content) content.classList.add('active');
    }

    playSound(soundName) {
        const soundMap = {
            'shot': document.getElementById('soundShot'),
            'hit': document.getElementById('soundHit'),
            'sunk': document.getElementById('soundSunk'),
            'place': document.getElementById('soundPlace')
        };
        
        const sound = soundMap[soundName];
        if (sound) {
            sound.currentTime = 0;
            sound.play().catch(e => console.log('Не удалось воспроизвести звук:', e));
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showGameMenu() {
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
        
        document.body.appendChild(menu);
        
        this.closeMenu = () => {
            if (menu.parentNode) {
                menu.parentNode.removeChild(menu);
            }
        };
    }
}

// Инициализация игры
let game;
window.addEventListener('DOMContentLoaded', () => {
    game = new BattleshipGame();
    window.game = game;
});
