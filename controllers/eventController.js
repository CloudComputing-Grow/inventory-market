const inventoryModel = require('../models/inventoryModel');
const promisePool = require('../db/db'); 
const eventController = {
  // 1. 미션 완료 이벤트 처리
  handleMissionCompleted: async (eventData) => {
    const { userId } = eventData;
    await inventoryModel.upsertRewardItem(userId, 1, 1);
    console.log(`[RabbitMQ] 유저 ${userId}번 비료 지급 완료`);
  },

  // 2. 가입 이벤트 처리 
  handleUserCreated: async (eventData) => {
    const { userId } = eventData;
    const basicFruits = [2, 4, 6, 8, 10, 12, 14, 16]; 
    const randomItemTypeId = basicFruits[Math.floor(Math.random() * basicFruits.length)];
    await inventoryModel.upsertRewardItem(userId, randomItemTypeId, 1);
    console.log(`[RabbitMQ] 유저 ${userId}번 가입 처리 완료`);
  },

  // 3. 탈퇴 이벤트 처리 
  handleUserDeleted: async (eventData) => {
    const { userId } = eventData;
    await promisePool.query('DELETE FROM inventory_item WHERE user_id = ?', [userId]);
    console.log(`[RabbitMQ] 유저 ${userId}번 탈퇴 데이터 삭제 완료`);
  }
};

module.exports = eventController;