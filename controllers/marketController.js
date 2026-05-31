const marketModel = require('../models/marketModel');
const inventoryModel = require('../models/inventoryModel');//인벤토리 슬롯 수 체크해야 함

const marketController = {
  createListing: async (req, res) => {
    const sellerId = req.headers['x-user-id'];
    const { itemTypeId, qty } = req.body; 

    if (!itemTypeId || !qty) {
      return res.status(400).json({ success: false, error_code: "BAD_REQUEST" });
    }

    try {
      const [[itemRow]] = await marketModel.getItemByUserIdAndType(sellerId, itemTypeId);

      if (!itemRow || itemRow.quantity < qty) {
        return res.status(400).json({ success: false, error_code: "INSUFFICIENT_QTY", message: "마켓에 등록할 과일 수량이 부족합니다." });
      }

      await marketModel.deductInventoryQty(qty, itemRow.item_id);

      // 낱개 등록 모델 구조에 맞게 수량(qty)만큼 반복문을 돌려 1개짜리 글을 여러 개 만듬
      let lastInsertId = null;
      for (let i = 0; i < Number(qty); i++) {
        const [result] = await marketModel.insertMarketListing(sellerId, itemTypeId);
        lastInsertId = result.insertId;
      }

      return res.json({
        success: true,
        data: {
          post_id: lastInsertId,
          message: "마켓에 과일이 성공적으로 등록되었습니다."
        }
      });
    } catch (error) {
      console.error('[POST /market/listings] 과일 등록 오류:', error);
      return res.status(500).json({ success: false, error_code: "SERVER_ERROR" });
    }
  },

  exchange: async (req, res) => {
    const buyerId = req.headers['x-user-id']; 
    const { postId } = req.body; 

    if (!postId) {
      return res.status(400).json({ success: false, error_code: "BAD_REQUEST" });
    }

    try {
      const [logCount] = await marketModel.getDailyExchangeCount(buyerId);

      if (logCount[0].count >= 3) {
        return res.status(400).json({ success: false, error_code: "EXCEEDED_DAILY_LIMIT", message: "오늘은 교환 요청을 3번까지만 할 수 있습니다." });
      }

      const [[postRow]] = await marketModel.getMarketPost(postId);

      if (!postRow || postRow.status !== 'ACTIVE') {
        return res.status(400).json({ success: false, error_code: "INVALID_POST" });
      }

      const [[buyerItemRow]] = await marketModel.getBuyerItem(buyerId, postRow.item_type_id);
      const [slotCount] = await inventoryModel.getSlotCountByUserId(buyerId);
      if (!buyerItemRow && slotCount[0].count >= 20) {
        return res.status(400).json({ success: false, error_code: "INV_FULL", message: "인벤토리가 가득 차서 교환품을 받을 수 없습니다." });
      }
      const currentQty = buyerItemRow ? buyerItemRow.quantity : 0;
      
      if (currentQty + 1 > 30) { 
        return res.status(400).json({ success: false, error_code: "LIMIT_EXCEEDED", message: "슬롯당 최대 수량(30개)을 초과하여 교환할 수 없습니다." });
      }

      await marketModel.updateMarketStatus('SOLD', postId);

      await marketModel.upsertBuyerInventory(buyerId, postRow.item_type_id);

      const [logResult] = await marketModel.insertExchangeLog(buyerId, postId);

      return res.json({
        success: true,
        data: { 
          log_id: logResult.insertId,
          today_count: logCount[0].count + 1
        }
      });
    } catch (error) {
      console.error('[POST /market/exchange] 교환 처리 오류:', error);
      return res.status(500).json({ success: false, error_code: "SERVER_ERROR" });
    }
  },

  cancel: async (req, res) => {
    const userId = req.headers['x-user-id'];
    const { postId } = req.body;

    if (!postId) {
      return res.status(400).json({ success: false, error_code: "BAD_REQUEST" });
    }

    try {
      const [[postRow]] = await marketModel.getMarketPostWithSeller(postId, userId);

      if (!postRow || postRow.status !== 'ACTIVE') {
        return res.status(400).json({ success: false, error_code: "NOT_FOUND_OR_INVALID" });
      }

      const [[sellerItemRow]] = await marketModel.getBuyerItem(userId, postRow.item_type_id);
      const currentQty = sellerItemRow ? sellerItemRow.quantity : 0;
      if (currentQty + 1 > 30) { 
        return res.status(400).json({ success: false, error_code: "LIMIT_EXCEEDED", message: "가방 보관 최대 수량(30개)을 초과하여 취소할 수 없습니다." });
      }

      await marketModel.updateMarketStatus('CANCELLED', postId);

      await marketModel.upsertBuyerInventory(userId, postRow.item_type_id);

      return res.json({
        success: true,
        data: { message: "마켓 판매 등록 취소 및 인벤토리 원복 완료" }
      });
    } catch (error) {
      console.error('[POST /market/cancel] 등록 취소 오류:', error);
      return res.status(500).json({ success: false, error_code: "SERVER_ERROR" });
    }
  }
};

module.exports = marketController;