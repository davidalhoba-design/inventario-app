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
let todosLosProductos = [];

async function loadProductos(filtro = '') {
  todosLosProductos = await fetch('/api/products').then(r => r.json());
  renderProductos(filtro);
}

function val(v, fmt) { return (v && Number(v) > 0) ? fmt(v) : '<span class="pc-pendiente">Sin completar</span>'; }

function renderProductos(filtro = '') {
  const q = filtro.toLowerCase();
  const lista = q
    ? todosLosProductos.filter(p => p.codigo.toLowerCase().includes(q) || p.item.toLowerCase().includes(q) || (p.proveedor||'').toLowerCase().includes(q))
    : todosLosProductos;

  // --- Tabla desktop ---
  const body = document.getElementById('lista-productos');
  body.innerHTML = lista.map(p => `
    <tr class="${p.stock <= 0 ? 'out-of-stock' : (p.stock <= p.stock_minimo ? 'low-stock' : '')}">
      <td>${p.codigo}</td>
      <td>${p.item}</td>
      <td>${p.proveedor || ''}</td>
      <td>${val(p.precio_compra, money)}</td>
      <td>${val(p.precio_venta, money)}</td>
      <td>${Number(p.iva) > 0 ? p.iva+'%' : '<span class="pc-pendiente">—</span>'}</td>
      <td>${p.stock}</td><td>${p.stock_minimo}</td>
      <td><span class="badge ${p.ubicacion}">${p.ubicacion}</span></td>
      <td style="white-space:nowrap;">
        <button class="btn-edit" data-codigo="${p.codigo}" style="background:#2563eb;color:#fff;border:none;padding:0.3rem 0.6rem;border-radius:4px;cursor:pointer;font-size:0.8rem;margin-right:4px;">✏️</button>
        <button class="btn-delete" data-codigo="${p.codigo}">🗑️</button>
      </td>
    </tr>`).join('');

  // --- Tarjetas móvil ---
  const cards = document.getElementById('lista-productos-cards');
  cards.innerHTML = lista.map(p => `
    <div class="producto-card ${p.stock <= 0 ? 'out-of-stock' : (p.stock <= p.stock_minimo ? 'low-stock' : '')}">
      <div class="pc-titulo">${p.item}</div>
      <div class="pc-codigo">Cód: ${p.codigo} &nbsp;|&nbsp; Ref: ${p.proveedor || '—'}</div>
      <div class="pc-fila"><span>P. Llegada</span><span>${val(p.precio_compra, money)}</span></div>
      <div class="pc-fila"><span>P. Venta</span><span>${val(p.precio_venta, money)}</span></div>
      <div class="pc-fila"><span>IVA</span><span>${Number(p.iva) > 0 ? p.iva+'%' : '<span class="pc-pendiente">—</span>'}</span></div>
      <div class="pc-fila"><span>Stock</span><span>${p.stock}</span></div>
      <div class="pc-fila"><span>Ubicación</span><span><span class="badge ${p.ubicacion}">${p.ubicacion}</span></span></div>
      <div class="pc-acciones">
        <button class="btn-edit" data-codigo="${p.codigo}" style="background:#2563eb;color:#fff;">✏️ Editar</button>
        <button class="btn-delete" data-codigo="${p.codigo}" style="background:#ef4444;color:#fff;">🗑️ Eliminar</button>
      </div>
    </div>`).join('');

  // Eventos compartidos para tabla y tarjetas
  document.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => abrirEditar(btn.dataset.codigo));
  });
  document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm(`¿Eliminar el producto ${btn.dataset.codigo}?`)) {
        await fetch(`/api/products/${btn.dataset.codigo}`, { method: 'DELETE' });
        loadProductos(document.getElementById('filtro-productos').value);
      }
    });
  });
}

document.getElementById('filtro-productos').addEventListener('input', e => renderProductos(e.target.value));

function abrirEditar(codigo) {
  const p = todosLosProductos.find(x => x.codigo === codigo);
  if (!p) return;
  const f = document.getElementById('form-editar');
  f.codigo.value = p.codigo;
  f.item.value = p.item;
  f.proveedor.value = p.proveedor || '';
  f.precio_compra.value = p.precio_compra || '';
  f.precio_venta.value = p.precio_venta || '';
  f.iva.value = p.iva || 0;
  f.stock.value = p.stock;
  f.stock_minimo.value = p.stock_minimo;
  f.ubicacion.value = p.ubicacion || 'bodega';
  const modal = document.getElementById('modal-editar');
  modal.style.display = 'flex';
}

document.getElementById('btn-cerrar-modal').addEventListener('click', () => {
  document.getElementById('modal-editar').style.display = 'none';
});

document.getElementById('modal-editar').addEventListener('click', e => {
  if (e.target === document.getElementById('modal-editar'))
    document.getElementById('modal-editar').style.display = 'none';
});

document.getElementById('form-editar').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  const codigo = f.codigo.value;
  const data = {
    item: f.item.value,
    proveedor: f.proveedor.value,
    precio_compra: parseFloat(f.precio_compra.value) || 0,
    precio_venta: parseFloat(f.precio_venta.value) || 0,
    iva: parseFloat(f.iva.value) || 0,
    stock: parseInt(f.stock.value) || 0,
    stock_minimo: parseInt(f.stock_minimo.value) || 5,
    ubicacion: f.ubicacion.value
  };
  const res = await fetch(`/api/products/${codigo}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (res.ok) {
    document.getElementById('modal-editar').style.display = 'none';
    loadProductos(document.getElementById('filtro-productos').value);
  } else {
    alert('Error al guardar');
  }
});

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

// Auto-llenar item al escribir codigo en salida
document.getElementById('salida-codigo').addEventListener('blur', async () => {
  const codigo = document.getElementById('salida-codigo').value.trim();
  if (!codigo) return;
  const productos = await fetch('/api/products?q=' + encodeURIComponent(codigo)).then(r => r.json());
  const producto = productos.find(p => p.codigo === codigo);
  document.getElementById('salida-item').value = producto ? producto.item : '';
});

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
      <td>${money(p.precio_compra)}</td><td>${estado}</td></tr>`;
  }).join('');
}

document.getElementById('buscar-input').addEventListener('input', e => loadBusqueda(e.target.value));

// Inicial
loadDashboard();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
