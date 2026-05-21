const express = require('express');
const router = express.Router();
const promisePool = require('../db/db'); 


// 과일 등록 
// POST : /api/v1/market/listings

router.post('/listings', async (req, res) => {
  const sellerId = req.headers['x-user-id'] || 1;
  const { itemTypeId, qty } = req.body; 

  if (!itemTypeId || !qty) {
    return res.status(400).json({ success: false, error_code: "BAD_REQUEST" });
  }

  try {
    // 내 가방에 과일이 진짜 있는지 확인
    const [[itemRow]] = await promisePool.query(
      'SELECT item_id, quantity FROM inventory_item WHERE user_id = ? AND item_type_id = ?',
      [sellerId, itemTypeId]
    );

    if (!itemRow || itemRow.quantity < qty) {
      return res.status(400).json({ success: false, error_code: "INSUFFICIENT_QTY", message: "마켓에 등록할 과일 수량이 부족합니다." });
    }

    // 내 가방에서 수량  차감 
    await promisePool.query('UPDATE inventory_item SET quantity = quantity - ? WHERE item_id = ?', [qty, itemRow.item_id]);

    //  마켓 테이블에 매물 등록
    const [result] = await promisePool.query(`
      INSERT INTO market_listing (seller_id, item_type_id, status, reg_date)
      VALUES (?, ?, 'ACTIVE', NOW())
    `, [sellerId, itemTypeId]);

    return res.json({
      success: true,
      data: {
        post_id: result.insertId,
        message: "마켓에 과일이 성공적으로 등록되었습니다."
      }
    });

  } catch (error) {
    console.error('[POST /market/listings] 과일 등록 오류:', error);
    return res.status(500).json({ success: false, error_code: "SERVER_ERROR" });
  }
});



//과일 교환
// POST : /api/v1/market/exchange
router.post('/exchange', async (req, res) => {
  const buyerId = req.headers['x-user-id'] || 2; 
  const { postId } = req.body; 

  if (!postId) {
    return res.status(400).json({ success: false, error_code: "BAD_REQUEST" });
  }

  try {
    // 1오늘 교환 횟수 제한 체크 (하루 3회 제한)
    const [logCount] = await promisePool.query(`
      SELECT COUNT(*) AS count FROM exchange_log WHERE buyer_id = ? AND trade_date = CURDATE()
    `, [buyerId]);

    if (logCount[0].count >= 3) {
      return res.status(400).json({ success: false, error_code: "EXCEEDED_DAILY_LIMIT", message: "오늘은 교환 요청을 3번까지만 할 수 있습니다." });
    }

    // 해당 매물이 유효한지 검증
    const [[postRow]] = await promisePool.query(`
      SELECT seller_id, item_type_id, status FROM market_listing WHERE post_id = ?
    `, [postId]);

    if (!postRow || postRow.status !== 'ACTIVE') {
      return res.status(400).json({ success: false, error_code: "INVALID_POST" });
    }

    // 30개 제한 체크
    const [[buyerItemRow]] = await promisePool.query(
      'SELECT quantity FROM inventory_item WHERE user_id = ? AND item_type_id = ?',
      [buyerId, postRow.item_type_id]
    );
    const currentQty = buyerItemRow ? buyerItemRow.quantity : 0;
    
    if (currentQty + 1 > 30) { 
      return res.status(400).json({ success: false, error_code: "LIMIT_EXCEEDED", message: "슬롯당 최대 수량(30개)을 초과하여 교환할 수 없습니다." });
    }

    // 마켓 매물 상태를 SOLD로 변경
    await promisePool.query(`UPDATE market_listing SET status = 'SOLD' WHERE post_id = ?`, [postId]);

    // 구매자 인벤토리에 과일 1개 직접 지급
    await promisePool.query(`
      INSERT INTO inventory_item (user_id, item_type_id, quantity) VALUES (?, ?, 1)
      ON DUPLICATE KEY UPDATE quantity = quantity + 1
    `, [buyerId, postRow.item_type_id]);

    // 교환 완료 로그 남기기
    const [logResult] = await promisePool.query(`
      INSERT INTO exchange_log (buyer_id, post_id, trade_date) VALUES (?, ?, CURDATE())
    `, [buyerId, postId]);

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
});


// ==========================================
// 8-3. 과일 등록 취소 (CANCELLED 처리 + 판매자 가방 직접 원복)
// POST : /api/v1/market/cancel
// ==========================================
router.post('/cancel', async (req, res) => {
  const userId = req.headers['x-user-id'] || 1;
  const { postId } = req.body;

  if (!postId) {
    return res.status(400).json({ success: false, error_code: "BAD_REQUEST" });
  }

  try {
    //내 매물이고 ACTIVE 상태인지 확인
    const [[postRow]] = await promisePool.query(`
      SELECT item_type_id, status FROM market_listing WHERE post_id = ? AND seller_id = ?
    `, [postId, userId]);

    if (!postRow || postRow.status !== 'ACTIVE') {
      return res.status(400).json({ success: false, error_code: "NOT_FOUND_OR_INVALID" });
    }

    // 원복 시 판매자 가방이 30개를 넘지 않는지 검증
    const [[sellerItemRow]] = await promisePool.query(
      'SELECT quantity FROM inventory_item WHERE user_id = ? AND item_type_id = ?',
      [userId, postRow.item_type_id]
    );
    const currentQty = sellerItemRow ? sellerItemRow.quantity : 0;
    if (currentQty + 1 > 30) { 
      return res.status(400).json({ success: false, error_code: "LIMIT_EXCEEDED", message: "가방 보관 최대 수량(30개)을 초과하여 취소할 수 없습니다." });
    }

    // 마켓 장부 상태 CANCELLED로 변경
    await promisePool.query(`UPDATE market_listing SET status = 'CANCELLED' WHERE post_id = ?`, [postId]);

    // 판매자 가방에 과일 1개 안전하게 복구
    await promisePool.query(`
      INSERT INTO inventory_item (user_id, item_type_id, quantity) VALUES (?, ?, 1)
      ON DUPLICATE KEY UPDATE quantity = quantity + 1
    `, [userId, postRow.item_type_id]);

    return res.json({
      success: true,
      data: { message: "마켓 판매 등록 취소 및 인벤토리 원복 완료" }
    });

  } catch (error) {
    console.error('[POST /market/cancel] 등록 취소 오류:', error);
    return res.status(500).json({ success: false, error_code: "SERVER_ERROR" });
  }
});

module.exports = router;