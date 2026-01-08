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
    PLAYER_READY: 'PLAYER_READY',
    UPDATE_STATS: 'UPDATE_STATS',
    PLAYER_LEFT: 'PLAYER_LEFT'
};

class GameServer {
    constructor() {
        this.rooms = new Map();
        this.playerStats = new Map();
        this.wss = null;
    }

    setupWebSocket(wss) {
        this.wss = wss;

        wss.on('connection', (ws, req) => {
            const playerId = uuidv4();
            console.log(`🔗 Новое подключение: ${playerId}`);

            ws.playerId = playerId;
            ws.roomId = null;

            if (!this.playerStats.has(playerId)) {
                this.playerStats.set(playerId, {
                    wins: 0,
                    losses: 0,
                    superWeapon: false,
                    totalGames: 0,
                    playerName: `Игрок_${Math.floor(Math.random() * 1000)}`
                });
            }

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
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
                console.error(`❌ WebSocket ошибка:`, error);
            });

            ws.send(JSON.stringify({
                type: 'CONNECTION_ESTABLISHED',
                playerId: playerId,
                stats: this.playerStats.get(playerId)
            }));
        });
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
            createdAt: Date.now()
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
            board: this.createEmptyBoard()
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
            this.sendError(ws, 'Неверный ID комнаты (4 цифры)');
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
            board: this.createEmptyBoard()
        });

        ws.roomId = roomId;

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

        const validatedShips = this.validateShips(ships);
        if (!validatedShips) {
            this.sendError(ws, 'Некорректная расстановка кораблей');
            return;
        }

        player.ships = validatedShips;
        player.shipsPlaced = true;
        room.shipsPlaced.add(ws.playerId);

        console.log(`🚢 Игрок ${ws.playerId} расставил ${player.ships.length} кораблей`);

        player.board = this.createEmptyBoard();
        player.ships.forEach(ship => {
            ship.coordinates.forEach(coord => {
                player.board[coord.y][coord.x] = ship.type;
            });
        });

        this.checkAllShipsPlaced(room);
    }

    validateShips(ships) {
        if (!Array.isArray(ships)) return null;
        
        const shipCounts = {
            'battleship': 1,
            'cruiser': 2,
            'destroyer': 3,
            'submarine': 4
        };

        const actualCounts = {};
        ships.forEach(ship => {
            actualCounts[ship.type] = (actualCounts[ship.type] || 0) + 1;
        });

        for (const [type, count] of Object.entries(shipCounts)) {
            if ((actualCounts[type] || 0) !== count) {
                console.log(`❌ Неправильное количество кораблей типа ${type}: ${actualCounts[type] || 0} вместо ${count}`);
                return null;
            }
        }

        if (ships.length !== 10) {
            console.log(`❌ Всего кораблей: ${ships.length} вместо 10`);
            return null;
        }

        return ships;
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

        if (attacker.shots) {
            const shotKey = `${x},${y}`;
            if (attacker.shots.has(shotKey)) {
                this.sendError(ws, 'Уже стреляли сюда');
                return;
            }
        } else {
            attacker.shots = new Set();
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
                        attacker.shots.add(`${x},${y}`);
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

        if (!hit) {
            attacker.shots.add(`${x},${y}`);
        }

        if (!sunk) {
            room.currentTurn = opponentId;
        }

        console.log(`🎯 ${attacker.playerName} выстрелил в (${x},${y}): ${hit ? 'ПОПАДАНИЕ' : 'ПРОМАХ'} ${sunk ? 'КОРАБЛЬ ПОТОПЛЕН' : ''}`);

        room.players.forEach((player, playerId) => {
            if (player.ws.readyState === WebSocket.OPEN) {
                const isAttacker = playerId === ws.playerId;
                player.ws.send(JSON.stringify({
                    type: 'SHOT_RESULT',
                    x: x,
                    y: y,
                    hit: hit,
                    sunk: sunk,
                    shipType: shipType,
                    playerId: ws.playerId,
                    yourTurn: room.currentTurn === playerId,
                    message: hit ? 
                        (sunk ? `Потоплен ${this.getShipName(shipType)}!` : 'Попадание!') : 
                        'Промах!',
                    isYourShot: isAttacker
                }));
            }
        });

        if (hit && sunk) {
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

        console.log(`💣 ${ws.playerId} использовал ЯДЕРНУЮ БОМБУ в комнате ${room.id}!`);

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

            if (player.ws.readyState === WebSocket.OPEN) {
                player.ws.send(JSON.stringify({
                    type: 'UPDATE_STATS',
                    stats: this.playerStats.get(playerId)
                }));
            }
        });

        console.log(`🏁 Конец игры в ${room.id}. Причина: ${reason}`);

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
        }, 30000);
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

    createEmptyBoard() {
        return Array(10).fill().map(() => Array(10).fill(0));
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
            <head>
                <title>Морской Бой</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        padding: 40px;
                        text-align: center;
                        background: linear-gradient(135deg, #0c2461, #1e3799);
                        color: white;
                        min-height: 100vh;
                    }
                    h1 {
                        color: #4a69bd;
                        font-size: 3em;
                        margin-bottom: 20px;
                    }
                    .container {
                        max-width: 600px;
                        margin: 0 auto;
                        padding: 30px;
                        background: rgba(255, 255, 255, 0.1);
                        border-radius: 15px;
                        backdrop-filter: blur(10px);
                    }
                    .btn {
                        display: inline-block;
                        padding: 15px 30px;
                        background: linear-gradient(135deg, #4a69bd, #6a89cc);
                        color: white;
                        text-decoration: none;
                        border-radius: 10px;
                        margin: 10px;
                        font-size: 1.1em;
                        border: none;
                        cursor: pointer;
                        transition: all 0.3s ease;
                    }
                    .btn:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🚢 Морской Бой</h1>
                    <p>Сервер запущен и работает!</p>
                    <p>Игра загружается...</p>
                    <div style="margin-top: 30px;">
                        <button class="btn" onclick="window.location.reload()">Обновить страницу</button>
                        <a href="/health" class="btn">Проверить Health</a>
                    </div>
                </div>
            </body>
            </html>
        `);
    }
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        server: 'Battleship Game Server',
        version: '1.0.0',
        uptime: process.uptime()
    });
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

server.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║                🚀 МОРСКОЙ БОЙ СЕРВЕР                    ║
╠══════════════════════════════════════════════════════════╣
║ Порт: ${PORT}                                            ║
║ URL: http://0.0.0.0:${PORT}/                            ║
║ WebSocket: ws://0.0.0.0:${PORT}/                        ║
║ Health: http://0.0.0.0:${PORT}/health                   ║
╚══════════════════════════════════════════════════════════╝
    `);
    console.log('✅ Сервер успешно запущен!');
    console.log('📋 Ожидание подключений игроков...');
});

// Убираем обработку SIGTERM, чтобы сервер не закрывался сразу
// process.on('SIGTERM', () => {
//     console.log('\n🛑 Получен SIGTERM, закрываю сервер...');
//     
//     wss.clients.forEach((client) => {
//         client.close();
//     });
//     
//     server.close(() => {
//         console.log('✅ Сервер корректно закрыт');
//         process.exit(0);
//     });
//     
//     setTimeout(() => {
//         console.log('⚠️ Принудительное завершение');
//         process.exit(1);
//     }, 5000);
// });

// Вместо этого добавляем обработку сигналов по-другому
process.on('SIGINT', () => {
    console.log('\n🛑 Получен SIGINT, закрываю сервер...');
    server.close(() => {
        console.log('✅ Сервер закрыт');
        process.exit(0);
    });
});

process.on('uncaughtException', (error) => {
    console.error('❌ Необработанное исключение:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Необработанный rejection:', reason);
});
