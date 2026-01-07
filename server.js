// server.js - Полностью исправленная версия для Render.com
const WebSocket = require('ws');
const http = require('http');
const url = require('url');
const path = require('path');
const fs = require('fs');

// Создаем HTTP сервер, который отдает файлы
const server = http.createServer((req, res) => {
    // Логируем запрос для отладки
    console.log(`HTTP запрос: ${req.url}`);
    
    // Определяем путь к файлу
    let filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './index.html';
    }
    
    // Получаем расширение файла для правильного Content-Type
    const extname = path.extname(filePath);
    let contentType = 'text/html';
    
    switch (extname) {
        case '.js':
            contentType = 'application/javascript';
            break;
        case '.css':
            contentType = 'text/css';
            break;
        case '.json':
            contentType = 'application/json';
            break;
        case '.png':
            contentType = 'image/png';
            break;
        case '.jpg':
            contentType = 'image/jpg';
            break;
        case '.ico':
            contentType = 'image/x-icon';
            break;
    }
    
    // Читаем файл
    fs.readFile(path.join(__dirname, filePath), (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                // Файл не найден
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('404: Страница не найдена', 'utf-8');
            } else {
                // Другая ошибка сервера
                res.writeHead(500);
                res.end(`Ошибка сервера: ${error.code}`, 'utf-8');
            }
        } else {
            // Успешно - отдаем файл
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

// Создаем WebSocket сервер на том же HTTP сервере
const wss = new WebSocket.Server({ server });

// Хранилище игровых комнат
const rooms = new Map();
// Хранилище соединений игроков
const connections = new Map();

// Типы сообщений для клиента
const MESSAGE_TYPES = {
    ROOM_CREATED: 'ROOM_CREATED',
    ROOM_JOINED: 'ROOM_JOINED',
    PLAYER_READY: 'PLAYER_READY',
    GAME_START: 'GAME_START',
    PLAYER_TURN: 'PLAYER_TURN',
    SHOT_RESULT: 'SHOT_RESULT',
    GAME_OVER: 'GAME_OVER',
    CHAT_MESSAGE: 'CHAT_MESSAGE',
    PLAYER_DISCONNECTED: 'PLAYER_DISCONNECTED',
    SPECIAL_WEAPON_USED: 'SPECIAL_WEAPON_USED',
    SHIPS_PLACED: 'SHIPS_PLACED',
    ERROR: 'ERROR',
    PLAYER_CONNECTED: 'PLAYER_CONNECTED',
    PLAYER_INFO: 'PLAYER_INFO'
};

// Конфигурация кораблей
const SHIP_CONFIG = [
    { size: 4, count: 1 }, // 1 четырехпалубный
    { size: 3, count: 2 }, // 2 трехпалубных
    { size: 2, count: 3 }, // 3 двухпалубных
    { size: 1, count: 4 }  // 4 однопалубных
];

wss.on('connection', (ws, req) => {
    console.log(`Новое WebSocket подключение: ${req.url}`);
    
    // Парсим URL для получения параметра room
    const parsedUrl = url.parse(req.url, true);
    const query = parsedUrl.query;
    let roomId = query.room;
    
    // Если room не указан - создаем новую комнату
    if (!roomId) {
        roomId = generateRoomId();
        console.log(`Создана новая комната: ${roomId}`);
    } else {
        roomId = roomId.toUpperCase();
        console.log(`Попытка подключения к комнате: ${roomId}`);
    }
    
    const playerId = generatePlayerId();
    
    // Сохраняем связь игрока с комнатой
    connections.set(ws, { playerId, roomId });
    
    // Получаем или создаем комнату
    let room = rooms.get(roomId);
    if (!room) {
        room = {
            id: roomId,
            players: new Map(),
            gameState: 'waiting', // waiting, placing, playing, finished
            currentTurn: null,
            boards: new Map(),
            shots: new Map(),
            specialWeapons: new Map(),
            hostId: playerId  // Первый игрок становится хостом
        };
        rooms.set(roomId, room);
        console.log(`Создана новая комната ${roomId}, хост: ${playerId}`);
    }
    
    // Проверяем, можно ли присоединиться к комнате
    if (room.players.size >= 2) {
        ws.send(JSON.stringify({
            type: MESSAGE_TYPES.ERROR,
            message: 'Комната заполнена'
        }));
        console.log(`Комната ${roomId} заполнена, отказ для игрока ${playerId}`);
        ws.close();
        return;
    }
    
    // Определяем номер игрока (1 или 2)
    const playerNumber = room.players.size + 1;
    const isHost = playerId === room.hostId;
    
    const player = {
        id: playerId,
        number: playerNumber,
        ws: ws,
        ready: false,
        shipsPlaced: false,
        ships: [],
        specialWeapons: {
            bomb: 2,    // 2 бомбы на игру
            radar: 1    // 1 радар на игру
        },
        isHost: isHost
    };
    
    room.players.set(playerId, player);
    room.boards.set(playerId, createEmptyBoard());
    room.shots.set(playerId, createEmptyBoard());
    room.specialWeapons.set(playerId, { ...player.specialWeapons });
    
    console.log(`Игрок ${playerId} добавлен в комнату ${roomId} как игрок ${playerNumber} (хост: ${isHost})`);
    
    // Отправляем игроку информацию о комнате
    if (isHost) {
        // Для хоста - создание комнаты
        ws.send(JSON.stringify({
            type: MESSAGE_TYPES.ROOM_CREATED,
            roomId,
            playerId,
            playerNumber,
            shipConfig: SHIP_CONFIG,
            opponentConnected: false
        }));
    } else {
        // Для присоединяющегося игрока - подтверждение подключения
        ws.send(JSON.stringify({
            type: MESSAGE_TYPES.ROOM_JOINED,
            roomId,
            playerId,
            playerNumber,
            shipConfig: SHIP_CONFIG,
            opponentConnected: true
        }));
        
        // Уведомляем хоста о подключении второго игрока
        const host = room.players.get(room.hostId);
        if (host && host.ws.readyState === WebSocket.OPEN) {
            host.ws.send(JSON.stringify({
                type: MESSAGE_TYPES.PLAYER_CONNECTED,
                playerNumber: playerNumber
            }));
            
            // Уведомляем второго игрока о хосте
            ws.send(JSON.stringify({
                type: MESSAGE_TYPES.PLAYER_CONNECTED,
                playerNumber: 1
            }));
        }
    }
    
    // Если в комнате уже есть другой игрок, обновляем состояние
    if (room.players.size === 2) {
        room.gameState = 'placing';
        console.log(`В комнате ${roomId} теперь 2 игрока, начинаем расстановку`);
        
        // Назначаем случайного игрока для первого хода
        const firstPlayer = Array.from(room.players.values())[
            Math.floor(Math.random() * 2)
        ];
        room.currentTurn = firstPlayer.id;
        
        console.log(`Первый ход у игрока ${firstPlayer.number}`);
    }
    
    // Обработка сообщений от клиента
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            console.log(`Сообщение от игрока ${playerId}:`, message.type);
            handleClientMessage(room, playerId, message);
        } catch (error) {
            console.error('Ошибка обработки сообщения:', error);
        }
    });
    
    // Обработка отключения игрока
    ws.on('close', () => {
        console.log(`Игрок ${playerId} отключился от комнаты ${roomId}`);
        
        const connectionInfo = connections.get(ws);
        if (connectionInfo) {
            const { roomId, playerId } = connectionInfo;
            const room = rooms.get(roomId);
            
            if (room) {
                // Уведомляем оппонента об отключении
                room.players.forEach((p, id) => {
                    if (id !== playerId && p.ws.readyState === WebSocket.OPEN) {
                        p.ws.send(JSON.stringify({
                            type: MESSAGE_TYPES.PLAYER_DISCONNECTED,
                            playerNumber: room.players.get(playerId)?.number
                        }));
                    }
                });
                
                // Удаляем игрока из комнаты
                room.players.delete(playerId);
                room.boards.delete(playerId);
                room.shots.delete(playerId);
                room.specialWeapons.delete(playerId);
                
                // Если комната пуста, удаляем её
                if (room.players.size === 0) {
                    rooms.delete(roomId);
                    console.log(`Комната ${roomId} удалена (нет игроков)`);
                }
            }
        }
        
        connections.delete(ws);
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket ошибка:', error);
    });
});

