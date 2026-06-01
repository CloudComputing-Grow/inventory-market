const promisePool = require('../db/db');

const marketModel = {
  getMarketListings: async () => {
    return await promisePool.query(`
      SELECT
        ml.post_id,
        ml.seller_id,
        ml.item_type_id,
        ml.status,
        ml.reg_date,
        m.item_name,
        m.category,
        DATEDIFF(DATE_ADD(DATE(ml.reg_date), INTERVAL 30 DAY), CURDATE()) AS dday
      FROM market_listing ml
      JOIN item_type_master m ON ml.item_type_id = m.item_type_id
      WHERE ml.status = 'ACTIVE'
      ORDER BY ml.reg_date DESC
    `);
  },

  getItemByUserIdAndType: async (sellerId, itemTypeId) => {
    return await promisePool.query(
      'SELECT item_id, quantity FROM inventory_item WHERE user_id = ? AND item_type_id = ?',
      [sellerId, itemTypeId]
    );
  },

  deductInventoryQty: async (qty, itemId) => {
    return await promisePool.query('UPDATE inventory_item SET quantity = quantity - ? WHERE item_id = ?', [qty, itemId]);
  },

  insertMarketListing: async (sellerId, itemTypeId) => {
    return await promisePool.query(`
      INSERT INTO market_listing (seller_id, item_type_id, status, reg_date)
      VALUES (?, ?, 'ACTIVE', NOW())
    `, [sellerId, itemTypeId]);
  },

  getDailyExchangeCount: async (buyerId) => {
    return await promisePool.query(`
      SELECT COUNT(*) AS count FROM exchange_log WHERE buyer_id = ? AND trade_date = CURDATE()
    `, [buyerId]);
  },

  getMarketPost: async (postId) => {
    return await promisePool.query(`
      SELECT seller_id, item_type_id, status FROM market_listing WHERE post_id = ?
    `, [postId]);
  },

  getBuyerItem: async (buyerId, itemTypeId) => {
    return await promisePool.query(
      'SELECT quantity FROM inventory_item WHERE user_id = ? AND item_type_id = ?',
      [buyerId, itemTypeId]
    );
  },

  updateMarketStatus: async (status, postId) => {
    return await promisePool.query(`UPDATE market_listing SET status = ? WHERE post_id = ?`, [status, postId]);
  },

  upsertBuyerInventory: async (buyerId, itemTypeId) => {
    return await promisePool.query(`
      INSERT INTO inventory_item (user_id, item_type_id, quantity) VALUES (?, ?, 1)
      ON DUPLICATE KEY UPDATE quantity = quantity + 1
    `, [buyerId, itemTypeId]);
  },

  insertExchangeLog: async (buyerId, postId) => {
    return await promisePool.query(`
      INSERT INTO exchange_log (buyer_id, post_id, trade_date) VALUES (?, ?, CURDATE())
    `, [buyerId, postId]);
  },

  getMarketPostWithSeller: async (postId, userId) => {
    return await promisePool.query(`
      SELECT item_type_id, status FROM market_listing WHERE post_id = ? AND seller_id = ?
    `, [postId, userId]);
  }
};

module.exports = marketModel;