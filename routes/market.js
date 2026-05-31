const express = require('express');
const router = express.Router();
const marketController = require('../controllers/marketController');
const verifyUser = require('../middlewares/auth');

// 과일 등록 
// POST : /api/v1/market/listings
router.post('/listings',verifyUser, marketController.createListing);

// 과일 교환
// POST : /api/v1/market/exchange
router.post('/exchange',verifyUser, marketController.exchange);

// 과일 등록 취소
// POST : /api/v1/market/cancel
router.post('/cancel',verifyUser, marketController.cancel);

module.exports = router;