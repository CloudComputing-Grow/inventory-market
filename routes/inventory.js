const express = require('express');
const router = express.Router();
const promisePool  = require('../db/db');

// 내 인벤토리 주소
// api/v1/inventory
router.get('/', async (req, res) => {

    // 나중에 유저 생기면 변경
  const userId = 1;

  try {
    // 인벤토리 조회
    const [items] = await promisePool.query(`
      SELECT 
        item_id as slot, 
        item_type_id as type, 
        quantity as qty
      FROM inventory_item
      WHERE user_id=?
      ORDER BY item_id
    `, [userId]);

    // 성공 response
    return res.json({
      success: true,
      data: {
        items: items
      }
    });
    // 에러 response
  } catch (error) {
    console.error('인벤토리 조회 오류:', error);
    return res.status(500).json({ success: false, error_code: "SERVER_ERROR" });
  }
});


// POST : 아이템 사용
// api/v1/inventory/consume
router.post('/consume', async (req, res) => {
  
    // 나중에 유저 생기면 변경
  const userId = 1;

  const { itemTypeId } = req.body; // consume할 아이템 타입 ID

  try {
    // 가방에 해당 아이템이 있는지 확인
    const [[itemRow]] = await promisePool.query(
      'SELECT item_id, quantity FROM inventory_item WHERE user_id = ? AND item_type_id = ?',
      [userId, itemTypeId]
    );

    if (!itemRow || itemRow.quantity < 1) {
      return res.status(400).json({ success: false, error_code: "ITEM_NOT_FOUND" });
    }

    // 아이템 1개 차감
    await promisePool.query('UPDATE item SET quantity  = quantity - 1 WHERE item_id = ?', [itemRow.item_id]);

    // 성공 response
    return res.json({
      success: true,
      data: {
        remaining_qty: itemRow.item_count - 1,
        growth_added: 20 // 비료 효과 20 고정 
      }
    });
  } catch (error) {
    console.error('아이템 차감 오류:', error);
    return res.status(500).json({ success: false, error_code: "SERVER_ERROR" });
  }
});


// post : 아이템 보상 지급
// api/v1/inventory/reward
router.post('/reward', async (req, res) => {
  const { userId, itemTypeId, qty } = req.body;

  try {
    // 가방 슬롯이 이미 20칸을 넘었는지 체크
    const [slotCount] = await promisePool.query(`
      SELECT COUNT(*) as count 
      FROM inventory_item 
      WHERE user_id = ?
    `, [userId]);

    if (slotCount[0].count >= 20) {
      return res.status(400).json({ success: false, error_code: "INV_FULL" });
    }

    // inventory_item 테이블에 삽입 및 quantity 누적
    await promisePool.query(`
      INSERT INTO inventory_item (user_id, item_type_id, quantity)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE quantity = quantity + ?
    `, [userId, itemTypeId, qty, qty]);

    const [[updatedItem]] = await promisePool.query(`
      SELECT item_id, quantity 
      FROM inventory_item 
      WHERE user_id = ? AND item_type_id = ?
    `, [userId, itemTypeId]);

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
});

module.exports = router;