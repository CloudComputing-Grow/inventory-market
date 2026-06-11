require('dotenv').config();
const express = require('express');
const app = express();
const amqp = require('amqplib');
const inventoryRouter = require('./routes/inventory');
const marketRouter = require('./routes/market');
const internalRouter = require('./routes/internal');
const eventController = require('./controllers/eventController');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 라우터 설정
app.use('/api/v1/inventory', inventoryRouter);
app.use('/api/v1/market', marketRouter);
app.use('/api/internal/v1', internalRouter);

// 테스트용 라우트 (포스트맨 테스트용)
app.post('/test/event/signup', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: "userId가 누락되었습니다." });
    await eventController.handleUserCreated({ userId });
    return res.json({ success: true, message: `유저 ${userId}번 가입 이벤트 처리 성공!` });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/test/event/delete', async (req, res) => {
  try {
    const { userId } = req.body;
    await eventController.handleUserDeleted({ userId });
    return res.json({ success: true, message: `유저 ${userId}번 탈퇴 이벤트 처리 성공!` });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 서버 실행 및 RabbitMQ 연결
async function connectRabbitMQ() {
  try {
    const rabbitbaseUrl = process.env.RABBITMQ_URL || 'amqp://localhost';
    const conn = await amqp.connect(rabbitbaseUrl);
    const channel = await conn.createChannel();

    // 1. 유저 팀 (Topic)
    const userExchange = 'user.events';
    await channel.assertExchange(userExchange, 'topic', { durable: true });
    const userQ = await channel.assertQueue('inventory.user.events.queue', { durable: true });
    await channel.bindQueue(userQ.queue, userExchange, 'user.created');
    await channel.bindQueue(userQ.queue, userExchange, 'user.deleted');

    channel.consume(userQ.queue, (msg) => {
      if (msg) {
        const eventData = JSON.parse(msg.content.toString());
        const routingKey = msg.fields.routingKey;
        if (routingKey === 'user.created') eventController.handleUserCreated(eventData);
        else if (routingKey === 'user.deleted') eventController.handleUserDeleted(eventData);
        channel.ack(msg);
      }
    });

    // 2. 미션 팀 (Fanout)
    const missionExchange = 'grow.mission.fanout';
    await channel.assertExchange(missionExchange, 'fanout', { durable: true });
    const missionQ = await channel.assertQueue('inventory.mission.queue', { durable: true });
    await channel.bindQueue(missionQ.queue, missionExchange, '');

    channel.consume(missionQ.queue, (msg) => {
      if (msg) {
        const eventData = JSON.parse(msg.content.toString());
        eventController.handleMissionCompleted(eventData);
        channel.ack(msg);
      }
    });

    console.log("🐰 RabbitMQ [Topic & Fanout] 리스너 모두 가동 완료!");
  } catch (err) {
    console.error("RabbitMQ 연결 에러:", err);
  }
}

connectRabbitMQ();

const PORT = process.env.PORT || 3004;
app.listen(PORT, () => {
  console.log(`인벤토리-마켓 서버가 ${PORT}번 포트에서 가동 중입니다!`);
});