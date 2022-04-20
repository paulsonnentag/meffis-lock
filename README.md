# meffi.s lock

## Installation

create `backend/config.mjs` file

```javascript
const config = {
  sessionSecret: "foobar",

  /* bluetoothImplementation = KEYBLE | MOCK | MOCK_FAULTY | MOCK_DISCONNECTED
  *
  *  KEYBLE (default): calls actual keyble api
  *  MOCK: open and close will always work
  *  MOCK_FAULTY: open and close will fail
  *  MOCK_DISCONNECTED: lock is always in disconnected state
  *
  * */
  bluetoothImplementation: 'MOCK',
  httpPort: 3000,
  keyble: {
    address: 'xxxxxxxxxx',
    key: 'xxxxxxxxxx'
  },
  slack: {
    disabled: false, // optional
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

Usernames with hashed passwords are stored in `backend/users.json`. You need to restart the server after you've added a new user.
