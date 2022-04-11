const config = {
  sessionSecret: 'foobar', // secret that will be used for the cookie session

  /* bluetoothImplementation = REAL | MOCK | MOCK_FAULTY
  *
  *  KEYBLE (default): calls keyble api
  *  MOCK: open and close will always work
  *  MOCK_FAULTY: open and close will fail
  *
  * */
  bluetoothImplementation: 'KEYBLE',
  httpPort: 3000,
  keyble: {
    address: 'XXXX',
    key: 'XXXX'
  }
}

export default config;