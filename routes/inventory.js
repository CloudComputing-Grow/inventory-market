const express = require('express');
const router = express.Router();
const promisePool  = require('../db/db');
const axios = require('axios');

//이건 나중에 바뀌면 수정, Growth팀 서버 실제 호스트 주소
const GROWTH_SERVER_URL = 'http://localhost:3001';

// 내 인벤토리 조회 
// GET : api/v1/inventory
router.get('/', async (req, res) => {

    // 나중에 유저 생기면 변경
  const userId = req.headers['x-user-id'] || 1;

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
      data: { items }
    });
    // 에러 response
  } catch (error) {
    console.error('인벤토리 조회 오류:', error);
    return res.status(500).json({ success: false, error_code: "SERVER_ERROR" });
  }
});


// POST : 비료 사용할 시 (growth 팀 호출)
// api/v1/inventory/consume-fertilizer
router.post('/consume-fertilizer', async (req, res) => {
  
    // 나중에 유저 생기면 변경
  const userId = req.headers['x-user-id'] || 1;
  const { itemTypeId, growthStatusId } = req.body;

  // 비료인지 확인
  if (Number(itemTypeId) !== 1) {
    return res.status(400).json({ 
      success: false, 
      error_code: "CANNOT_CONSUME_THIS_ITEM", 
      message: "비료만 사용할 수 있습니다." 
    });
  }

  try {
    // 가방에 비료가 있는지 확인
    const [[itemRow]] = await promisePool.query(
      'SELECT item_id, quantity FROM inventory_item WHERE user_id = ? AND item_type_id = ?',
      [userId, itemTypeId]
    );

    if (!itemRow || itemRow.quantity < 1) {
      return res.status(400).json({ success: false, error_code: "ITEM_NOT_FOUND" });
    }

    // 비료 수량 1개 차감
    await promisePool.query('UPDATE inventory_item SET quantity = quantity - 1 WHERE item_id = ?', [itemRow.item_id]);

    try {
      await axios.post(`${GROWTH_SERVER_URL}/api/v1/growth-diary/growth-rate`, {
        growthStatusId: growthStatusId || 1, // 넘겨받은 식물 상태 ID (없으면 테스트용 1)
        changedRate: 20,                     // 성장률 20 증가
        reason: "MISSION"                    
      });
    } catch (growthError) {
      console.error('Growth 서버 연동 실패:', growthError.message);
      // 서버 연동 실패했으므로 비료 롤백
      await promisePool.query('UPDATE inventory_item SET quantity = quantity + 1 WHERE item_id = ?', [itemRow.item_id]);
      throw new Error('GROWTH_SERVER_ERROR');
    }

    return res.json({
      success: true,
      data: {
        remaining_qty: itemRow.quantity - 1,
        growth_added: 20 // 성공 RESPONSE : 성장률 20 업
      }
    }); // 실패 RESPONSE
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
});


// POST : 과일 심기 시 인벤토리 차감 (GROWTH 팀에서 호출)
// api/v1/inventory/consume-seed

router.post('/consume-seed', async (req, res) => {
  const { userId, itemTypeId } = req.body; // Growth팀이 유저 ID와 심은 과일 ID를 body로 던짐

  // 1번 비료는 땅에 심을 수 없으므로 예외 처리
  if (Number(itemTypeId) === 1) {
    return res.status(400).json({ success: false, error_code: "CANNOT_PLANT_FERTILIZER", message: "비료는 심을 수 없습니다." });
  }

  try {
    const [[itemRow]] = await promisePool.query(
      'SELECT item_id, quantity FROM inventory_item WHERE user_id = ? AND item_type_id = ?',
      [userId, itemTypeId]
    );

    // 심으려는 과일이 가방에 없거나 수량이 부족할 때
    if (!itemRow || itemRow.quantity < 1) {
      return res.status(400).json({ success: false, error_code: "FRUIT_NOT_FOUND", message: "심을 과일(씨앗) 수량이 부족합니다." });
    }

    // 선택한 과일을 가방에서 1개 차감 (이게 곧 씨앗 심기 동작)
    await promisePool.query('UPDATE inventory_item SET quantity = quantity - 1 WHERE item_id = ?', [itemRow.item_id]);

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
});


// 아이템 보상 지급 로직 (Mission/Growth팀 수확 완료 시 호출)
// POST : api/v1/inventory/reward

router.post('/reward', async (req, res) => {
  const { userId, itemTypeId, qty } = req.body;

  try {
    const [slotCount] = await promisePool.query(`
      SELECT COUNT(*) as count 
      FROM inventory_item 
      WHERE user_id = ?
    `, [userId]);

    if (slotCount[0].count >= 20) {
      return res.status(400).json({ success: false, error_code: "INV_FULL" });
    }

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


// 가방 깎기
// POST : api/v1/inventory/market-deduct

router.post('/market-deduct', async (req, res) => {
  const { userId, itemTypeId, qty } = req.body; 

  try {
    const [[itemRow]] = await promisePool.query(
      'SELECT item_id, quantity FROM inventory_item WHERE user_id = ? AND item_type_id = ?',
      [userId, itemTypeId]
    );

    if (!itemRow || itemRow.quantity < qty) {
      return res.status(400).json({ success: false, error_code: "INSUFFICIENT_QTY", message: "마켓에 등록할 과일 수량이 부족합니다." });
    }

    // 판매 등록한 만큼 내 가방에서 수량 차감
    await promisePool.query('UPDATE inventory_item SET quantity = quantity - ? WHERE item_id = ?', [qty, itemRow.item_id]);

    return res.json({
      success: true,
      data: { remaining_qty: itemRow.quantity - qty }
    });
  } catch (error) {
    console.error('마켓 등록 차감 오류:', error);
    return res.status(500).json({ success: false, error_code: "SERVER_ERROR" });
  }
});



// [6] 마켓 판매 등록 취소 시 가방 원복 
// POST : api/v1/inventory/market-recover

router.post('/market-recover', async (req, res) => {
  const { userId, itemTypeId, qty } = req.body; 

  try {
    const [[itemRow]] = await promisePool.query(
      'SELECT quantity FROM inventory_item WHERE user_id = ? AND item_type_id = ?',
      [userId, itemTypeId]
    );
    
    const currentQty = itemRow ? itemRow.quantity : 0;
    // 기획 조건: 한 물품당 최대 30개 제한 체크
    if (currentQty + qty > 30) {
      return res.status(400).json({ success: false, error_code: "LIMIT_EXCEEDED", message: "보관 최대 수량(30개)을 초과하여 회복할 수 없습니다." });
    }

    // UNIQUE KEY가 있으므로 안전하게 세팅 및 누적 처리
    await promisePool.query(`
      INSERT INTO inventory_item (user_id, item_type_id, quantity)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE quantity = quantity + ?
    `, [userId, itemTypeId, qty, qty]);

    return res.json({ success: true, data: { message: "인벤토리 원복 완료" } });
  } catch (error) {
    console.error('마켓 취소 원복 오류:', error);
    return res.status(500).json({ success: false, error_code: "SERVER_ERROR" });
  }
});

module.exports = router;