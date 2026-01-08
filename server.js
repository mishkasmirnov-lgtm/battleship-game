const WebSocket = require('ws');
const express = require('express');
const http = require('http');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const MESSAGE_TYPES = {
    CONNECTION_ESTABLISHED: 'CONNECTION_ESTABLISHED',
    ROOM_CREATED: 'ROOM_CREATED',
    ROOM_JOINED: 'ROOM_JOINED',
    PLAYER_CONNECTED: 'PLAYER_CONNECTED',
    GAME_START: 'GAME_START',
    SHIPS_PLACED: 'SHIPS_PLACED',
    PLAYER_TURN: 'PLAYER_TURN',
    FIRE_SHOT: 'FIRE_SHOT',
    SHOT_RESULT: 'SHOT_RESULT',
    GAME_OVER: 'GAME_OVER',
    ERROR: 'ERROR',
    ROOM_INFO: 'ROOM_INFO',
    PLAYER_READY: 'PLAYER_READY'
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

        wss.on('connection', (ws, req) => {
            const playerId = uuidv4();
            console.log(`🔗 Новое подключение: ${playerId}`);

            ws.playerId = playerId;
            ws.roomId = null;
            ws.isAlive = true;
            ws.lastActivity = Date.now();

            if (!this.playerStats.has(playerId)) {
                this.playerStats.set(playerId, {
                    wins: 0,
                    losses: 0,
                    superWeapon: false,
                    totalGames: 0,
                    playerName: `Игрок_${Math.floor(Math.random() * 1000)}`
                });
            }

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
                    console.error('❌ Ошибка парсинга:', error);
                    this.sendError(ws, 'Ошибка формата сообщения');
                }
            });

            ws.on('close', () => {
                console.log(`🔌 Отключение: ${playerId}`);
                this.handleDisconnect(playerId);
            });

            ws.on('error', (error) => {
                console.error(`❌ Ошибка WebSocket:`, error);
            });

            ws.send(JSON.stringify({
                type: 'CONNECTION_ESTABLISHED',
                playerId: playerId,
                stats: this.playerStats.get(playerId)
            }));
        });

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
                } catch (e) {}
            });
        }, 30000);
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
        }
    }

    createRoom(ws, playerName) {
        if (ws.roomId) {
            this.sendError(ws, 'Вы уже в комнате');
            return;
        }

        let roomId;
        do {
            roomId = Math.floor(1000 + Math.random() * 9000).toString();
        } while (this.rooms.has(roomId));

        const playerId = ws.playerId;

        const room = {
            id: roomId,
            players: new Map(),
            gameState: 'waiting',
            currentTurn: null,
            readyPlayers: new Set(),
            shipsPlaced: new Set(),
            createdAt: Date.now(),
            lastActivity: Date.now()
        };

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
            ships: [],
            playerName: playerName || this.playerStats.get(playerId).playerName,
            connectedAt: Date.now()
        });

        this.rooms.set(roomId, room);
        ws.roomId = roomId;

        console.log(`🎮 Создана комната ${roomId}`);

        ws.send(JSON.stringify({
            type: 'ROOM_CREATED',
            roomId: roomId,
            playerNumber: 1,
            playerId: playerId,
            playerName: playerName || this.playerStats.get(playerId).playerName
        }));
    }

    joinRoom(ws, roomId, playerName) {
        const playerId = ws.playerId;

        if (!roomId || roomId.length !== 4) {
            this.sendError(ws, 'Неверный ID комнаты');
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

        if (Array.from(room.players.keys())[0] === playerId) {
            this.sendError(ws, 'Вы уже в этой комнате');
            return;
        }

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
            ships: [],
            playerName: actualPlayerName,
            connectedAt: Date.now()
        });

        ws.roomId = roomId;
        room.lastActivity = Date.now();

        console.log(`👥 Игрок ${playerId} присоединился к комнате ${roomId}`);

        ws.send(JSON.stringify({
            type: 'ROOM_JOINED',
            roomId: roomId,
            playerNumber: playerNumber,
            playerId: playerId,
            playerName: actualPlayerName
        }));

        const firstPlayer = Array.from(room.players.values())[0];
        if (firstPlayer.ws.readyState === WebSocket.OPEN) {
            firstPlayer.ws.send(JSON.stringify({
                type: 'PLAYER_CONNECTED',
                playerNumber: playerNumber,
                playerName: actualPlayerName,
                playerId: playerId
            }));
        }

        this.sendRoomInfo(room);

        if (room.players.size === 2) {
            this.startGame(room);
        }
    }

    startGame(room) {
        console.log(`🎲 Начинаем игру в комнате ${room.id}`);
        room.gameState = 'placing';

        const players = Array.from(room.players.values());
        room.currentTurn = players[Math.floor(Math.random() * players.length)].id;

        room.players.forEach((player, playerId) => {
            if (player.ws.readyState === WebSocket.OPEN) {
                player.ws.send(JSON.stringify({
                    type: 'GAME_START',
                    yourTurn: room.currentTurn === playerId,
                    roomId: room.id,
                    opponentName: this.getOpponent(room, playerId)?.playerName || 'Противник'
                }));
            }
        });
    }

    handlePlayerReady(ws) {
        const room = this.getPlayerRoom(ws.playerId);
        if (!room) return;

        const player = room.players.get(ws.playerId);
        if (!player) return;

        player.ready = true;
        room.readyPlayers.add(ws.playerId);
        room.lastActivity = Date.now();

        console.log(`✅ Игрок ${ws.playerId} готов`);

        this.sendRoomInfo(room);

        if (room.players.size === 1) {
            ws.send(JSON.stringify({
                type: 'PLAYER_READY_ACK',
                message: 'Ожидаем второго игрока...'
            }));
            return;
        }

        if (room.readyPlayers.size === 2 && room.gameState === 'waiting') {
            console.log(`🎯 Все игроки готовы`);
            this.startGame(room);
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

        console.log(`🚢 Игрок ${ws.playerId} расставил корабли`);

        this.checkAllShipsPlaced(room);
    }

    checkAllShipsPlaced(room) {
        if (room.shipsPlaced.size === 2 && room.gameState === 'placing') {
            room.gameState = 'playing';
            console.log(`⚔️ Все корабли расставлены, начинаем битву!`);

            room.players.forEach((player, playerId) => {
                if (player.ws.readyState === WebSocket.OPEN) {
                    player.ws.send(JSON.stringify({
                        type: 'PLAYER_TURN',
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

        for (const ship of opponent.ships) {
            for (const coord of ship.coordinates) {
                if (coord.x === x && coord.y === y) {
                    hit = true;
                    shipType = ship.type;

                    if (!ship.hits) ship.hits = [];
                    if (!ship.hits.includes(`${x},${y}`)) {
                        ship.hits.push(`${x},${y}`);
                    }

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

        room.currentTurn = opponentId;
        room.lastActivity = Date.now();

        console.log(`🎯 Выстрел в (${x},${y}): ${hit ? 'ПОПАДАНИЕ' : 'ПРОМАХ'}`);

        room.players.forEach((player, playerId) => {
            if (player.ws.readyState === WebSocket.OPEN) {
                player.ws.send(JSON.stringify({
                    type: 'SHOT_RESULT',
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

        if (hit) {
            this.checkGameOver(room, opponent);
        }
    }

    handleSuperWeapon(ws) {
        const room = this.getPlayerRoom(ws.playerId);
        if (!room) return;

        const playerStats = this.playerStats.get(ws.playerId);

        if (!playerStats.superWeapon) {
            this.sendError(ws, 'Нужно 10 побед для супер-оружия');
            return;
        }

        playerStats.superWeapon = false;
        this.playerStats.set(ws.playerId, playerStats);

        const opponentId = this.getOpponentId(room, ws.playerId);
        const opponent = room.players.get(opponentId);

        console.log(`💣 Ядерная бомба использована в комнате ${room.id}!`);

        if (opponent.ships) {
            opponent.ships.forEach(ship => {
                ship.sunk = true;
                ship.hits = ship.coordinates.map(c => `${c.x},${c.y}`);
            });
        }

        this.endGame(room, ws.playerId, 'nuclear');
    }

    checkGameOver(room, opponent) {
        if (!opponent.ships) return;

        const allSunk = opponent.ships.every(ship => ship.sunk);

        if (allSunk) {
            const winnerId = this.getOpponentId(room, opponent.id);
            console.log(`🏆 Победитель: ${winnerId}`);
            this.endGame(room, winnerId, 'all_ships_sunk');
        }
    }

    endGame(room, winnerId, reason) {
        room.gameState = 'finished';
        room.lastActivity = Date.now();

        room.players.forEach((player, playerId) => {
            const stats = this.playerStats.get(playerId);
            if (!stats) return;

            stats.totalGames++;

            if (playerId === winnerId) {
                stats.wins++;

                if (stats.wins >= 10 && !stats.superWeapon) {
                    stats.superWeapon = true;
                    console.log(`🎉 Игрок ${playerId} разблокировал ЯДЕРНУЮ БОМБУ!`);
                }
            } else {
                stats.losses++;
            }

            this.playerStats.set(playerId, stats);
        });

        console.log(`🏁 Конец игры. Причина: ${reason}`);

        room.players.forEach((player, playerId) => {
            if (player.ws.readyState === WebSocket.OPEN) {
                player.ws.send(JSON.stringify({
                    type: 'GAME_OVER',
                    winnerId: winnerId,
                    winnerName: room.players.get(winnerId)?.playerName || 'Победитель',
                    reason: reason,
                    stats: this.playerStats.get(playerId),
                    message: playerId === winnerId ? 'Вы победили!' : 'Вы проиграли!'
                }));
            }
        });

        setTimeout(() => {
            if (this.rooms.has(room.id)) {
                console.log(`🧹 Очистка комнаты ${room.id}`);
                this.rooms.delete(room.id);
            }
        }, 60000);
    }

    handlePlayerInfo(ws, message) {
        const playerId = ws.playerId;

        if (message.playerName) {
            const stats = this.playerStats.get(playerId);
            if (stats) {
                stats.playerName = message.playerName;
                this.playerStats.set(playerId, stats);
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

        console.log(`🚪 Игрок ${playerId} покинул комнату`);

        room.players.forEach((player, id) => {
            if (id !== playerId && player.ws.readyState === WebSocket.OPEN) {
                player.ws.send(JSON.stringify({
                    type: 'PLAYER_LEFT',
                    playerId: playerId,
                    message: 'Противник покинул комнату'
                }));
            }
        });

        room.players.delete(playerId);
        room.readyPlayers.delete(playerId);
        room.shipsPlaced.delete(playerId);
        ws.roomId = null;

        if (room.players.size === 0) {
            this.rooms.delete(room.id);
            console.log(`🧹 Комната ${room.id} удалена`);
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
            shipsPlaced: p.shipsPlaced
        }));

        room.players.forEach((player) => {
            if (player.ws.readyState === WebSocket.OPEN) {
                player.ws.send(JSON.stringify({
                    type: 'ROOM_INFO',
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
            console.log(`💥 Игрок ${playerId} отключился`);

            room.players.forEach((player, id) => {
                if (id !== playerId && player.ws.readyState === WebSocket.OPEN) {
                    player.ws.send(JSON.stringify({
                        type: 'ERROR',
                        message: 'Противник отключился'
                    }));
                }
            });

            room.players.delete(playerId);
            room.readyPlayers.delete(playerId);
            room.shipsPlaced.delete(playerId);

            if (room.players.size === 0) {
                this.rooms.delete(room.id);
                console.log(`🧹 Комната ${room.id} удалена`);
            }
        }
    }

    sendError(ws, message) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'ERROR',
                message: message,
                timestamp: Date.now()
            }));
        }
    }
}

const PORT = process.env.PORT || 10000;
const app = express();
const server = http.createServer(app);

app.use(express.static(path.join(__dirname)));
app.use(express.static(path.join(__dirname, 'public')));

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
            <head><title>Морской Бой</title><style>body{font-family:Arial;padding:40px;text-align:center;}</style></head>
            <body>
                <h1>🚢 Морской Бой</h1>
                <p>Сервер работает! Загрузите файлы игры.</p>
                <a href="/health">Health Check</a>
            </body>
            </html>
        `);
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/stats', (req, res) => {
    const stats = {};
    gameServer.playerStats.forEach((value, key) => {
        stats[key] = value;
    });
    res.json({ players: stats });
});

const wss = new WebSocket.Server({ server });
const gameServer = new GameServer();
gameServer.setupWebSocket(wss);

server.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║                🚀 МОРСКОЙ БОЙ СЕРВЕР                    ║
╠══════════════════════════════════════════════════════════╣
║ Порт: ${PORT}                                            ║
║ URL: http://localhost:${PORT}/                           ║
║ WebSocket: ws://localhost:${PORT}/                       ║
╚══════════════════════════════════════════════════════════╝
    `);
});

process.on('SIGTERM', () => {
    console.log('🛑 Закрываю сервер...');
    server.close(() => {
        console.log('✅ Сервер закрыт');
        process.exit(0);
    });
});
