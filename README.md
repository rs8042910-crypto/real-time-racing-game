# real-time-racing-game

Real-time multiplayer car racing game using Node.js and Socket.IO.

## Implemented backend systems

- Multiplayer movement sync with server-authoritative updates
- Garage inventory persistence via local JSON database (`data/game-db.json`)
- Car shop API + upgrade purchase API
- Soft currency race rewards API
- Premium currency purchase flow API
- Matchmaking rooms with race countdown events over sockets

## Run locally

1. `npm install`
2. `npm start`
3. Open `http://localhost:3000`

## Socket events

- `matchmaking:join` `{ roomId }`
- `matchmaking:startCountdown` `{ roomId, seconds }`
- `room:state` (broadcast with room players + countdown + started flag)

## REST APIs

- `GET /api/shop/catalog`
- `GET /api/garage/:profileId`
- `POST /api/shop/buy/car` `{ profileId, carId, currency }`
- `POST /api/shop/buy/upgrade` `{ profileId, carId, upgradeId, currency }`
- `POST /api/garage/select-car` `{ profileId, carId }`
- `POST /api/race/reward` `{ profileId, placement }`
- `POST /api/wallet/premium/purchase` `{ profileId, packageId }`

## Notes

- Garage, balances, and transaction history are persisted in `data/game-db.json`.
- Purchase and garage operations are validated server-side.
- Player car stats are recalculated from active car + owned upgrades.


## Testing

See `TESTING.md` for manual multiplayer, matchmaking, and API test steps.


## Playable demo UI

The web client now includes garage/shop action buttons so you can buy cars, buy upgrades, claim race rewards, buy premium currency, and trigger matchmaking countdown directly in the browser.
