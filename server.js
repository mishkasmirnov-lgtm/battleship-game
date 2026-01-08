const WebSocket = require('ws');
const http = require('http');
const url = require('url');
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
    PLAYERS_READY: 'PLAYERS_READY'
};

class GameServer {
    constructor(port) {
        this.port = port || 8080;
        this.rooms = new Map();
        this.playerStats = new Map(); // Для хранения статистики
        
        this.server = http.createServer((req, res) => {
            const parsedUrl = url.parse(req.url, true);
            
            if (parsedUrl.pathname === '/api/stats' && req.method === 'GET') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                const stats = {};
                this.playerStats.forEach((value, key) => {
                    stats[key] = value;
                });
                res.end(JSON.stringify(stats));
                return;
            }
            
            if (parsedUrl.pathname === '/health' && req.method === 'GET') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'ok', rooms: this.rooms.size }));
                return;
            }
            
            res.writeHead(404);
            res.end();
        });
        
        this.wss = new WebSocket.Server({ server: this.server });
        
        this.setupWebSocket();
        console.log(`🚀 Game server started on port ${this.port}`);
    }
    
    setupWebSocket() {
        this.wss.on('connection', (ws, req) => {
            const playerId = uuidv4();
            console.log(`🔗 Новое подключение: ${playerId}`);
            
            // Инициализируем статистику игрока
            if (!this.playerStats.has(playerId)) {
                this.playerStats.set(playerId, {
                    wins: 0,
                    losses: 0,
                    superWeapon: false,
                    totalGames: 0
                });
            }
            
            ws.playerId = playerId;
            ws.roomId = null;
            
            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleMessage(ws, message);
                } catch (error) {
                    console.error('❌ Ошибка парсинга сообщения:', error);
                    this.sendError(ws, 'Invalid message format');
                }
            });
            
            ws.on('close', () => {
                console.log(`🔌 Отключение: ${playerId}`);
                this.handleDisconnect(playerId);
            });
            
            // Отправляем ID игрока сразу после подключения
            ws.send(JSON.stringify({
                type: 'CONNECTION_ESTABLISHED',
                playerId: playerId,
                stats: this.playerStats.get(playerId)
            }));
        });
    }
    
    handleMessage(ws, message) {
        console.log(`📨 Сообщение от ${ws.playerId}:`, message.type);
        
        switch (message.type) {
            case 'CREATE_ROOM':
                this.createRoom(ws);
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
            default:
                console.log(`❓ Неизвестный тип сообщения: ${message.type}`);
        }
    }
    
    createRoom(ws) {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        const playerId = ws.playerId;
        
        const room = {
            id: roomId,
            players: new Map(),
            gameState: 'waiting',
            currentTurn: null,
            boards: new Map(),
            ships: new Map(),
            readyPlayers: new Set(),
            shipsPlaced: new Set()
        };
        
        room.players.set(playerId, {
            id: playerId,
            ws: ws,
            number: 1,
            ready: false,
            shipsPlaced: false,
            board: null,
            playerName: `Игрок 1`
        });
        
        this.rooms.set(roomId, room);
        ws.roomId = roomId;
        
        console.log(`🎮 Создана комната ${roomId} игроком ${playerId}`);
        
        ws.send(JSON.stringify({
            type: MESSAGE_TYPES.ROOM_CREATED,
            roomId: roomId,
            playerNumber: 1,
            playerId: playerId
        }));
    }
    
    joinRoom(ws, roomId, playerName) {
        const playerId = ws.playerId;
        
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
        
        // Добавляем второго игрока
        const playerNumber = 2;
        room.players.set(playerId, {
            id: playerId,
            ws: ws,
            number: playerNumber,
            ready: false,
            shipsPlaced: false,
            board: null,
            playerName: playerName || `Игрок ${playerNumber}`
        });
        
        ws.roomId = roomId;
        
        console.log(`👥 Игрок ${playerId} присоединился к комнате ${roomId}`);
        
        // Отправляем подтверждение новому игроку
        ws.send(JSON.stringify({
            type: MESSAGE_TYPES.ROOM_JOINED,
            roomId: roomId,
            playerNumber: playerNumber,
            playerId: playerId
        }));
        
        // Уведомляем первого игрока о подключении второго
        const firstPlayer = Array.from(room.players.values())[0];
        if (firstPlayer.ws.readyState === WebSocket.OPEN) {
            firstPlayer.ws.send(JSON.stringify({
                type: MESSAGE_TYPES.PLAYER_CONNECTED,
                playerNumber: playerNumber,
                playerName: playerName || `Игрок ${playerNumber}`
            }));
        }
        
        // Отправляем информацию о комнате обоим игрокам
        this.sendRoomInfo(room);
        
        // АВТОМАТИЧЕСКИ начинаем игру при подключении второго игрока
        if (room.players.size === 2) {
            this.startGame(room);
        }
    }
    
    startGame(room) {
        console.log(`🎲 Начинаем игру в комнате ${room.id}`);
        room.gameState = 'placing';
        
        // Выбираем случайного игрока для первого хода
        const players = Array.from(room.players.values());
        room.currentTurn = players[Math.floor(Math.random() * players.length)].id;
        
        // Уведомляем всех игроков о начале игры
        room.players.forEach((player, playerId) => {
            if (player.ws.readyState === WebSocket.OPEN) {
                player.ws.send(JSON.stringify({
                    type: MESSAGE_TYPES.GAME_START,
                    yourTurn: room.currentTurn === playerId,
                    roomId: room.id
                }));
            }
        });
        
        // Даем 3 секунды на подготовку
        setTimeout(() => {
            this.checkAllShipsPlaced(room);
        }, 3000);
    }
    
    handlePlayerReady(ws) {
        const room = this.getPlayerRoom(ws.playerId);
        if (!room) return;
        
        const player = room.players.get(ws.playerId);
        if (!player) return;
        
        player.ready = true;
        room.readyPlayers.add(ws.playerId);
        
        console.log(`✅ Игрок ${ws.playerId} готов в комнате ${room.id}`);
        
        // Проверяем, готовы ли все игроки
        if (room.readyPlayers.size === 2) {
            console.log(`🎯 Все игроки готовы в комнате ${room.id}`);
            
            // Если еще не начали игру, начинаем
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
        
        player.ships = ships;
        player.shipsPlaced = true;
        room.shipsPlaced.add(ws.playerId);
        
        console.log(`🚢 Игрок ${ws.playerId} расставил корабли в комнате ${room.id}`);
        
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
                        yourTurn: room.currentTurn === playerId
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
        
        // Проверяем попадание
        let hit = false;
        let sunk = false;
        let shipType = null;
        
        for (const ship of opponent.ships) {
            for (const coord of ship.coordinates) {
                if (coord.x === x && coord.y === y) {
                    hit = true;
                    shipType = ship.type;
                    
                    // Проверяем, потоплен ли корабль
                    if (!ship.hits) ship.hits = new Set();
                    ship.hits.add(`${x},${y}`);
                    
                    if (ship.hits.size === ship.coordinates.length) {
                        sunk = true;
                        ship.sunk = true;
                    }
                    break;
                }
            }
            if (hit) break;
        }
        
        // Меняем ход
        room.currentTurn = opponentId;
        
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
                    yourTurn: room.currentTurn === playerId
                }));
            }
        });
        
        // Проверяем конец игры
        this.checkGameOver(room, opponent);
    }
    
    handleSuperWeapon(ws) {
        const room = this.getPlayerRoom(ws.playerId);
        if (!room) return;
        
        const playerStats = this.playerStats.get(ws.playerId);
        
        if (!playerStats.superWeapon) {
            this.sendError(ws, 'Супер-оружие недоступно');
            return;
        }
        
        // Используем супер-оружие
        playerStats.superWeapon = false;
        
        const opponentId = this.getOpponentId(room, ws.playerId);
        const opponent = room.players.get(opponentId);
        
        // Помечаем все корабли противника как потопленные
        if (opponent.ships) {
            opponent.ships.forEach(ship => {
                ship.sunk = true;
                ship.hits = new Set(ship.coordinates.map(c => `${c.x},${c.y}`));
            });
        }
        
        // Конец игры
        this.endGame(room, ws.playerId, 'nuclear');
    }
    
    checkGameOver(room, opponent) {
        if (!opponent.ships) return;
        
        const allSunk = opponent.ships.every(ship => ship.sunk);
        
        if (allSunk) {
            const winnerId = this.getOpponentId(room, opponent.id);
            this.endGame(room, winnerId, 'all_ships_sunk');
        }
    }
    
    endGame(room, winnerId, reason) {
        room.gameState = 'finished';
        
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
                }
            } else {
                stats.losses++;
            }
            
            this.playerStats.set(playerId, stats);
        });
        
        // Уведомляем всех игроков
        room.players.forEach((player, playerId) => {
            if (player.ws.readyState === WebSocket.OPEN) {
                player.ws.send(JSON.stringify({
                    type: MESSAGE_TYPES.GAME_OVER,
                    winnerId: winnerId,
                    reason: reason,
                    stats: this.playerStats.get(playerId)
                }));
            }
        });
        
        // Чистим комнату через 30 секунд
        setTimeout(() => {
            if (this.rooms.has(room.id)) {
                this.rooms.delete(room.id);
                console.log(`🧹 Очищена комната ${room.id}`);
            }
        }, 30000);
    }
    
    handlePlayerInfo(ws, message) {
        const room = this.getPlayerRoom(ws.playerId);
        if (!room) return;
        
        const player = room.players.get(ws.playerId);
        if (!player) return;
        
        player.playerName = message.playerName || player.playerName;
        
        // Уведомляем других игроков
        room.players.forEach((p, id) => {
            if (id !== ws.playerId && p.ws.readyState === WebSocket.OPEN) {
                p.ws.send(JSON.stringify({
                    type: MESSAGE_TYPES.PLAYER_INFO,
                    playerNumber: player.number,
                    playerName: player.playerName
                }));
            }
        });
    }
    
    sendRoomInfo(room) {
        const playersInfo = Array.from(room.players.values()).map(p => ({
            playerNumber: p.number,
            playerName: p.playerName,
            ready: p.ready,
            shipsPlaced: p.shipsPlaced
        }));
        
        room.players.forEach((player) => {
            if (player.ws.readyState === WebSocket.OPEN) {
                player.ws.send(JSON.stringify({
                    type: MESSAGE_TYPES.ROOM_INFO,
                    roomId: room.id,
                    players: playersInfo,
                    gameState: room.gameState
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
    
    handleDisconnect(playerId) {
        for (const [roomId, room] of this.rooms) {
            if (room.players.has(playerId)) {
                console.log(`💥 Игрок ${playerId} отключился из комнаты ${roomId}`);
                
                // Уведомляем другого игрока
                room.players.forEach((player, id) => {
                    if (id !== playerId && player.ws.readyState === WebSocket.OPEN) {
                        player.ws.send(JSON.stringify({
                            type: MESSAGE_TYPES.ERROR,
                            message: 'Противник отключился'
                        }));
                    }
                });
                
                // Удаляем комнату
                this.rooms.delete(roomId);
                break;
            }
        }
    }
    
    sendError(ws, message) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: MESSAGE_TYPES.ERROR,
                message: message
            }));
        }
    }
}

// Запуск сервера
const PORT = process.env.PORT || 8080;
const server = new GameServer(PORT);

server.server.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📊 API статистики: http://localhost:${PORT}/api/stats`);
    console.log(`❤️  Health check: http://localhost:${PORT}/health`);
});
