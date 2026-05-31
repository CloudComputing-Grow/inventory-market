const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');

// GET /api/internal/v1/fruits/random
router.get('/fruits/random', inventoryController.getRandomFruit);

// POST /api/internal/v1/items/revoke-fertilizer
router.post('/items/revoke-fertilizer', inventoryController.revokeFertilizer);

module.exports = router;
