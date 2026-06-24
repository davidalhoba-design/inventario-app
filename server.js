const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const XLSX = require('xlsx');

const app = express();
const dbPath = process.env.DB_PATH || path.join(__dirname, 'inventario.db');
const db = new Database(dbPath);

db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE NOT NULL,
  item TEXT NOT NULL,
  proveedor TEXT,
  precio_compra REAL DEFAULT 0,
  precio_venta REAL DEFAULT 0,
  iva REAL DEFAULT 0,
  stock INTEGER DEFAULT 0,
  stock_minimo INTEGER DEFAULT 5,
  ubicacion TEXT DEFAULT 'bodega'
);

CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL,
  proveedor TEXT,
  factura TEXT,
  codigo TEXT NOT NULL,
  item TEXT NOT NULL,
  cantidad INTEGER NOT NULL,
  precio_llegada REAL NOT NULL,
  precio_venta REAL NOT NULL,
  iva REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL,
  codigo TEXT NOT NULL,
  item TEXT NOT NULL,
  cantidad INTEGER NOT NULL,
  precio_venta REAL NOT NULL,
  precio_compra REAL NOT NULL,
  ganancia REAL NOT NULL
);
`);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- Products ----
app.get('/api/products', (req, res) => {
  const q = req.query.q;
  let rows;
  if (q) {
    rows = db.prepare(`SELECT * FROM products WHERE codigo LIKE ? OR item LIKE ? ORDER BY item`)
      .all(`%${q}%`, `%${q}%`);
  } else {
    rows = db.prepare('SELECT * FROM products ORDER BY item').all();
  }
  res.json(rows);
});

app.post('/api/products', (req, res) => {
  const { codigo, item, proveedor, precio_compra, precio_venta, iva, stock, stock_minimo, ubicacion } = req.body;
  if (!codigo || !item) return res.status(400).json({ error: 'codigo e item son requeridos' });
  try {
    db.prepare(`INSERT INTO products (codigo, item, proveedor, precio_compra, precio_venta, iva, stock, stock_minimo, ubicacion)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(codigo, item, proveedor || '', precio_compra || 0, precio_venta || 0, iva || 0, stock || 0, stock_minimo || 5, ubicacion || 'bodega');
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/products/:codigo', (req, res) => {
  const { item, proveedor, precio_compra, precio_venta, iva, stock, stock_minimo, ubicacion } = req.body;
  db.prepare(`UPDATE products SET item=?, proveedor=?, precio_compra=?, precio_venta=?, iva=?, stock=?, stock_minimo=?, ubicacion=? WHERE codigo=?`)
    .run(item, proveedor, precio_compra, precio_venta, iva, stock, stock_minimo, ubicacion, req.params.codigo);
  res.json({ ok: true });
});

app.delete('/api/products/:codigo', (req, res) => {
  db.prepare('DELETE FROM products WHERE codigo=?').run(req.params.codigo);
  res.json({ ok: true });
});

// ---- Entries (Ingreso de mercancia) ----
app.get('/api/entries', (req, res) => {
  res.json(db.prepare('SELECT * FROM entries ORDER BY fecha DESC, id DESC').all());
});

app.post('/api/entries', (req, res) => {
  const { fecha, proveedor, factura, codigo, item, cantidad, precio_llegada, precio_venta, iva, ubicacion } = req.body;
  if (!fecha || !codigo || !item || !cantidad) return res.status(400).json({ error: 'Faltan campos requeridos' });

  const insertEntry = db.prepare(`INSERT INTO entries (fecha, proveedor, factura, codigo, item, cantidad, precio_llegada, precio_venta, iva)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const existing = db.prepare('SELECT * FROM products WHERE codigo=?').get(codigo);

  const tx = db.transaction(() => {
    insertEntry.run(fecha, proveedor || '', factura || '', codigo, item, cantidad, precio_llegada, precio_venta, iva || 0);
    if (existing) {
      db.prepare(`UPDATE products SET stock = stock + ?, precio_compra=?, precio_venta=?, iva=?, item=?, proveedor=? WHERE codigo=?`)
        .run(cantidad, precio_llegada, precio_venta, iva || 0, item, proveedor || '', codigo);
    } else {
      db.prepare(`INSERT INTO products (codigo, item, proveedor, precio_compra, precio_venta, iva, stock, ubicacion)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(codigo, item, proveedor || '', precio_llegada, precio_venta, iva || 0, cantidad, ubicacion || 'bodega');
    }
  });
  tx();
  res.json({ ok: true });
});