function handleClientMessage(room, playerId, message) {
    const player = room.players.get(playerId);
    if (!player) return;
    
    switch (message.type) {
        case 'PLAYER_INFO':
            // Игрок отправляет информацию о себе
            console.log(`Игрок ${playerId} (${player.number}) отправил информацию`);
            
            // Если в комнате уже есть 2 игрока, начинаем игру
            if (room.players.size === 2 && room.gameState === 'waiting') {
                room.gameState = 'placing';
                
                // Уведомляем обоих игроков о начале игры
                room.players.forEach((p, id) => {
                    p.ws.send(JSON.stringify({
                        type: MESSAGE_TYPES.GAME_START,
                        yourTurn: room.currentTurn === id
                    }));
                });
                
                console.log(`Игра начинается в комнате ${room.id}`);
            }
            break;
            
        case 'PLAYER_READY':
            // Игрок готов начать игру
            player.ready = true;
            console.log(`Игрок ${playerId} (${player.number}) готов`);
            
            // Проверяем, все ли игроки готовы
            const allReady = Array.from(room.players.values())
                .every(p => p.ready);
            
            if (allReady && room.players.size === 2) {
                // Начинаем расстановку кораблей
                room.gameState = 'placing';
                
                room.players.forEach((p, id) => {
                    p.ws.send(JSON.stringify({
                        type: MESSAGE_TYPES.GAME_START,
                        yourTurn: room.currentTurn === id
                    }));
                });
                
                console.log(`Все игроки готовы, начинаем расстановку в комнате ${room.id}`);
            }
            break;
            
        case 'SHIPS_PLACED':
            player.ships = message.ships;
            player.shipsPlaced = true;
            console.log(`Игрок ${playerId} (${player.number}) расставил корабли`);
            
            // Проверяем, все ли игроки расставили корабли
            const allShipsPlaced = Array.from(room.players.values())
                .every(p => p.shipsPlaced);
            
            if (allShipsPlaced && room.gameState === 'placing') {
                room.gameState = 'playing';
                console.log(`Все корабли расставлены, начинаем битву в комнате ${room.id}`);
                
                // Уведомляем о начале боя
                room.players.forEach((p, id) => {
                    p.ws.send(JSON.stringify({
                        type: MESSAGE_TYPES.PLAYER_TURN,
                        yourTurn: room.currentTurn === id
                    }));
                });
            }
            break;
            
        case 'SHOT':
            if (room.gameState !== 'playing' || room.currentTurn !== playerId) {
                console.log(`Неверный ход от игрока ${playerId}, сейчас ход игрока ${room.currentTurn}`);
                return;
            }
            
            const { x, y, weapon } = message;
            console.log(`Игрок ${playerId} стреляет в (${x}, ${y}) оружием: ${weapon || 'обычный'}`);
            
            const opponentId = Array.from(room.players.keys())
                .find(id => id !== playerId);
            
            if (!opponentId) {
                console.error('Не найден оппонент');
                return;
            }
            
            const opponent = room.players.get(opponentId);
            const opponentBoard = room.boards.get(opponentId);
            const playerShots = room.shots.get(playerId);
            
            // Обработка специального оружия
            if (weapon === 'bomb' && player.specialWeapons.bomb > 0) {
                // Бомба бьет по площади 3x3
                const hits = [];
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        const tx = x + dx;
                        const ty = y + dy;
                        if (tx >= 0 && tx < 10 && ty >= 0 && ty < 10) {
                            const hit = processShot(
                                opponentBoard, 
                                playerShots, 
                                opponent.ships, 
                                tx, ty
                            );
                            hits.push({ x: tx, y: ty, ...hit });
                        }
                    }
                }
                player.specialWeapons.bomb--;
                
                room.players.forEach((p, id) => {
                    p.ws.send(JSON.stringify({
                        type: MESSAGE_TYPES.SPECIAL_WEAPON_USED,
                        playerNumber: player.number,
                        weapon: 'bomb',
                        hits,
                        remaining: player.specialWeapons
                    }));
                });
                
                console.log(`Игрок ${player.number} использовал бомбу, осталось: ${player.specialWeapons.bomb}`);
                
            } else if (weapon === 'radar' && player.specialWeapons.radar > 0) {
                // Радар показывает наличие кораблей в области 3x3 без атаки
                const radarResults = [];
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        const tx = x + dx;
                        const ty = y + dy;
                        if (tx >= 0 && tx < 10 && ty >= 0 && ty < 10) {
                            const hasShip = opponent.ships.some(ship =>
                                ship.cells.some(cell =>
                                    cell.x === tx && cell.y === ty
                                )
                            );
                            radarResults.push({ x: tx, y: ty, hasShip });
                        }
                    }
                }
                player.specialWeapons.radar--;
                
                room.players.forEach((p, id) => {
                    p.ws.send(JSON.stringify({
                        type: MESSAGE_TYPES.SPECIAL_WEAPON_USED,
                        playerNumber: player.number,
                        weapon: 'radar',
                        results: radarResults,
                        remaining: player.specialWeapons
                    }));
                });
                
                // После радара ход переходит оппоненту
                room.currentTurn = opponentId;
                console.log(`Игрок ${player.number} использовал радар, ход переходит игроку ${opponent.number}`);
                
            } else {
                // Обычный выстрел
                const result = processShot(
                    opponentBoard, 
                    playerShots, 
                    opponent.ships, 
                    x, y
                );
                
                console.log(`Результат выстрела: ${result.hit ? 'попадание' : 'промах'} ${result.sunk ? ', корабль потоплен' : ''}`);
                
                // Отправляем результат обоим игрокам
                room.players.forEach((p, id) => {
                    p.ws.send(JSON.stringify({
                        type: MESSAGE_TYPES.SHOT_RESULT,
                        playerNumber: player.number,
                        x, y,
                        hit: result.hit,
                        sunk: result.sunk,
                        shipCells: result.shipCells,
                        nextTurn: room.currentTurn === id
                    }));
                });
            }
            
            // Проверяем победу
            if (checkWinCondition(opponent.ships, playerShots)) {
                room.gameState = 'finished';
                console.log(`Игрок ${player.number} победил в комнате ${room.id}`);
                
                room.players.forEach((p, id) => {
                    p.ws.send(JSON.stringify({
                        type: MESSAGE_TYPES.GAME_OVER,
                        winner: player.number,
                        playerNumber: p.number,
                        shots: room.shots.get(id)
                    }));
                });
            } else if (!weapon || weapon === 'normal') {
                // Меняем ход (если это был не радар)
                room.currentTurn = opponentId;
                console.log(`Ход переходит игроку ${opponent.number}`);
                
                room.players.forEach((p, id) => {
                    p.ws.send(JSON.stringify({
                        type: MESSAGE_TYPES.PLAYER_TURN,
                        yourTurn: room.currentTurn === id
                    }));
                });
            }
            break;
            
        case 'CHAT':
            // Пересылаем сообщение чата оппоненту
            const opponentIdChat = Array.from(room.players.keys())
                .find(id => id !== playerId);
            
            if (opponentIdChat) {
                const opponent = room.players.get(opponentIdChat);
                opponent.ws.send(JSON.stringify({
                    type: MESSAGE_TYPES.CHAT_MESSAGE,
                    playerNumber: player.number,
                    message: message.message,
                    timestamp: new Date().toISOString()
                }));
                
                console.log(`Игрок ${player.number} отправил сообщение чата`);
            }
            break;
            
        case 'REMATCH_REQUEST':
            // Отправляем запрос на реванш оппоненту
            const opponentIdRematch = Array.from(room.players.keys())
                .find(id => id !== playerId);
            
            if (opponentIdRematch) {
                const opponent = room.players.get(opponentIdRematch);
                opponent.ws.send(JSON.stringify({
                    type: 'REMATCH_REQUEST',
                    playerNumber: player.number
                }));
                
                console.log(`Игрок ${player.number} запросил реванш`);
            }
            break;
            
        case 'REMATCH_ACCEPT':
            // Сбрасываем игру для реванша
            resetRoomForRematch(room);
            console.log(`Реванш принят в комнате ${room.id}`);
            break;
            
        default:
            console.log(`Неизвестный тип сообщения от игрока ${playerId}:`, message.type);
    }
}

