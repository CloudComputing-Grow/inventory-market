const promisePool = require('../db/db');

const inventoryModel = {
  getInventoryByUserId: async (userId) => {
    return await promisePool.query(`
      SELECT
        i.item_id as slot,
        i.item_type_id as type,
        i.quantity as qty,
        m.item_name,
        m.category
      FROM inventory_item i
      JOIN item_type_master m ON i.item_type_id = m.item_type_id
      WHERE i.user_id = ?
      ORDER BY i.item_id
    `, [userId]);
  },

  deleteItem: async (itemId) => {
  return await promisePool.query('DELETE FROM inventory_item WHERE item_id = ?', [itemId]);
  },

  getItemByUserIdAndType: async (userId, itemTypeId) => {
    return await promisePool.query(
      'SELECT item_id, quantity FROM inventory_item WHERE user_id = ? AND item_type_id = ?',
      [userId, itemTypeId]
    );
  },

  deductItemQuantity: async (itemId) => {
    return await promisePool.query('UPDATE inventory_item SET quantity = quantity - 1 WHERE item_id = ?', [itemId]);
  },

  recoverItemQuantity: async (itemId) => {
    return await promisePool.query('UPDATE inventory_item SET quantity = quantity + 1 WHERE item_id = ?', [itemId]);
  },

  getSlotCountByUserId: async (userId) => {
    return await promisePool.query(`
      SELECT COUNT(*) as count 
      FROM inventory_item 
      WHERE user_id = ?
    `, [userId]);
  },

  upsertRewardItem: async (userId, itemTypeId, qty) => {
    return await promisePool.query(`
      INSERT INTO inventory_item (user_id, item_type_id, quantity)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE quantity = quantity + ?
    `, [userId, itemTypeId, qty, qty]);
  },

  deductMarketQty: async (qty, itemId) => {
    return await promisePool.query('UPDATE inventory_item SET quantity = quantity - ? WHERE item_id = ?', [qty, itemId]);
  }
};

module.exports = inventoryModel;