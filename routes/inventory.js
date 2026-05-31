const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');

// GET : /api/v1/inventory
router.get('/', inventoryController.getInventory);

// POST : /api/v1/inventory/consume-fertilizer
router.post('/consume-fertilizer', inventoryController.consumeFertilizer);

// POST : /api/v1/inventory/consume-seed
router.post('/consume-seed', inventoryController.consumeSeed);

// POST : /api/v1/inventory/reward
router.post('/reward', inventoryController.reward);

// POST : /api/v1/inventory/market-deduct
router.post('/market-deduct', inventoryController.marketDeduct);

// POST : /api/v1/inventory/market-recover
router.post('/market-recover', inventoryController.marketRecover);

module.exports = router;