const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const verifyUser = require('../middlewares/auth');

// 내 인벤토리 조회 
// GET : api/v1/inventory
router.get('/',verifyUser, inventoryController.getInventory);

// POST : 비료 사용할 시 (growth 팀 호출)
// api/v1/inventory/consume-fertilizer
router.post('/consume-fertilizer',verifyUser, inventoryController.consumeFertilizer);

// POST : 과일 심기 시 인벤토리 차감 (GROWTH 팀에서 호출)
// api/v1/inventory/consume-seed
router.post('/consume-seed',verifyUser, inventoryController.consumeSeed);

// 아이템 보상 지급 로직 (Mission/Growth팀 수확 완료 시 호출)
// POST : api/v1/inventory/reward
router.post('/reward',verifyUser, inventoryController.reward);

// 가방 깎기
// POST : api/v1/inventory/market-deduct
router.post('/market-deduct',verifyUser, inventoryController.marketDeduct);

// 마켓 판매 등록 취소 시 가방 원복 
// POST : api/v1/inventory/market-recover
router.post('/market-recover',verifyUser, inventoryController.marketRecover);

module.exports = router;