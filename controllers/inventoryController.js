const inventoryModel = require('../models/inventoryModel');
const promisePool = require('../db/db');
const axios = require('axios');

const GROWTH_SERVER_URL = process.env.GROWTH_SERVER_URL || 'http://localhost:3001';
const MISSION_SERVER_URL = process.env.MISSION_SERVER_URL || 'http://localhost:3003';

const inventoryController = {
  getInventory: async (req, res) => {
    const userId = req.headers['x-user-id'];
    try {
      const [items] = await inventoryModel.getInventoryByUserId(userId);
      return res.json({
        success: true,
        data: { items }
      });
    } catch (error) {
      console.error('인벤토리 조회 오류:', error);
      return res.status(500).json({ success: false, error_code: "SERVER_ERROR" });
    }
  },

  consumeFertilizer: async (req, res) => {
    const userId = req.headers['x-user-id'];
    const { itemTypeId, growthStatusId } = req.body;

    if (Number(itemTypeId) !== 1) {
      return res.status(400).json({ 
        success: false, 
        error_code: "CANNOT_CONSUME_THIS_ITEM", 
        message: "비료만 사용할 수 있습니다." 
      });
    }

    try {
      const [[itemRow]] = await inventoryModel.getItemByUserIdAndType(userId, itemTypeId);

      if (!itemRow || itemRow.quantity < 1) {
        return res.status(400).json({ success: false, error_code: "ITEM_NOT_FOUND" });
      }

      await inventoryModel.deductItemQuantity(itemRow.item_id);

      try {
        await axios.post(`${GROWTH_SERVER_URL}/api/v1/growth-diary/growth-rate`, {
          growthStatusId: growthStatusId || 1,
          changedRate: 20,
          reason: "MISSION"
        });
      } catch (growthError) {
        console.error('Growth 서버 연동 실패:', growthError.message);
        await inventoryModel.recoverItemQuantity(itemRow.item_id);
        throw new Error('GROWTH_SERVER_ERROR');
      }

      try {
        await axios.post(`${MISSION_SERVER_URL}/api/internal/v1/missions/complete-by-fertilizer`, {
          userId
        });
      } catch (missionError) {
        console.error('Mission 서버 연동 실패 (무시):', missionError.message);
      }

      return res.json({
        success: true,
        data: {
          remaining_qty: itemRow.quantity - 1,
          growth_added: 20
        }
      });
    } catch (error) {
      console.error('비료 사용을 실패하였습니다:', error);
      if (error.message === 'GROWTH_SERVER_ERROR') {
        return res.status(500).json({ 
          success: false, 
          error_code: "GROWTH_LINK_FAILED", 
          message: "성장률 서버 통신 실패로 비료 사용이 취소되었습니다. (아이템 복구됨)" 
        });
      }
      return res.status(500).json({ success: false, error_code: "SERVER_ERROR" });
    }
  },

  consumeSeed: async (req, res) => {
    const userId = req.headers['x-user-id']; 
    const { itemTypeId } = req.body;

    if (Number(itemTypeId) === 1) {
      return res.status(400).json({ success: false, error_code: "CANNOT_PLANT_FERTILIZER", message: "비료는 심을 수 없습니다." });
    }

    try {
      const [[itemRow]] = await inventoryModel.getItemByUserIdAndType(userId, itemTypeId);

      if (!itemRow) {
        return res.status(400).json({ success: false, error_code: "FRUIT_NOT_FOUND", message: "심을 과일(씨앗)이 가방에 없습니다." });
      }

      if (itemRow.quantity <= 1) {
        await inventoryModel.deleteItem(itemRow.item_id); 
      } else {
        await inventoryModel.deductItemQuantity(itemRow.item_id);
      }

      return res.json({
        success: true,
        data: {
          remaining_qty: itemRow.quantity - 1
        }
      });
    } catch (error) {
      console.error('씨앗(과일) 심기 차감 오류:', error);
      return res.status(500).json({ success: false, error_code: "SERVER_ERROR" });
    }
  },

  reward: async (req, res) => {
    const userId = req.headers['x-user-id']; 
    const { itemTypeId, qty } = req.body;

    try {
      const [slotCount] = await inventoryModel.getSlotCountByUserId(userId);

      if (slotCount[0].count >= 20) {
        return res.status(400).json({ success: false, error_code: "INV_FULL" });
      }

      await inventoryModel.upsertRewardItem(userId, itemTypeId, qty);

      const [[updatedItem]] = await inventoryModel.getItemByUserIdAndType(userId, itemTypeId);

      return res.json({
        success: true,
        data: {
          slot_no: updatedItem.item_id,
          total_qty: updatedItem.quantity
        }
      });
    } catch (error) {
      console.error('보상 지급 오류:', error);
      return res.status(500).json({ success: false, error_code: "SERVER_ERROR" });
    }
  },

  marketDeduct: async (req, res) => {
    const userId = req.headers['x-user-id']; 
    const { itemTypeId, qty } = req.body;

    try {
      const [[itemRow]] = await inventoryModel.getItemByUserIdAndType(userId, itemTypeId);

      if (!itemRow || itemRow.quantity < qty) {
        return res.status(400).json({ success: false, error_code: "INSUFFICIENT_QTY", message: "마켓에 등록할 과일 수량이 부족합니다." });
      }

      await inventoryModel.deductMarketQty(qty, itemRow.item_id);

      return res.json({
        success: true,
        data: { remaining_qty: itemRow.quantity - qty }
      });
    } catch (error) {
      console.error('마켓 등록 차감 오류:', error);
      return res.status(500).json({ success: false, error_code: "SERVER_ERROR" });
    }
  },

  marketRecover: async (req, res) => {
    const userId = req.headers['x-user-id']; 
    const { itemTypeId, qty } = req.body; 

    try {
      const [slotCount] = await inventoryModel.getSlotCountByUserId(userId);
      const [[itemRow]] = await inventoryModel.getItemByUserIdAndType(userId, itemTypeId);

      if (!itemRow && slotCount[0].count >= 20) {
        return res.status(400).json({ success: false, error_code: "INV_FULL", message: "인벤토리가 가득 차서 회수할 수 없습니다." });
      }
      
      const currentQty = itemRow ? itemRow.quantity : 0;
      if (currentQty + qty > 30) {
        return res.status(400).json({ success: false, error_code: "LIMIT_EXCEEDED", message: "보관 최대 수량(30개)을 초과하여 회복할 수 없습니다." });
      }

      await inventoryModel.upsertRewardItem(userId, itemTypeId, qty);

      return res.json({ success: true, data: { message: "인벤토리 원복 완료" } });
    } catch (error) {
      console.error('마켓 취소 원복 오류:', error);
      return res.status(500).json({ success: false, error_code: "SERVER_ERROR" });
    }
  },
  
  initializeInventory: async (req, res) => {
    const userId = req.headers['x-user-id'] || req.body.userId;

    if (!userId) {
      return res.status(400).json({ success: false, error_code: "BAD_REQUEST", message: "userId가 식별되지 않았습니다." });
    }

    try {
      console.log(`[HTTP 내부 통신] 유저 ${userId}번 인벤토리 슬롯 생성 및 초기 씨앗 지급 프로세스 시작`);

      // 일반 과일 배열
      const basicFruits = [2, 4, 6, 8, 10, 12, 14, 16]; 
      const randomIndex = Math.floor(Math.random() * basicFruits.length);
      const randomItemTypeId = basicFruits[randomIndex]; 
      const initialQty = 1;

      await inventoryModel.upsertRewardItem(userId, randomItemTypeId, initialQty);

      return res.status(201).json({
        success: true,
        message: "유저 최초 가방 초기화 및 랜덤 씨앗 지급 완료",
        data: { userId, assignedItemType: randomItemTypeId, qty: initialQty }
      });
    } catch (error) {
      console.error('회원가입 인벤토리 연동 처리 실패:', error);
      return res.status(500).json({ success: false, error_code: "SERVER_ERROR" });
    }
  },
  // 내부 API: 랜덤 과일 조회 (다른 서비스에서 호출)
  getRandomFruit: async (req, res) => {
    const basicFruits = [2, 4, 6, 8, 10, 12, 14, 16];
    const randomItemTypeId = basicFruits[Math.floor(Math.random() * basicFruits.length)];
    return res.json({ success: true, data: { itemTypeId: randomItemTypeId } });
  },

  // 내부 API: 비료 회수 (미션 취소 등으로 인해 다른 서비스에서 호출)
  revokeFertilizer: async (req, res) => {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error_code: "BAD_REQUEST" });
    }

    try {
      const [[itemRow]] = await inventoryModel.getItemByUserIdAndType(userId, 1);

      if (!itemRow || itemRow.quantity < 1) {
        return res.status(400).json({ success: false, error_code: "ITEM_NOT_FOUND" });
      }

      await inventoryModel.deductItemQuantity(itemRow.item_id);

      return res.json({ success: true, data: { remaining_qty: itemRow.quantity - 1 } });
    } catch (error) {
      console.error('비료 회수 오류:', error);
      return res.status(500).json({ success: false, error_code: "SERVER_ERROR" });
    }
  },

  // 회원탈퇴 이후 테이블 청소
  clearInventory: async (req, res) => {
    const userId = req.headers['x-user-id'] || req.body.userId;

    if (!userId) {
      return res.status(400).json({ success: false, error_code: "BAD_REQUEST", message: "userId가 식별되지 않았습니다." });
    }

    try {
      console.log(`[HTTP 내부 통신] 탈퇴 회원 ${userId}번의 가방 데이터 정리 작업 개시`);

      await promisePool.query('DELETE FROM inventory_item WHERE user_id = ?', [userId]);

      return res.json({
        success: true,
        message: "탈퇴 유저의 인벤토리 자산 청소 성공"
      });
    } catch (error) {
      console.error('회원탈퇴 인벤토리 연동 처리 실패:', error);
      return res.status(500).json({ success: false, error_code: "SERVER_ERROR" });
    }
  }
};

module.exports = inventoryController;