function processShot(board, shots, ships, x, y) {
    const cell = board[y][x];
    let hit = false;
    let sunk = false;
    let shipCells = [];
    
    if (cell === 1) { // Корабль
        hit = true;
        shots[y][x] = 2; // Помечаем как попадание
        
        // Находим корабль, в который попали
        for (const ship of ships) {
            const hitCell = ship.cells.find(c => c.x === x && c.y === y);
            if (hitCell) {
                // Помечаем клетку как подбитую
                hitCell.hit = true;
                
                // Проверяем, потоплен ли корабль
                if (ship.cells.every(c => c.hit)) {
                    sunk = true;
                    shipCells = ship.cells;
                    
                    // Автоматически отмечаем клетки вокруг потопленного корабля
                    markAroundShip(shots, ship);
                }
                break;
            }
        }
    } else {
        shots[y][x] = 3; // Помечаем как промах
    }
    
    return { hit, sunk, shipCells };
}

function markAroundShip(shots, ship) {
    const marked = new Set();
    
    for (const cell of ship.cells) {
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const x = cell.x + dx;
                const y = cell.y + dy;
                
                if (x >= 0 && x < 10 && y >= 0 && y < 10) {
                    const key = `${x},${y}`;
                    if (!marked.has(key) && shots[y][x] === 0) {
                        shots[y][x] = 4; // Помечаем как проверенную пустую
                        marked.add(key);
                    }
                }
            }
        }
    }
}