// ---- Sales (Salida de mercancia) ----
app.get('/api/sales', (req, res) => {
  res.json(db.prepare('SELECT * FROM sales ORDER BY fecha DESC, id DESC').all());
});

app.post('/api/sales', (req, res) => {
  const { fecha, codigo, cantidad, precio_venta } = req.body;
  if (!fecha || !codigo || !cantidad || !precio_venta) return res.status(400).json({ error: 'Faltan campos requeridos' });

  const product = db.prepare('SELECT * FROM products WHERE codigo=?').get(codigo);
  if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
  if (product.stock < cantidad) return res.status(400).json({ error: 'Stock insuficiente' });

  const precioVenta = parseFloat(precio_venta);
  const ganancia = (precioVenta - product.precio_compra) * cantidad;

  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO sales (fecha, codigo, item, cantidad, precio_venta, precio_compra, ganancia)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(fecha, codigo, product.item, cantidad, precioVenta, product.precio_compra, ganancia);
    db.prepare('UPDATE products SET stock = stock - ? WHERE codigo=?').run(cantidad, codigo);
  });
  tx();
  res.json({ ok: true, ganancia });
});

// ---- Dashboard ----
app.get('/api/dashboard', (req, res) => {
  const totalProducts = db.prepare('SELECT COUNT(*) c FROM products').get().c;
  const totalStockValue = db.prepare('SELECT COALESCE(SUM(stock * precio_compra),0) v FROM products').get().v;
  const totalSalesValue = db.prepare('SELECT COALESCE(SUM(stock * precio_venta),0) v FROM products').get().v;
  const lowStock = db.prepare('SELECT * FROM products WHERE stock <= stock_minimo ORDER BY stock ASC').all();
  const outOfStock = db.prepare('SELECT * FROM products WHERE stock <= 0').all();

  const today = new Date().toISOString().slice(0, 10);
  const ventasHoy = db.prepare("SELECT COALESCE(SUM(cantidad * precio_venta),0) total, COALESCE(SUM(ganancia),0) ganancia, COUNT(*) c FROM sales WHERE fecha=?").get(today);

  const ventasTotales = db.prepare('SELECT COALESCE(SUM(cantidad * precio_venta),0) total, COALESCE(SUM(ganancia),0) ganancia FROM sales').get();

  const topVendidos = db.prepare(`SELECT item, codigo, SUM(cantidad) total_vendido FROM sales GROUP BY codigo ORDER BY total_vendido DESC LIMIT 5`).all();

  res.json({
    totalProducts,
    totalStockValue,
    totalSalesValue,
    lowStock,
    outOfStock,
    ventasHoy,
    ventasTotales,
    topVendidos
  });
});

// ---- Exportar a Excel ----
app.get('/api/export', (req, res) => {
  const products = db.prepare('SELECT codigo, item, proveedor, precio_compra, precio_venta, iva, stock, stock_minimo, ubicacion FROM products ORDER BY item').all();
  const entries = db.prepare('SELECT fecha, proveedor, factura, codigo, item, cantidad, precio_llegada, precio_venta, iva FROM entries ORDER BY fecha DESC, id DESC').all();
  const sales = db.prepare('SELECT fecha, codigo, item, cantidad, precio_venta, precio_compra, ganancia FROM sales ORDER BY fecha DESC, id DESC').all();

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(products), 'Inventario');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(entries), 'Ingresos');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sales), 'Salidas');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const fecha = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Disposition', `attachment; filename="inventario_${fecha}.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
