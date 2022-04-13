const config = {
  sessionSecret: "foobar",

  /* bluetoothImplementation = KEYBLE | MOCK | MOCK_FAULTY | MOCK_DISCONNECTED
  *
  *  REAL (default): calls actual keyble api
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
