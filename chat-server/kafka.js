const { Kafka } = require('kafkajs')

const { KAFKA_USERNAME: username, KAFKA_PASSWORD: password } = process.env
const sasl = username && password ? { username, password, mechanism: 'plain' } : null
const ssl = !!sasl

// This creates a client instance that is configured to connect to the Kafka broker provided by
// the environment variable KAFKA_BOOTSTRAP_SERVER
console.log(`process.env.KAFKA_BOOTSTRAP_SERVER=${process.env.KAFKA_BOOTSTRAP_SERVER?.split(';')}`);
const brokers = process.env.KAFKA_BOOTSTRAP_SERVER?.split(';') || ['localhost:19092'];
const kafka = new Kafka({
  clientId: `kafka-chat-${process.pid}`,
  brokers,
  ssl,
  sasl,
  connectionTimeout: 100_000
})

const ROOMS_TOPIC = 'ROOMS'
const MESSAGES_TOPIC = 'MESSAGES'


module.exports = async function init() {
  let onChangeStatus = () => {}
  let onMessage = () => {}

  const producer = kafka.producer()
  await producer.connect()

  const consumer = kafka.consumer({groupId: `${process.pid}` })

  await consumer.connect()
  await consumer.subscribe({ topic: ROOMS_TOPIC, fromBeginning: true })
  await consumer.subscribe({ topic: MESSAGES_TOPIC, fromBeginning: true })

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      let key =  message.key.toString()
      let value = message.value.toString()

      console.log('eachMessage', { key, value, topic })

      if (topic == ROOMS_TOPIC) {
        let [nick, room] = key.split('-')
        let {id, status} = JSON.parse(value)
        onChangeStatus(id, nick, room, status)

      } else if (topic == MESSAGES_TOPIC) {
        let {nick, message} = JSON.parse(value)
        onMessage(nick, key, message)
      }
    },
  })
  console.log("kafka runnint")

  return {

  async login(id, nick, room) {
    await producer.send({
      topic: ROOMS_TOPIC,
      messages: [{
        key: `${nick}-${room}`,
        value: JSON.stringify({ id, status: 'LOGIN' })
      }]
    })
  },
  async logout(id, nick, room) {
    await producer.send({
      topic: ROOMS_TOPIC,
      messages: [{
        key: `${nick}-${room}`,
        value: JSON.stringify({ id, status: 'LOGOUT' })
      }]
    })
  },
  subscribeChangeStatus(_onChangeStatus) {
    onChangeStatus = _onChangeStatus;
  },
  async sendMessage(nick, room, message) {
    await producer.send({
      topic: MESSAGES_TOPIC,
      messages: [{
        key: room,
        value: JSON.stringify({ nick, message })
      }]
    })
  },
  async subscribeMessages(_onMessage) {
    onMessage = _onMessage
  }

}
}