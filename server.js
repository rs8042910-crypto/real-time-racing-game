const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const TICK_RATE_MS = 50;
const TRACK_WIDTH = 900;
const TRACK_HEIGHT = 500;
const DB_FILE = path.join(__dirname, 'data', 'game-db.json');

const players = new Map();
const rooms = new Map();

const SHOP_CARS = [
  { id: 'car_starter', name: 'Starter', priceSoft: 0, pricePremium: 0, baseStats: { speed: 1, acceleration: 1, handling: 1 } },
  { id: 'car_sprint', name: 'Sprint GT', priceSoft: 500, pricePremium: 0, baseStats: { speed: 1.2, acceleration: 1.1, handling: 1 } },
  { id: 'car_nitro', name: 'Nitro X', priceSoft: 0, pricePremium: 15, baseStats: { speed: 1.4, acceleration: 1.3, handling: 0.9 } }
];

const SHOP_UPGRADES = [
  { id: 'upg_engine_1', stat: 'speed', value: 0.1, priceSoft: 250, pricePremium: 0 },
  { id: 'upg_accel_1', stat: 'acceleration', value: 0.1, priceSoft: 250, pricePremium: 0 },
  { id: 'upg_handling_1', stat: 'handling', value: 0.1, priceSoft: 250, pricePremium: 0 },
  { id: 'upg_pack_pro', stat: 'speed', value: 0.2, priceSoft: 0, pricePremium: 10 }
];

function ensureDbFile() {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: {} }, null, 2));
  }
}

function readDb() {
  ensureDbFile();
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function writeDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function getOrCreateUser(profileId) {
  const db = readDb();
  if (!db.users[profileId]) {
    db.users[profileId] = {
      profileId,
      balances: { softCurrency: 1000, premiumCurrency: 20 },
      garage: {
        activeCarId: 'car_starter',
        ownedCars: ['car_starter'],
        upgradesByCar: { car_starter: [] }
      },
      transactions: []
    };
    writeDb(db);
  }
  return db.users[profileId];
}

function updateUser(profileId, updater) {
  const db = readDb();
  const user = db.users[profileId] || getOrCreateUser(profileId);
  const nextUser = updater({ ...user, garage: { ...user.garage, upgradesByCar: { ...user.garage.upgradesByCar } } });
  db.users[profileId] = nextUser;
  writeDb(db);
  return nextUser;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function computeCarStats(user) {
  const carId = user.garage.activeCarId;
  const car = SHOP_CARS.find((c) => c.id === carId) || SHOP_CARS[0];
  const upgrades = user.garage.upgradesByCar[carId] || [];
  const stats = { ...car.baseStats };
  for (const upgId of upgrades) {
    const upg = SHOP_UPGRADES.find((u) => u.id === upgId);
    if (upg) stats[upg.stat] = (stats[upg.stat] || 1) + upg.value;
  }
  return stats;
}

function initialPlayerState(id, profileId) {
  const user = getOrCreateUser(profileId);
  return {
    id,
    profileId,
    roomId: null,
    x: 100 + Math.random() * 50,
    y: 100 + Math.random() * 50,
    vx: 0,
    vy: 0,
    color: `hsl(${Math.floor(Math.random() * 360)} 80% 55%)`,
    stats: computeCarStats(user),
    input: { up: false, down: false, left: false, right: false }
  };
}

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { id: roomId, players: new Set(), countdownEndsAt: null, raceStarted: false });
  }
  return rooms.get(roomId);
}

function broadcastRoomState(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  io.to(roomId).emit('room:state', {
    roomId,
    players: Array.from(room.players),
    countdownEndsAt: room.countdownEndsAt,
    raceStarted: room.raceStarted
  });
}

io.on('connection', (socket) => {
  const profileId = String(socket.handshake.query.profileId || socket.id);
  const player = initialPlayerState(socket.id, profileId);
  players.set(socket.id, player);

  socket.emit('bootstrap', {
    me: player,
    track: { width: TRACK_WIDTH, height: TRACK_HEIGHT },
    garage: getOrCreateUser(profileId).garage
  });

  socket.on('player:input', (input) => {
    const p = players.get(socket.id);
    if (!p) return;
    p.input = { up: !!input?.up, down: !!input?.down, left: !!input?.left, right: !!input?.right };
  });

  socket.on('matchmaking:join', ({ roomId }) => {
    const p = players.get(socket.id);
    if (!p || !roomId) return;

    if (p.roomId) {
      const oldRoom = rooms.get(p.roomId);
      if (oldRoom) oldRoom.players.delete(socket.id);
      socket.leave(p.roomId);
      broadcastRoomState(p.roomId);
    }

    p.roomId = roomId;
    const room = getRoom(roomId);
    room.players.add(socket.id);
    socket.join(roomId);
    broadcastRoomState(roomId);
  });

  socket.on('matchmaking:startCountdown', ({ roomId, seconds = 5 }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    room.countdownEndsAt = Date.now() + seconds * 1000;
    room.raceStarted = false;
    broadcastRoomState(roomId);

    setTimeout(() => {
      const currentRoom = rooms.get(roomId);
      if (!currentRoom || currentRoom.countdownEndsAt !== room.countdownEndsAt) return;
      currentRoom.raceStarted = true;
      broadcastRoomState(roomId);
    }, seconds * 1000);
  });

  socket.on('disconnect', () => {
    const p = players.get(socket.id);
    if (p?.roomId && rooms.has(p.roomId)) {
      rooms.get(p.roomId).players.delete(socket.id);
      broadcastRoomState(p.roomId);
    }
    players.delete(socket.id);
  });
});

