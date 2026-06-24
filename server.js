const express = require('express');
const { Pool } = require('pg');
const XLSX = require('xlsx');
const path = require('path');

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      codigo TEXT UNIQUE NOT NULL,
      item TEXT NOT NULL,
      proveedor TEXT DEFAULT '',
      precio_compra NUMERIC DEFAULT 0,
      precio_venta NUMERIC DEFAULT 0,
      iva NUMERIC DEFAULT 0,
      stock INTEGER DEFAULT 0,
      stock_minimo INTEGER DEFAULT 5,
      ubicacion TEXT DEFAULT 'bodega'
    );
    CREATE TABLE IF NOT EXISTS entries (
      id SERIAL PRIMARY KEY,
      fecha TEXT NOT NULL,
      proveedor TEXT DEFAULT '',
      factura TEXT DEFAULT '',
      codigo TEXT NOT NULL,
      item TEXT NOT NULL,
      cantidad INTEGER NOT NULL,
      precio_llegada NUMERIC NOT NULL,
      precio_venta NUMERIC NOT NULL,
      iva NUMERIC DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS sales (
      id SERIAL PRIMARY KEY,
      fecha TEXT NOT NULL,
      codigo TEXT NOT NULL,
      item TEXT NOT NULL,
      cantidad INTEGER NOT NULL,
      precio_venta NUMERIC NOT NULL,
      precio_compra NUMERIC NOT NULL,
      ganancia NUMERIC NOT NULL
    );
  `);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- Products ----
app.get('/api/products', async (req, res) => {
  const q = req.query.q;
  let result;
  if (q) {
    result = await pool.query(
      `SELECT * FROM products WHERE codigo ILIKE $1 OR item ILIKE $1 ORDER BY item`,
      [`%${q}%`]
    );
  } else {
    result = await pool.query('SELECT * FROM products ORDER BY item');
  }
  res.json(result.rows);
});

app.post('/api/products', async (req, res) => {
  const { codigo, item, proveedor, precio_compra, precio_venta, iva, stock, stock_minimo, ubicacion } = req.body;
  if (!codigo || !item) return res.status(400).json({ error: 'codigo e item son requeridos' });
  try {
    await pool.query(
      `INSERT INTO products (codigo, item, proveedor, precio_compra, precio_venta, iva, stock, stock_minimo, ubicacion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [codigo, item, proveedor || '', precio_compra || 0, precio_venta || 0, iva || 0, stock || 0, stock_minimo || 5, ubicacion || 'bodega']
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/products/:codigo', async (req, res) => {
  const { item, proveedor, precio_compra, precio_venta, iva, stock, stock_minimo, ubicacion } = req.body;
  await pool.query(
    `UPDATE products SET item=$1, proveedor=$2, precio_compra=$3, precio_venta=$4, iva=$5, stock=$6, stock_minimo=$7, ubicacion=$8 WHERE codigo=$9`,
    [item, proveedor, precio_compra, precio_venta, iva, stock, stock_minimo, ubicacion, req.params.codigo]
  );
  res.json({ ok: true });
});

app.delete('/api/products/:codigo', async (req, res) => {
  await pool.query('DELETE FROM products WHERE codigo=$1', [req.params.codigo]);
  res.json({ ok: true });
});

// ---- Entries ----
app.get('/api/entries', async (req, res) => {
  const result = await pool.query('SELECT * FROM entries ORDER BY fecha DESC, id DESC');
  res.json(result.rows);
});

