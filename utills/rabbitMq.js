const amqp = require('amqplib');
const eventController = require('./controllers/eventController');

async function connectRabbitMQ() {
  try {
    const conn = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost');
    const channel = await conn.createChannel();

    // 1. [유저 팀] Topic 방식 (가입/탈퇴)
    const userExchange = 'user.events';
    await channel.assertExchange(userExchange, 'topic', { durable: true });
    const userQ = await channel.assertQueue('inventory.user.events.queue', { durable: true });
    await channel.bindQueue(userQ.queue, userExchange, 'user.created');
    await channel.bindQueue(userQ.queue, userExchange, 'user.deleted');

    channel.consume(userQ.queue, (msg) => {
      const eventData = JSON.parse(msg.content.toString());
      const routingKey = msg.fields.routingKey;

      if (routingKey === 'user.created') eventController.handleUserCreated(eventData);
      else if (routingKey === 'user.deleted') eventController.handleUserDeleted(eventData);

      channel.ack(msg);
    });

    // 2. [미션 팀] Fanout 방식 (비료 보상)
    const missionExchange = 'grow.mission.fanout';
    await channel.assertExchange(missionExchange, 'fanout', { durable: true });
    const missionQ = await channel.assertQueue('inventory.mission.queue', { durable: true });
    await channel.bindQueue(missionQ.queue, missionExchange, '');

    channel.consume(missionQ.queue, (msg) => {
      const eventData = JSON.parse(msg.content.toString());
      eventController.handleMissionCompleted(eventData);
      channel.ack(msg);
    });

    console.log(" [x] RabbitMQ 이벤트 수신 모드 가동 완료!");
  } catch (err) {
    console.error("RabbitMQ 연결 에러:", err);
  }
}

// 서버 시작 시 연결
connectRabbitMQ();