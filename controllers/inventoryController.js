const inventoryModel = require('../models/inventoryModel');
const axios = require('axios');

const GROWTH_SERVER_URL = 'http://localhost:3001';

const inventoryController = {
  getInventory: async (req, res) => {
    const userId = req.headers['x-user-id'] || 1;
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
    const userId = req.headers['x-user-id'] || 1;
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
          message: "비료는 차감되었으나 성장률 반영 서버와 통신에 실패했습니다." 
        });
      }
      return res.status(500).json({ success: false, error_code: "SERVER_ERROR" });
    }
  },

  consumeSeed: async (req, res) => {
    const { userId, itemTypeId } = req.body;

    if (Number(itemTypeId) === 1) {
      return res.status(400).json({ success: false, error_code: "CANNOT_PLANT_FERTILIZER", message: "비료는 심을 수 없습니다." });
    }

    try {
      const [[itemRow]] = await inventoryModel.getItemByUserIdAndType(userId, itemTypeId);

      if (!itemRow || itemRow.quantity < 1) {
        return res.status(400).json({ success: false, error_code: "FRUIT_NOT_FOUND", message: "심을 과일(씨앗) 수량이 부족합니다." });
      }

      await inventoryModel.deductItemQuantity(itemRow.item_id);

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
    const { userId, itemTypeId, qty } = req.body;

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
    const { userId, itemTypeId, qty } = req.body; 

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
    const { userId, itemTypeId, qty } = req.body; 

    try {
      const [[itemRow]] = await inventoryModel.getItemByUserIdAndType(userId, itemTypeId);
      
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
  }
};

module.exports = inventoryController;