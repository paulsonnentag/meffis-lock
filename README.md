# meffi.s lock

## Installation

create backend/config.mjs file

```
const config = {
  sessionSecret: "foobar" // secret that will be used for the cookie session
}

export default config;
```

build frontend

```
cd frontend
npm install
npm run build
```

start backend

```
cd backend
npm install
npm start
```

## Development

run backend with

```
cd backend
npm run dev
```

run frontend build with

```
cd frontend
npm run start
```

Unfortunately sometimes the frontend build crashed and you need to restart it

## Adding user

run

```
node backend/src/add-user.mjs
```

or in backend directory

```
npm run add-user
```

Usernames with hashed passwords are stored in `backend/users.json`