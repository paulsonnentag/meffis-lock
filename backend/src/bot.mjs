import Slack from '@slack/bolt'
import config from '../config.mjs'

const app = new Slack.App({
  token: config.slack.token,
  signingSecret: config.slack.signingSecret,
  logLevel: Slack.LogLevel.WARN
})

function getOpenMessage (owner) {
  return `🟢 Die Tür in Einheit 1 wurde geöffnet von ${owner}`
}

function getCloseMessage (owner) {
  return `🔴 Die Tür in Einheit 1 wurde geschlossen von ${owner}`
}

export function createBot () {
  return (
    config.slack.disabled
      ? new MockBot()
      : new SlackBot()
  )
}

class SlackBot {

  postOpen (owner) {
    app.client.chat.postMessage({
      channel: config.slack.targetChannelId,
      text: getOpenMessage(owner)
    })
  }

  postClose (owner) {
    app.client.chat.postMessage({
      channel: config.slack.targetChannelId,
      text: getCloseMessage(owner)
    })
  }
}

class MockBot {

  postOpen (owner) {
    console.log(getOpenMessage(owner))
  }

  postClose (owner) {
    console.log(getCloseMessage(owner))
  }
}