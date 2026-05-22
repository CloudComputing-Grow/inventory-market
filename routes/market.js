const express = require('express');
const router = express.Router();
const marketController = require('../controllers/marketController');

// 과일 등록 
// POST : /api/v1/market/listings
router.post('/listings', marketController.createListing);

// 과일 교환
// POST : /api/v1/market/exchange
router.post('/exchange', marketController.exchange);

// 과일 등록 취소
// POST : /api/v1/market/cancel
router.post('/cancel', marketController.cancel);

module.exports = router;