const WebSocket = require('ws');
const express = require('express');
const http = require('http');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Константы сообщений
const MESSAGE_TYPES = {
    PLAYER_CONNECTED: 'PLAYER_CONNECTED',
    PLAYER_READY: 'PLAYER_READY',
    GAME_START: 'GAME_START',
    SHIPS_PLACED: 'SHIPS_PLACED',
    PLAYER_TURN: 'PLAYER_TURN',
    FIRE_SHOT: 'FIRE_SHOT',
    SHOT_RESULT: 'SHOT_RESULT',
    GAME_OVER: 'GAME_OVER',
    ERROR: 'ERROR',
    ROOM_CREATED: 'ROOM_CREATED',
    JOIN_ROOM: 'JOIN_ROOM',
    ROOM_JOINED: 'ROOM_JOINED',
    PLAYER_INFO: 'PLAYER_INFO',
    ROOM_INFO: 'ROOM_INFO',
    PLAYERS_READY: 'PLAYERS_READY',
    CONNECTION_ESTABLISHED: 'CONNECTION_ESTABLISHED',
    PING: 'PING',
    PONG: 'PONG'
};

class GameServer {
    constructor() {
        this.rooms = new Map();
        this.playerStats = new Map();
        this.wss = null;
        this.heartbeatInterval = null;
    }
    
    setupWebSocket(wss) {
        this.wss = wss;
        
        // Очистка старых комнат каждые 5 минут
        setInterval(() => this.cleanupOldRooms(), 300000);
        
        wss.on('connection', (ws, req) => {
            const playerId = uuidv4();
            console.log(`🔗 Новое подключение: ${playerId} (${req.socket.remoteAddress})`);
            
            // Инициализация игрока
            ws.playerId = playerId;
            ws.roomId = null;
            ws.isAlive = true;
            ws.lastActivity = Date.now();
            
            // Инициализация статистики
            if (!this.playerStats.has(playerId)) {
                this.playerStats.set(playerId, {
                    wins: 0,
                    losses: 0,
                    superWeapon: false,
                    totalGames: 0,
                    playerName: `Игрок_${Math.floor(Math.random() * 1000)}`
                });
            }
            
            // Heartbeat для проверки активности
            ws.on('pong', () => {
                ws.isAlive = true;
            });
            
            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    ws.lastActivity = Date.now();
                    
                    if (message.type === 'PING') {
                        ws.send(JSON.stringify({ type: 'PONG' }));
                        return;
                    }
                    
                    this.handleMessage(ws, message);
                } catch (error) {
                    console.error(`❌ Ошибка парсинга от ${playerId}:`, error);
                    this.sendError(ws, 'Invalid message format');
                }
            });
            
            ws.on('close', () => {
                console.log(`🔌 Отключение: ${playerId}`);
                this.handleDisconnect(playerId);
            });
            
            ws.on('error', (error) => {
                console.error(`❌ WebSocket ошибка для ${playerId}:`, error);
            });
            