app.post('/api/entries', async (req, res) => {
  const { fecha, proveedor, factura, codigo, item, cantidad, precio_llegada, precio_venta, iva, ubicacion } = req.body;
  if (!fecha || !codigo || !item || !cantidad) return res.status(400).json({ error: 'Faltan campos requeridos' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO entries (fecha, proveedor, factura, codigo, item, cantidad, precio_llegada, precio_venta, iva)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [fecha, proveedor || '', factura || '', codigo, item, cantidad, precio_llegada, precio_venta, iva || 0]
    );
    const existing = await client.query('SELECT * FROM products WHERE codigo=$1', [codigo]);
    if (existing.rows.length > 0) {
      await client.query(
        `UPDATE products SET stock=stock+$1, precio_compra=$2, precio_venta=$3, iva=$4, item=$5, proveedor=$6 WHERE codigo=$7`,
        [cantidad, precio_llegada, precio_venta, iva || 0, item, proveedor || '', codigo]
      );
    } else {
      await client.query(
        `INSERT INTO products (codigo, item, proveedor, precio_compra, precio_venta, iva, stock, ubicacion)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [codigo, item, proveedor || '', precio_llegada, precio_venta, iva || 0, cantidad, ubicacion || 'bodega']
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ---- Sales ----
app.get('/api/sales', async (req, res) => {
  const result = await pool.query('SELECT * FROM sales ORDER BY fecha DESC, id DESC');
  res.json(result.rows);
});

app.post('/api/sales', async (req, res) => {
  const { fecha, codigo, cantidad, precio_venta } = req.body;
  if (!fecha || !codigo || !cantidad || !precio_venta) return res.status(400).json({ error: 'Faltan campos requeridos' });

  const client = await pool.connect();
  try {
    const prod = await client.query('SELECT * FROM products WHERE codigo=$1', [codigo]);
    if (!prod.rows.length) return res.status(404).json({ error: 'Producto no encontrado' });
    const product = prod.rows[0];
    if (product.stock < cantidad) return res.status(400).json({ error: 'Stock insuficiente' });

    const precioVenta = parseFloat(precio_venta);
    const ganancia = (precioVenta - parseFloat(product.precio_compra)) * cantidad;

    await client.query('BEGIN');
    await client.query(
      `INSERT INTO sales (fecha, codigo, item, cantidad, precio_venta, precio_compra, ganancia)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [fecha, codigo, product.item, cantidad, precioVenta, product.precio_compra, ganancia]
    );
    await client.query('UPDATE products SET stock=stock-$1 WHERE codigo=$2', [cantidad, codigo]);
    await client.query('COMMIT');
    res.json({ ok: true, ganancia });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ---- Dashboard ----
app.get('/api/dashboard', async (req, res) => {
  const [totalProd, stockVal, salesVal, lowStock, today] = await Promise.all([
    pool.query('SELECT COUNT(*) c FROM products'),
    pool.query('SELECT COALESCE(SUM(stock * precio_compra),0) v FROM products'),
    pool.query('SELECT COALESCE(SUM(stock * precio_venta),0) v FROM products'),
    pool.query('SELECT * FROM products WHERE stock <= stock_minimo ORDER BY stock ASC'),
    new Date().toISOString().slice(0, 10)
  ]);

  const [ventasHoy, ventasTotales, topVendidos] = await Promise.all([
    pool.query(`SELECT COALESCE(SUM(cantidad*precio_venta),0) total, COALESCE(SUM(ganancia),0) ganancia, COUNT(*) c FROM sales WHERE fecha=$1`, [today]),
    pool.query(`SELECT COALESCE(SUM(cantidad*precio_venta),0) total, COALESCE(SUM(ganancia),0) ganancia FROM sales`),
    pool.query(`SELECT item, codigo, SUM(cantidad) total_vendido FROM sales GROUP BY codigo, item ORDER BY total_vendido DESC LIMIT 5`)
  ]);

  res.json({
    totalProducts: totalProd.rows[0].c,
    totalStockValue: stockVal.rows[0].v,
    totalSalesValue: salesVal.rows[0].v,
    lowStock: lowStock.rows,
    outOfStock: lowStock.rows.filter(p => p.stock <= 0),
    ventasHoy: ventasHoy.rows[0],
    ventasTotales: ventasTotales.rows[0],
    topVendidos: topVendidos.rows
  });
});

// ---- Export Excel ----
app.get('/api/export', async (req, res) => {
  const [products, entries, sales] = await Promise.all([
    pool.query('SELECT codigo, item, proveedor, precio_compra, precio_venta, iva, stock, stock_minimo, ubicacion FROM products ORDER BY item'),
    pool.query('SELECT fecha, proveedor, factura, codigo, item, cantidad, precio_llegada, precio_venta, iva FROM entries ORDER BY fecha DESC, id DESC'),
    pool.query('SELECT fecha, codigo, item, cantidad, precio_venta, precio_compra, ganancia FROM sales ORDER BY fecha DESC, id DESC')
  ]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(products.rows), 'Inventario');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(entries.rows), 'Ingresos');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sales.rows), 'Salidas');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const fecha = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Disposition', `attachment; filename="inventario_${fecha}.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
});

const PORT = process.env.PORT || 3000;
initDB()
  .then(() => app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`)))
  .catch(err => { console.error('Error iniciando DB:', err); process.exit(1); });
