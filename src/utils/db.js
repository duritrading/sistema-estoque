// src/utils/db.js
// Operações de banco centralizadas

const pool = require('../config/database');

// ============================================
// VERIFICAÇÕES COMUNS
// ============================================

async function exists(table, id) {
  const result = await pool.query(
    `SELECT id FROM ${table} WHERE id = $1`,
    [id]
  );
  return result.rows.length > 0;
}

async function findById(table, id, columns = '*') {
  const result = await pool.query(
    `SELECT ${columns} FROM ${table} WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function findAll(table, orderBy = 'id') {
  const result = await pool.query(
    `SELECT * FROM ${table} ORDER BY ${orderBy}`
  );
  return result.rows;
}

async function deleteById(table, id) {
  const result = await pool.query(
    `DELETE FROM ${table} WHERE id = $1 RETURNING id`,
    [id]
  );
  return result.rows.length > 0;
}

async function countDependencies(table, column, value) {
  const result = await pool.query(
    `SELECT COUNT(*) as count FROM ${table} WHERE ${column} = $1`,
    [value]
  );
  return parseInt(result.rows[0].count);
}

// ============================================
// WRAPPER PARA TRANSAÇÕES
// ============================================

async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  exists,
  findById,
  findAll,
  deleteById,
  countDependencies,
  transaction
};