            // Отправляем информацию о подключении
            ws.send(JSON.stringify({
                type: 'CONNECTION_ESTABLISHED',
                playerId: playerId,
                stats: this.playerStats.get(playerId),
                timestamp: Date.now()
            }));
        });
        
        // Heartbeat каждые 30 секунд
        this.heartbeatInterval = setInterval(() => {
            wss.clients.forEach((ws) => {
                if (ws.isAlive === false) {
                    console.log(`💔 Соединение разорвано: ${ws.playerId}`);
                    this.handleDisconnect(ws.playerId);
                    return ws.terminate();
                }
                
                ws.isAlive = false;
                try {
                    ws.ping();
                } catch (e) {
                    // Игнорируем ошибки ping
                }
            });
        }, 30000);
    }
    
    cleanupOldRooms() {
        const now = Date.now();
        const oneHourAgo = now - 3600000;
        
        for (const [roomId, room] of this.rooms.entries()) {
            // Удаляем комнаты старше 1 часа
            if (room.createdAt && room.createdAt < oneHourAgo) {
                console.log(`🧹 Удаляю старую комнату ${roomId}`);
                this.rooms.delete(roomId);
            }
        }
    }
    
    handleMessage(ws, message) {
        console.log(`📨 [${ws.playerId}] ${message.type}`);
        
        switch (message.type) {
            case 'CREATE_ROOM':
                this.createRoom(ws, message.playerName);
                break;
            case 'JOIN_ROOM':
                this.joinRoom(ws, message.roomId, message.playerName);
                break;
            case 'PLAYER_READY':
                this.handlePlayerReady(ws);
                break;
            case 'SHIPS_PLACED':
                this.handleShipsPlaced(ws, message.ships);
                break;
            case 'FIRE_SHOT':
                this.handleFireShot(ws, message.x, message.y);
                break;
            case 'USE_SUPER_WEAPON':
                this.handleSuperWeapon(ws);
                break;
            case 'PLAYER_INFO':
                this.handlePlayerInfo(ws, message);
                break;
            case 'LEAVE_ROOM':
                this.handleLeaveRoom(ws);
                break;
            default:
                console.log(`❓ [${ws.playerId}] Неизвестный тип: ${message.type}`);
        }
    }
    
    createRoom(ws, playerName) {
        // Проверяем, не находится ли игрок уже в комнате
        if (ws.roomId) {
            this.sendError(ws, 'Вы уже находитесь в комнате');
            return;
        }
        
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        
        // Гарантируем уникальность ID комнаты
        while (this.rooms.has(roomId)) {
            roomId = Math.floor(1000 + Math.random() * 9000).toString();
        }
        
        const playerId = ws.playerId;
        
        const room = {
            id: roomId,
            players: new Map(),
            gameState: 'waiting',
            currentTurn: null,
            boards: new Map(),
            ships: new Map(),
            readyPlayers: new Set(),
            shipsPlaced: new Set(),
            createdAt: Date.now(),
            lastActivity: Date.now()
        };
        
        // Обновляем имя игрока в статистике
        if (playerName) {
            const stats = this.playerStats.get(playerId);
            stats.playerName = playerName;
            this.playerStats.set(playerId, stats);
        }
        
        room.players.set(playerId, {
            id: playerId,
            ws: ws,
            number: 1,
            ready: false,
            shipsPlaced: false,
            board: null,
            playerName: playerName || this.playerStats.get(playerId).playerName,
            connectedAt: Date.now()
        });
        
        this.rooms.set(roomId, room);
        ws.roomId = roomId;
        
        console.log(`🎮 Создана комната ${roomId} игроком ${playerId} (${playerName || 'Игрок 1'})`);
        
        ws.send(JSON.stringify({
            type: MESSAGE_TYPES.ROOM_CREATED,
            roomId: roomId,
            playerNumber: 1,
            playerId: playerId,
            playerName: playerName || this.playerStats.get(playerId).playerName
        }));
    }
    
    joinRoom(ws, roomId, playerName) {
        const playerId = ws.playerId;
        
        if (!roomId || roomId.length !== 4) {
            this.sendError(ws, 'Неверный формат ID комнаты (4 цифры)');
            return;
        }
        
        if (!this.rooms.has(roomId)) {
            this.sendError(ws, 'Комната не найдена');
            return;
        }
        
        const room = this.rooms.get(roomId);
        
        if (room.players.size >= 2) {
            this.sendError(ws, 'Комната заполнена');
            return;
        }
        
        if (room.gameState !== 'waiting') {
            this.sendError(ws, 'Игра уже началась');
            return;
        }
        
        // Проверяем, не пытается ли игрок присоединиться к своей же комнате
        if (Array.from(room.players.keys())[0] === playerId) {
            this.sendError(ws, 'Вы уже в этой комнате');
            return;
        }
        
        // Обновляем имя игрока в статистике
        if (playerName) {
            const stats = this.playerStats.get(playerId);
            stats.playerName = playerName;
            this.playerStats.set(playerId, stats);
        }
        
        const playerNumber = 2;
        const actualPlayerName = playerName || `Игрок ${playerNumber}`;
        
        room.players.set(playerId, {
            id: playerId,
            ws: ws,
            number: playerNumber,
            ready: false,
            shipsPlaced: false,
            board: null,
            playerName: actualPlayerName,
            connectedAt: Date.now()
        });
        
        ws.roomId = roomId;
        room.lastActivity = Date.now();
        
        console.log(`👥 Игрок ${playerId} (${actualPlayerName}) присоединился к комнате ${roomId}`);
        
        // Отправляем подтверждение новому игроку
        ws.send(JSON.stringify({
            type: MESSAGE_TYPES.ROOM_JOINED,
            roomId: roomId,
            playerNumber: playerNumber,
            playerId: playerId,
            playerName: actualPlayerName
        }));
        
        // Уведомляем первого игрока о подключении второго
        const firstPlayer = Array.from(room.players.values())[0];
        if (firstPlayer.ws.readyState === WebSocket.OPEN) {
            firstPlayer.ws.send(JSON.stringify({
                type: MESSAGE_TYPES.PLAYER_CONNECTED,
                playerNumber: playerNumber,
                playerName: actualPlayerName,
                playerId: playerId
            }));
        }
        
        // Отправляем обновленную информацию о комнате обоим игрокам
        this.sendRoomInfo(room);
        
        // АВТОМАТИЧЕСКИ начинаем игру при подключении второго игрока
        console.log(`🎯 В комнате ${roomId} 2 игрока, начинаем игру`);
        this.startGame(room);
    }
    
    startGame(room) {
        room.gameState = 'placing';
        room.lastActivity = Date.now();
        
        // Выбираем случайного игрока для первого хода
        const players = Array.from(room.players.values());
        const firstPlayerIndex = Math.floor(Math.random() * players.length);
        room.currentTurn = players[firstPlayerIndex].id;
        
        console.log(`🎲 Начинаем игру в комнате ${room.id}. Первый ход у игрока ${room.currentTurn}`);
        
        // Уведомляем всех игроков о начале игры
        room.players.forEach((player, playerId) => {
            if (player.ws.readyState === WebSocket.OPEN) {
                player.ws.send(JSON.stringify({
                    type: MESSAGE_TYPES.GAME_START,
                    yourTurn: room.currentTurn === playerId,
                    roomId: room.id,
                    opponentName: this.getOpponent(room, playerId)?.playerName || 'Противник'
                }));
            }
        });
    }
    
    handlePlayerReady(ws) {
        const room = this.getPlayerRoom(ws.playerId);
        if (!room) {
            this.sendError(ws, 'Вы не в комнате');
            return;
        }
        
        const player = room.players.get(ws.playerId);
        if (!player) return;
        
        if (player.ready) {
            console.log(`⚠️ Игрок ${ws.playerId} уже готов`);
            return;
        }
        
        player.ready = true;
        room.readyPlayers.add(ws.playerId);
        room.lastActivity = Date.now();
        
        console.log(`✅ Игрок ${ws.playerId} (${player.playerName}) готов в комнате ${room.id}`);
        
        // Отправляем обновленную информацию о комнате
        this.sendRoomInfo(room);
        
        // Если в комнате 1 игрок, просто подтверждаем готовность
        if (room.players.size === 1) {
            ws.send(JSON.stringify({
                type: 'PLAYER_READY_ACK',
                message: 'Ожидаем второго игрока...'
            }));
            return;
        }
        
        // Проверяем, готовы ли все игроки (только для 2 игроков)
        if (room.readyPlayers.size === 2) {
            console.log(`🎯 Все игроки готовы в комнате ${room.id}`);
            
            // Если игра еще не началась, начинаем
            if (room.gameState === 'waiting') {
                this.startGame(room);
            }
        }
    }
    
    handleShipsPlaced(ws, ships) {
        const room = this.getPlayerRoom(ws.playerId);
        if (!room) return;
        
        const player = room.players.get(ws.playerId);
        if (!player) return;
        
        player.ships = ships || [];
        player.shipsPlaced = true;
        room.shipsPlaced.add(ws.playerId);
        room.lastActivity = Date.now();
        
        console.log(`🚢 Игрок ${ws.playerId} расставил ${player.ships.length} кораблей в комнате ${room.id}`);
        
        // Проверяем, все ли расставили корабли
        this.checkAllShipsPlaced(room);
    }
    
    checkAllShipsPlaced(room) {
        if (room.shipsPlaced.size === 2 && room.gameState === 'placing') {
            room.gameState = 'playing';
            console.log(`⚔️ Все корабли расставлены, начинаем битву в ${room.id}`);
            
            // Уведомляем о начале хода
            room.players.forEach((player, playerId) => {
                if (player.ws.readyState === WebSocket.OPEN) {
                    player.ws.send(JSON.stringify({
                        type: MESSAGE_TYPES.PLAYER_TURN,
                        yourTurn: room.currentTurn === playerId,
                        message: room.currentTurn === playerId ? 'Ваш ход!' : 'Ход противника'
                    }));
                }
            });
        }
    }
    
    handleFireShot(ws, x, y) {
        const room = this.getPlayerRoom(ws.playerId);
        if (!room) return;
        
        if (room.gameState !== 'playing') {
            this.sendError(ws, 'Игра еще не началась');
            return;
        }
        
        if (room.currentTurn !== ws.playerId) {
            this.sendError(ws, 'Не ваш ход');
            return;
        }
        
        const attacker = room.players.get(ws.playerId);
        const opponentId = this.getOpponentId(room, ws.playerId);
        const opponent = room.players.get(opponentId);
        
        if (!opponent || !opponent.ships) {
            this.sendError(ws, 'Противник не готов');
            return;
        }
        
        let hit = false;
        let sunk = false;
        let shipType = null;
        let shipIndex = -1;
        
        // Проверяем попадание
        for (let i = 0; i < opponent.ships.length; i++) {
            const ship = opponent.ships[i];
            for (const coord of ship.coordinates) {
                if (coord.x === x && coord.y === y) {
                    hit = true;
                    shipType = ship.type;
                    shipIndex = i;
                    
                    // Отмечаем попадание
                    if (!ship.hits) ship.hits = [];
                    if (!ship.hits.includes(`${x},${y}`)) {
                        ship.hits.push(`${x},${y}`);
                    }
                    
                    // Проверяем, потоплен ли корабль
                    if (ship.hits.length === ship.coordinates.length) {
                        sunk = true;
                        ship.sunk = true;
                        console.log(`💥 Корабль ${ship.type} потоплен!`);
                    }
                    break;
                }
            }
            if (hit) break;
        }
        
        // Меняем ход
        room.currentTurn = opponentId;
        room.lastActivity = Date.now();
        
        console.log(`🎯 Игрок ${ws.playerId} выстрелил в (${x},${y}): ${hit ? 'ПОПАДАНИЕ' : 'ПРОМАХ'} ${sunk ? 'КОРАБЛЬ ПОТОПЛЕН' : ''}`);
        
        // Отправляем результат всем игрокам
        room.players.forEach((player, playerId) => {
            if (player.ws.readyState === WebSocket.OPEN) {
                player.ws.send(JSON.stringify({
                    type: MESSAGE_TYPES.SHOT_RESULT,
                    x: x,
                    y: y,
                    hit: hit,
                    sunk: sunk,
                    shipType: shipType,
                    playerId: ws.playerId,
                    yourTurn: room.currentTurn === playerId,
                    message: hit ? (sunk ? `Потоплен ${shipType}!` : 'Попадание!') : 'Промах!'
                }));
            }
        });
        
        // Проверяем конец игры
        if (hit) {
            this.checkGameOver(room, opponent);
        }
    }
    
    handleSuperWeapon(ws) {
        const room = this.getPlayerRoom(ws.playerId);
        if (!room) return;
        
        const playerStats = this.playerStats.get(ws.playerId);
        
        if (!playerStats.superWeapon) {
            this.sendError(ws, 'Супер-оружие недоступно. Нужно 10 побед!');
            return;
        }
        
        playerStats.superWeapon = false;
        this.playerStats.set(ws.playerId, playerStats);
        
        const opponentId = this.getOpponentId(room, ws.playerId);
        const opponent = room.players.get(opponentId);
        
        console.log(`💣 Игрок ${ws.playerId} использовал ЯДЕРНУЮ БОМБУ в комнате ${room.id}!`);
        
        // Помечаем все корабли противника как потопленные
        if (opponent.ships) {
            opponent.ships.forEach(ship => {
                ship.sunk = true;
                ship.hits = ship.coordinates.map(c => `${c.x},${c.y}`);
            });
        }
        
        // Конец игры - ядерная победа
        this.endGame(room, ws.playerId, 'nuclear');
    }
    
    checkGameOver(room, opponent) {
        if (!opponent.ships) return;
        
        const allSunk = opponent.ships.every(ship => ship.sunk);
        
        if (allSunk) {
            const winnerId = this.getOpponentId(room, opponent.id);
            console.log(`🏆 Игра окончена! Победитель: ${winnerId} в комнате ${room.id}`);
            this.endGame(room, winnerId, 'all_ships_sunk');
        }
    }
    
    endGame(room, winnerId, reason) {
        room.gameState = 'finished';
        room.lastActivity = Date.now();
        
        // Обновляем статистику
        room.players.forEach((player, playerId) => {
            const stats = this.playerStats.get(playerId);
            if (!stats) return;
            
            stats.totalGames++;
            
            if (playerId === winnerId) {
                stats.wins++;
                
                // Проверяем, достиг ли игрок 10 побед
                if (stats.wins >= 10 && !stats.superWeapon) {
                    stats.superWeapon = true;
                    console.log(`🎉 Игрок ${playerId} разблокировал ЯДЕРНУЮ БОМБУ!`);
                }
            } else {
                stats.losses++;
            }
            
            this.playerStats.set(playerId, stats);
        });
        
        console.log(`🏁 Конец игры в комнате ${room.id}. Причина: ${reason}. Победитель: ${winnerId}`);
        
        // Уведомляем всех игроков
        room.players.forEach((player, playerId) => {
            if (player.ws.readyState === WebSocket.OPEN) {
                player.ws.send(JSON.stringify({
                    type: MESSAGE_TYPES.GAME_OVER,
                    winnerId: winnerId,
                    winnerName: room.players.get(winnerId)?.playerName || 'Победитель',
                    reason: reason,
                    stats: this.playerStats.get(playerId),
                    message: playerId === winnerId ? 'Вы победили!' : 'Вы проиграли!'
                }));
            }
        });
        
        // Чистим комнату через 1 минуту
        setTimeout(() => {
            if (this.rooms.has(room.id)) {
                console.log(`🧹 Автоочистка комнаты ${room.id}`);
                this.rooms.delete(room.id);
                
                // Сбрасываем roomId у игроков
                room.players.forEach((player) => {
                    if (player.ws.readyState === WebSocket.OPEN) {
                        player.ws.roomId = null;
                    }
                });
            }
        }, 60000);
    }
    
    handlePlayerInfo(ws, message) {
        const room = this.getPlayerRoom(ws.playerId);
        const playerId = ws.playerId;
        
        if (message.playerName) {
            const stats = this.playerStats.get(playerId);
            if (stats) {
                stats.playerName = message.playerName;
                this.playerStats.set(playerId, stats);
            }
            
            // Если игрок в комнате, обновляем имя там тоже
            if (room) {
                const player = room.players.get(playerId);
                if (player) {
                    player.playerName = message.playerName;
                    room.lastActivity = Date.now();
                    
                    // Уведомляем других игроков в комнате
                    room.players.forEach((p, id) => {
                        if (id !== playerId && p.ws.readyState === WebSocket.OPEN) {
                            p.ws.send(JSON.stringify({
                                type: MESSAGE_TYPES.PLAYER_INFO,
                                playerNumber: player.number,
                                playerName: message.playerName,
                                playerId: playerId
                            }));
                        }
                    });
                }
            }
        }
    }
    
    handleLeaveRoom(ws) {
        const playerId = ws.playerId;
        const room = this.getPlayerRoom(playerId);
        
        if (!room) {
            ws.send(JSON.stringify({
                type: 'LEFT_ROOM',
                message: 'Вы не в комнате'
            }));
            return;
        }
        
        console.log(`🚪 Игрок ${playerId} покинул комнату ${room.id}`);
        
        // Уведомляем других игроков
        room.players.forEach((player, id) => {
            if (id !== playerId && player.ws.readyState === WebSocket.OPEN) {
                player.ws.send(JSON.stringify({
                    type: 'PLAYER_LEFT',
                    playerId: playerId,
                    playerName: room.players.get(playerId)?.playerName || 'Игрок',
                    message: 'Противник покинул комнату'
                }));
            }
        });
        
        // Удаляем игрока из комнаты
        room.players.delete(playerId);
        room.readyPlayers.delete(playerId);
        room.shipsPlaced.delete(playerId);
        ws.roomId = null;
        
        // Если в комнате не осталось игроков, удаляем комнату
        if (room.players.size === 0) {
            this.rooms.delete(room.id);
            console.log(`🧹 Комната ${room.id} удалена (пустая)`);
        }
        
        ws.send(JSON.stringify({
            type: 'LEFT_ROOM',
            message: 'Вы покинули комнату',
            roomId: room.id
        }));
    }
    
    sendRoomInfo(room) {
        const playersInfo = Array.from(room.players.values()).map(p => ({
            playerId: p.id,
            playerNumber: p.number,
            playerName: p.playerName,
            ready: p.ready,
            shipsPlaced: p.shipsPlaced,
            connectedAt: p.connectedAt
        }));
        
        room.players.forEach((player) => {
            if (player.ws.readyState === WebSocket.OPEN) {
                player.ws.send(JSON.stringify({
                    type: MESSAGE_TYPES.ROOM_INFO,
                    roomId: room.id,
                    players: playersInfo,
                    gameState: room.gameState,
                    currentTurn: room.currentTurn,
                    roomSize: room.players.size,
                    maxPlayers: 2
                }));
            }
        });
    }
    
    getPlayerRoom(playerId) {
        for (const [roomId, room] of this.rooms) {
            if (room.players.has(playerId)) {
                return room;
            }
        }
        return null;
    }
    
    getOpponentId(room, playerId) {
        for (const [id, player] of room.players) {
            if (id !== playerId) {
                return id;
            }
        }
        return null;
    }
    
    getOpponent(room, playerId) {
        for (const [id, player] of room.players) {
            if (id !== playerId) {
                return player;
            }
        }
        return null;
    }
    
    handleDisconnect(playerId) {
        const room = this.getPlayerRoom(playerId);
        
        if (room) {
            console.log(`💥 Игрок ${playerId} отключился из комнаты ${room.id}`);
            
            // Уведомляем другого игрока
            room.players.forEach((player, id) => {
                if (id !== playerId && player.ws.readyState === WebSocket.OPEN) {
                    player.ws.send(JSON.stringify({
                        type: MESSAGE_TYPES.ERROR,
                        message: 'Противник отключился',
                        playerId: playerId,
                        playerName: room.players.get(playerId)?.playerName || 'Игрок'
                    }));
                }
            });
            
            // Удаляем игрока из комнаты
            room.players.delete(playerId);
            room.readyPlayers.delete(playerId);
            room.shipsPlaced.delete(playerId);
            
            // Если в комнате не осталось игроков, удаляем её
            if (room.players.size === 0) {
                this.rooms.delete(room.id);
                console.log(`🧹 Комната ${room.id} удалена (все отключились)`);
            }
        }
    }
    
    sendError(ws, message) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: MESSAGE_TYPES.ERROR,
                message: message,
                timestamp: Date.now()
            }));
        }
    }
}

