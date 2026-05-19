const fs = require('fs');
const path = require('path');
const mysql = require('mysql2');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 10, // 동시에 최대 10개까지만 연결 허용
  queueLimit: 0,


  authPlugins: {
    sha256_password: () => require('mysql2/lib/auth_plugins/sha256_password'),
    caching_sha2_password: () => require('mysql2/lib/auth_plugins/caching_sha2_password')
  }
});

// 비동기 사용
const promisePool = pool.promise();

module.exports = promisePool;