const inventoryModel = require('../models/inventoryModel');
const inventoryController = require('./inventoryController');

const eventController = {
    // RabbitMQ에서 가입 이벤트 수신
  handleUserCreated: async (eventData) => {
    const { userId } = eventData;
    console.log(`[RabbitMQ 수신] 가입 이벤트 처리: ${userId}`);

    // 로직 재사용: { body: { userId } } 처럼 가짜 req 객체를 만들어서 넘겨줍니다.
    const mockReq = { headers: {}, body: { userId } };
    const mockRes = {
        status: (code) => ({ json: (data) => console.log(`[가입 결과] ${code}`, data) }),
        json: (data) => console.log(`[가입 결과]`, data)
    };

    await inventoryController.initializeInventory(mockReq, mockRes);
  },

  // RabbitMQ에서 탈퇴 이벤트 수신
  handleUserDeleted: async (eventData) => {
    const { userId } = eventData;
    console.log(`[RabbitMQ 수신] 탈퇴 이벤트 처리: ${userId}`);

    const mockReq = { headers: {}, body: { userId } };
    const mockRes = {
        status: (code) => ({ json: (data) => console.log(`[탈퇴 결과] ${code}`, data) }),
        json: (data) => console.log(`[탈퇴 결과]`, data)
    };

    await inventoryController.clearInventory(mockReq, mockRes);
  },
  // RabbitMQ에서 미션 완료 이벤트를 수신했을 때 실행되는 함수
  handleMissionCompleted: async (eventData) => {
    const { userId, missionExecutionId } = eventData;
    console.log(`[RabbitMQ 수신] MissionCompleted - 유저 ID: ${userId}, 수행 ID: ${missionExecutionId}`);

    try {
      console.log(`유저 ${userId}번 미션 완료 보상(비료) 지급 시작`);

      // 보상 비료 지급
      const rewardItemTypeId = 1; 
      const rewardQty = 1;        // 보상으로 줄 비료 개수 (1개)

      // 이미 아이템이 있다면 quantity + 1이 되고, 없다면 새로 INSERT 됩니다.
      await inventoryModel.upsertRewardItem(userId, rewardItemTypeId, rewardQty);
      
      console.log(`유저 ${userId}번에게 ${rewardItemTypeId}번 비료 아이템 지급 및 최종 정합성 맞춤 완료!`);
    } catch (err) {
      console.error(`유저 ${userId}번 미션 보상 지급 중 오류 발생:`, err.message);
    }
  },
};

module.exports = eventController;