setInterval(() => {
  for (const player of players.values()) {
    const accel = 0.5 * player.stats.acceleration;
    const maxSpeed = 6 * player.stats.speed;
    const friction = 0.88;
    if (player.input.up) player.vy -= accel;
    if (player.input.down) player.vy += accel;
    if (player.input.left) player.vx -= accel;
    if (player.input.right) player.vx += accel;
    player.vx *= friction;
    player.vy *= friction;
    player.vx = clamp(player.vx, -maxSpeed, maxSpeed);
    player.vy = clamp(player.vy, -maxSpeed, maxSpeed);
    player.x = clamp(player.x + player.vx, 0, TRACK_WIDTH);
    player.y = clamp(player.y + player.vy, 0, TRACK_HEIGHT);
  }
  io.emit('state', { players: Array.from(players.values()).map(({ input, ...rest }) => rest) });
}, TICK_RATE_MS);

app.use(express.json());
app.use(express.static('public'));

app.get('/health', (_req, res) => res.json({ ok: true, players: players.size }));
app.get('/api/shop/catalog', (_req, res) => res.json({ cars: SHOP_CARS, upgrades: SHOP_UPGRADES }));
app.get('/api/garage/:profileId', (req, res) => res.json(getOrCreateUser(req.params.profileId)));

app.post('/api/shop/buy/car', (req, res) => {
  const { profileId, carId, currency = 'soft' } = req.body;
  const car = SHOP_CARS.find((c) => c.id === carId);
  if (!car) return res.status(404).json({ error: 'car_not_found' });

  const user = updateUser(profileId, (u) => {
    const price = currency === 'premium' ? car.pricePremium : car.priceSoft;
    const key = currency === 'premium' ? 'premiumCurrency' : 'softCurrency';
    if (price <= 0 && !(currency === 'soft' && car.priceSoft === 0) && !(currency === 'premium' && car.pricePremium === 0)) {
      throw new Error('invalid_currency_for_item');
    }
    if (u.balances[key] < price) throw new Error('insufficient_funds');
    if (!u.garage.ownedCars.includes(carId)) u.garage.ownedCars.push(carId);
    u.balances[key] -= price;
    u.garage.upgradesByCar[carId] = u.garage.upgradesByCar[carId] || [];
    u.transactions.push({ type: 'buy_car', carId, currency, price, at: Date.now() });
    return u;
  });
  res.json(user);
});

app.post('/api/shop/buy/upgrade', (req, res) => {
  const { profileId, carId, upgradeId, currency = 'soft' } = req.body;
  const upg = SHOP_UPGRADES.find((u) => u.id === upgradeId);
  if (!upg) return res.status(404).json({ error: 'upgrade_not_found' });

  try {
    const user = updateUser(profileId, (u) => {
      if (!u.garage.ownedCars.includes(carId)) throw new Error('car_not_owned');
      const price = currency === 'premium' ? upg.pricePremium : upg.priceSoft;
      const key = currency === 'premium' ? 'premiumCurrency' : 'softCurrency';
      if (price <= 0 && !(currency === 'soft' && upg.priceSoft === 0) && !(currency === 'premium' && upg.pricePremium === 0)) {
        throw new Error('invalid_currency_for_item');
      }
      if (u.balances[key] < price) throw new Error('insufficient_funds');
      u.balances[key] -= price;
      u.garage.upgradesByCar[carId] = u.garage.upgradesByCar[carId] || [];
      u.garage.upgradesByCar[carId].push(upgradeId);
      u.transactions.push({ type: 'buy_upgrade', carId, upgradeId, currency, price, at: Date.now() });
      return u;
    });
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/garage/select-car', (req, res) => {
  const { profileId, carId } = req.body;
  try {
    const user = updateUser(profileId, (u) => {
      if (!u.garage.ownedCars.includes(carId)) throw new Error('car_not_owned');
      u.garage.activeCarId = carId;
      u.transactions.push({ type: 'select_car', carId, at: Date.now() });
      return u;
    });
    for (const p of players.values()) {
      if (p.profileId === profileId) p.stats = computeCarStats(user);
    }
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/race/reward', (req, res) => {
  const { profileId, placement = 4 } = req.body;
  const rewardTable = { 1: 200, 2: 140, 3: 100, 4: 70 };
  const softReward = rewardTable[placement] || 50;
  const user = updateUser(profileId, (u) => {
    u.balances.softCurrency += softReward;
    u.transactions.push({ type: 'race_reward', placement, softReward, at: Date.now() });
    return u;
  });
  res.json({ profileId, softReward, balances: user.balances });
});

app.post('/api/wallet/premium/purchase', (req, res) => {
  const { profileId, packageId = 'starter_pack' } = req.body;
  const packages = { starter_pack: 10, racer_pack: 25, elite_pack: 60 };
  const premiumAmount = packages[packageId];
  if (!premiumAmount) return res.status(400).json({ error: 'invalid_package' });

  const user = updateUser(profileId, (u) => {
    u.balances.premiumCurrency += premiumAmount;
    u.transactions.push({ type: 'premium_purchase', packageId, premiumAmount, at: Date.now() });
    return u;
  });
  res.json({ profileId, premiumAmount, balances: user.balances });
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
