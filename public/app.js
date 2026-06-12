// --- Tabs ---
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'dashboard') loadDashboard();
    if (btn.dataset.tab === 'productos') loadProductos();
    if (btn.dataset.tab === 'ingreso') loadIngresos();
    if (btn.dataset.tab === 'salida') loadSalidas();
    if (btn.dataset.tab === 'buscar') loadBusqueda('');
  });
});

const money = n => '$' + Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 });

// --- Dashboard ---
async function loadDashboard() {
  const d = await fetch('/api/dashboard').then(r => r.json());
  document.getElementById('d-total-prod').textContent = d.totalProducts;
  document.getElementById('d-valor-costo').textContent = money(d.totalStockValue);
  document.getElementById('d-valor-venta').textContent = money(d.totalSalesValue);
  document.getElementById('d-ventas-hoy').textContent = money(d.ventasHoy.total);
  document.getElementById('d-ganancia-hoy').textContent = money(d.ventasHoy.ganancia);
  document.getElementById('d-ganancia-total').textContent = money(d.ventasTotales.ganancia);

  const lowBody = document.getElementById('d-low-stock');
  lowBody.innerHTML = d.lowStock.length ? d.lowStock.map(p => `
    <tr class="${p.stock <= 0 ? 'out-of-stock' : 'low-stock'}">
      <td>${p.codigo}</td><td>${p.item}</td><td>${p.stock}</td><td>${p.stock_minimo}</td>
      <td><span class="badge ${p.ubicacion}">${p.ubicacion}</span></td>
    </tr>`).join('') : '<tr><td colspan="5">Sin alertas, todo el stock está en buen nivel.</td></tr>';

  const topBody = document.getElementById('d-top-vendidos');
  topBody.innerHTML = d.topVendidos.length ? d.topVendidos.map(p => `
    <tr><td>${p.codigo}</td><td>${p.item}</td><td>${p.total_vendido}</td></tr>`).join('')
    : '<tr><td colspan="3">Aún no hay ventas registradas.</td></tr>';
}

// --- Productos ---
async function loadProductos() {
  const productos = await fetch('/api/products').then(r => r.json());
  const body = document.getElementById('lista-productos');
  body.innerHTML = productos.map(p => `
    <tr class="${p.stock <= 0 ? 'out-of-stock' : (p.stock <= p.stock_minimo ? 'low-stock' : '')}">
      <td>${p.codigo}</td><td>${p.item}</td><td>${p.proveedor || ''}</td>
      <td>${money(p.precio_compra)}</td><td>${money(p.precio_venta)}</td><td>${p.iva}%</td>
      <td>${p.stock}</td><td>${p.stock_minimo}</td>
      <td><span class="badge ${p.ubicacion}">${p.ubicacion}</span></td>
      <td><button class="btn-delete" data-codigo="${p.codigo}">Eliminar</button></td>
    </tr>`).join('');

  body.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm(`¿Eliminar el producto ${btn.dataset.codigo}?`)) {
        await fetch(`/api/products/${btn.dataset.codigo}`, { method: 'DELETE' });
        loadProductos();
      }
    });
  });
}

document.getElementById('form-producto').addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const data = Object.fromEntries(fd.entries());
  const res = await fetch('/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (res.ok) {
    e.target.reset();
    loadProductos();
  } else {
    const err = await res.json();
    alert('Error: ' + err.error);
  }
});

// --- Ingresos ---
async function loadIngresos() {
  const entries = await fetch('/api/entries').then(r => r.json());
  document.getElementById('lista-ingresos').innerHTML = entries.map(e => `
    <tr><td>${e.fecha}</td><td>${e.proveedor}</td><td>${e.factura}</td><td>${e.codigo}</td>
    <td>${e.item}</td><td>${e.cantidad}</td><td>${money(e.precio_llegada)}</td><td>${money(e.precio_venta)}</td><td>${e.iva}%</td></tr>`).join('');
}

document.getElementById('form-ingreso').addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const data = Object.fromEntries(fd.entries());
  const res = await fetch('/api/entries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (res.ok) {
    e.target.reset();
    loadIngresos();
  } else {
    const err = await res.json();
    alert('Error: ' + err.error);
  }
});

// --- Salidas ---
async function loadSalidas() {
  const sales = await fetch('/api/sales').then(r => r.json());
  document.getElementById('lista-salidas').innerHTML = sales.map(s => `
    <tr><td>${s.fecha}</td><td>${s.codigo}</td><td>${s.item}</td><td>${s.cantidad}</td>
    <td>${money(s.precio_venta)}</td><td>${money(s.ganancia)}</td></tr>`).join('');
}

document.getElementById('form-salida').addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const data = Object.fromEntries(fd.entries());
  const msg = document.getElementById('salida-msg');
  const res = await fetch('/api/sales', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const result = await res.json();
  if (res.ok) {
    msg.textContent = `Venta registrada. Ganancia: ${money(result.ganancia)}`;
    msg.className = 'ok';
    e.target.reset();
    loadSalidas();
  } else {
    msg.textContent = 'Error: ' + result.error;
    msg.className = 'error';
  }
});

// --- Buscar ---
async function loadBusqueda(q) {
  const productos = await fetch('/api/products?q=' + encodeURIComponent(q)).then(r => r.json());
  document.getElementById('resultado-busqueda').innerHTML = productos.map(p => {
    const estado = p.stock <= 0 ? '<span class="badge agotado">Agotado</span>' : 'Disponible';
    return `<tr class="${p.stock <= 0 ? 'out-of-stock' : ''}">
      <td>${p.codigo}</td><td>${p.item}</td><td>${p.stock}</td>
      <td><span class="badge ${p.ubicacion}">${p.ubicacion}</span></td>
      <td>${money(p.precio_venta)}</td><td>${estado}</td></tr>`;
  }).join('');
}

document.getElementById('buscar-input').addEventListener('input', e => loadBusqueda(e.target.value));

// Inicial
loadDashboard();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