// ==================== ОСНОВНОЙ СЕРВЕР ====================

const PORT = process.env.PORT || 10000;
const app = express();
const server = http.createServer(app);

// Раздача статических файлов
app.use(express.static(path.join(__dirname)));
app.use(express.static(path.join(__dirname, 'public')));

// Middleware для логирования запросов
app.use((req, res, next) => {
    console.log(`🌐 ${req.method} ${req.url} from ${req.ip}`);
    next();
});

// Роут для главной страницы
app.get('/', (req, res) => {
    const fs = require('fs');
    const publicIndex = path.join(__dirname, 'public', 'index.html');
    const rootIndex = path.join(__dirname, 'index.html');
    
    if (fs.existsSync(publicIndex)) {
        res.sendFile(publicIndex);
    } else if (fs.existsSync(rootIndex)) {
        res.sendFile(rootIndex);
    } else {
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Морской Бой</title>
                <style>
                    body { font-family: Arial; padding: 40px; text-align: center; background: #0c2461; color: white; }
                    h1 { color: #4a69bd; }
                    .container { max-width: 600px; margin: 0 auto; }
                    .stats { background: rgba(255,255,255,0.1); padding: 20px; border-radius: 10px; margin: 20px 0; }
                    .btn { display: inline-block; padding: 15px 30px; background: #4a69bd; color: white; 
                           text-decoration: none; border-radius: 5px; margin: 10px; font-size: 18px; cursor: pointer; }
                    .btn:hover { background: #6a89cc; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🚢 Морской Бой</h1>
                    <p>Сервер запущен и работает!</p>
                    <div class="stats">
                        <p>Для начала игры загрузите файлы игры</p>
                        <p>Требуется: index.html и game.js</p>
                    </div>
                    <div>
                        <div class="btn" onclick="window.location.reload()">Обновить</div>
                        <a href="/health" class="btn">Проверить Health</a>
                        <a href="/api/stats" class="btn">Статистика</a>
                    </div>
                </div>
            </body>
            </html>
        `);
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        server: 'Battleship Game Server',
        version: '1.0.0',
        rooms: gameServer.rooms.size,
        players: gameServer.playerStats.size,
        uptime: process.uptime()
    });
});

// API для статистики
app.get('/api/stats', (req, res) => {
    const stats = {};
    gameServer.playerStats.forEach((value, key) => {
        stats[key] = value;
    });
    res.json({
        totalPlayers: gameServer.playerStats.size,
        totalRooms: gameServer.rooms.size,
        players: stats
    });
});

// API для списка комнат
app.get('/api/rooms', (req, res) => {
    const rooms = [];
    gameServer.rooms.forEach((room, id) => {
        rooms.push({
            id: id,
            players: room.players.size,
            gameState: room.gameState,
            createdAt: room.createdAt,
            lastActivity: room.lastActivity
        });
    });
    res.json(rooms);
});

// Создаем WebSocket сервер
const wss = new WebSocket.Server({ 
    server,
    clientTracking: true,
    perMessageDeflate: {
        zlibDeflateOptions: {
            chunkSize: 1024,
            memLevel: 7,
            level: 3
        },
        zlibInflateOptions: {
            chunkSize: 10 * 1024
        },
        clientNoContextTakeover: true,
        serverNoContextTakeover: true,
        serverMaxWindowBits: 10,
        concurrencyLimit: 10,
        threshold: 1024
    }
});

// Создаем игровой сервер
const gameServer = new GameServer();
gameServer.setupWebSocket(wss);

// Запускаем сервер
server.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║                🚀 МОРСКОЙ БОЙ СЕРВЕР                    ║
╠══════════════════════════════════════════════════════════╣
║ Порт: ${PORT}                                            ║
║ URL: http://localhost:${PORT}/                           ║
║ WebSocket: ws://localhost:${PORT}/                       ║
║ Health: http://localhost:${PORT}/health                  ║
║ Статистика: http://localhost:${PORT}/api/stats           ║
║ Комнаты: http://localhost:${PORT}/api/rooms              ║
╚══════════════════════════════════════════════════════════╝
    `);
    
    console.log('✅ Сервер успешно запущен!');
    console.log('📋 Ожидание подключений игроков...');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('\n🛑 Получен SIGTERM, закрываю сервер...');
    
    // Закрываем все WebSocket соединения
    wss.clients.forEach((client) => {
        client.close();
    });
    
    // Закрываем HTTP сервер
    server.close(() => {
        console.log('✅ Сервер корректно закрыт');
        process.exit(0);
    });
    
    // Принудительный выход через 5 секунд
    setTimeout(() => {
        console.log('⚠️ Принудительное завершение');
        process.exit(1);
    }, 5000);
});