function checkWinCondition(ships, shots) {
    // Все клетки всех кораблей должны быть подбиты
    return ships.every(ship =>
        ship.cells.every(cell => {
            const shot = shots[cell.y][cell.x];
            return shot === 2; // Помечено как попадание
        })
    );
}

function resetRoomForRematch(room) {
    room.gameState = 'placing';
    room.currentTurn = Array.from(room.players.values())[
        Math.floor(Math.random() * 2)
    ].id;
    
    // Сбрасываем состояние игроков
    room.players.forEach(player => {
        player.ready = false;
        player.ships = [];
        player.shipsPlaced = false;
        player.specialWeapons = {
            bomb: 2,
            radar: 1
        };
    });
    
    // Сбрасываем доски
    room.boards.clear();
    room.shots.clear();
    room.specialWeapons.clear();
    
    room.players.forEach((p, id) => {
        room.boards.set(id, createEmptyBoard());
        room.shots.set(id, createEmptyBoard());
        room.specialWeapons.set(id, { ...p.specialWeapons });
    });
    
    // Уведомляем игроков
    room.players.forEach((p, id) => {
        p.ws.send(JSON.stringify({
            type: MESSAGE_TYPES.GAME_START,
            yourTurn: room.currentTurn === id,
            rematch: true
        }));
    });
}

function createEmptyBoard() {
    return Array(10).fill().map(() => Array(10).fill(0));
}

function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function generatePlayerId() {
    return Math.random().toString(36).substring(2, 10);
}

// Запускаем сервер на порту, который предоставляет Render
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
    console.log(`✅ HTTP и WebSocket работают на одном порту`);
    console.log(`✅ Доступные файлы: index.html, style.css, game.js`);
    console.log(`✅ Готов к подключению игроков`);
});

// Экспортируем для тестирования
module.exports = { server, rooms, connections };
