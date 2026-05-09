# Testing Guide

## 1) Install and run

```bash
npm install
npm start
```

Server runs at `http://localhost:3000`.

---

## 2) Multiplayer movement test

1. Open two browser tabs at `http://localhost:3000`.
2. In each tab, move with **WASD** or **Arrow keys**.
3. Verify both cars move and update in real time.

Expected result:
- Local car is highlighted with white border.
- Remote car positions update smoothly.

---

## 3) Matchmaking + countdown socket test (browser console)

In each tab console:

```js
socket.emit('matchmaking:join', { roomId: 'room-1' })
```

In one tab:

```js
socket.emit('matchmaking:startCountdown', { roomId: 'room-1', seconds: 5 })
```

Optional listener:

```js
socket.on('room:state', console.log)
```

Expected result:
- `room:state` shows players in `room-1`.
- `countdownEndsAt` appears, then `raceStarted: true` after ~5 seconds.

---

## 4) API test examples (curl)

Create/fetch profile garage:

```bash
curl -s http://localhost:3000/api/garage/test-user | jq
```

Shop catalog:

```bash
curl -s http://localhost:3000/api/shop/catalog | jq
```

Buy a car with soft currency:

```bash
curl -s -X POST http://localhost:3000/api/shop/buy/car \
  -H 'Content-Type: application/json' \
  -d '{"profileId":"test-user","carId":"car_sprint","currency":"soft"}' | jq
```

Buy an upgrade:

```bash
curl -s -X POST http://localhost:3000/api/shop/buy/upgrade \
  -H 'Content-Type: application/json' \
  -d '{"profileId":"test-user","carId":"car_sprint","upgradeId":"upg_engine_1","currency":"soft"}' | jq
```

Select active car:

```bash
curl -s -X POST http://localhost:3000/api/garage/select-car \
  -H 'Content-Type: application/json' \
  -d '{"profileId":"test-user","carId":"car_sprint"}' | jq
```

Race reward (soft currency):

```bash
curl -s -X POST http://localhost:3000/api/race/reward \
  -H 'Content-Type: application/json' \
  -d '{"profileId":"test-user","placement":1}' | jq
```

Premium currency purchase:

```bash
curl -s -X POST http://localhost:3000/api/wallet/premium/purchase \
  -H 'Content-Type: application/json' \
  -d '{"profileId":"test-user","packageId":"starter_pack"}' | jq
```

---

## 5) Persistence verification

After running purchases/rewards, check:

- `data/game-db.json`

Expected result:
- Balances, owned cars, upgrades, and transactions are persisted.
