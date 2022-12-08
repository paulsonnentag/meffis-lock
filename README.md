# meffi.s lock

## Installation

create `backend/config.mjs` file

```javascript
const config = {
  sessionSecret: "foobar",

  /* bluetoothImplementation = HCI | SERIAL | WEBSOCKET | MOCK |
  *                              MOCK_FAULTY | MOCK_DISCONNECTED
  *
  *  HCI (default): use keyble library with local bluetooth adapter
  *  SERIAL: use esp32 bluetooth bridge connected to serial port
  *  WEBSOCKET: use esp8266 wifi bridge connected via websocket
  *  MOCK: open and close will always work
  *  MOCK_FAULTY: open and close will fail
  *  MOCK_DISCONNECTED: lock is always in disconnected state
  *
  * */
  bluetoothImplementation: 'HCI',
  httpPort: 3000,
  keyble: {
    address: 'xx:xx:xx:xx:xx:xx',
    user_key: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  },
  serial: {
    path : "/dev/ttyUSB0",
    baudRate : 115200,
    hasPrefix : true,
  },
  websocket: {
    port : 4000,
    secret : "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  },
  slack: {
    disabled: true, // optional
    token: `xoxb-xxxxxxxxxxx-xxxxxxxxxxx-xxxxxxxxxxx`,
    signingSecret: `xxxxxxxxxx`,
    targetChannelId: 'xxxxxxxxxx'
  }
}

export default config;
```

build frontend

```bash
cd frontend
npm install
npm run build
```

start backend

```bash
cd ../backend
npm install
npm start
```

## Development

run backend with

```bash
cd backend
npm run dev
```

run frontend build with

```bash
cd frontend
npm run start
```

Unfortunately sometimes the frontend build crashed and you need to restart it

## Adding user

run

```bash
node backend/src/add-user.mjs
```

or in backend directory

```bash
npm run add-user
```

Usernames with hashed passwords are stored in `backend/users.json`.
