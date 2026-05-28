const express = require('express');
const cors = require('cors');
const xmlrpc = require('xmlrpc');
const { createClient } = require('@supabase/supabase-js');

// ============================================================
// CONFIG
// ============================================================

const PORT = process.env.PORT || 3000;
const TZ = process.env.TZ || 'America/Guatemala';

const ODOO = {
  url: process.env.ODOO_URL || 'https://odoo-server.online',
  db: process.env.ODOO_DB || 'odoo19server',
  user: process.env.ODOO_API_USER,
  password: process.env.ODOO_API_PASSWORD,
};

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'https://gestion-danos.odoo-server.online';

// ============================================================
// SUPABASE CLIENT (service role — bypasses RLS)
// ============================================================

let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  console.log('[Supabase] Client initialized');
}

// ============================================================
// ODOO XML-RPC HELPERS
// ============================================================

function getOdooClient(path) {
  const url = new URL(ODOO.url);
  const isSecure = url.protocol === 'https:';
  const port = url.port || (isSecure ? 443 : 80);
  const opts = { host: url.hostname, port: parseInt(port), path };
  return isSecure ? xmlrpc.createSecureClient(opts) : xmlrpc.createClient(opts);
}

function odooAuthenticate() {
  return new Promise((resolve, reject) => {
    const client = getOdooClient('/xmlrpc/2/common');
    client.methodCall('authenticate', [ODOO.db, ODOO.user, ODOO.password, {}], (err, uid) => {
      if (err) return reject(err);
      if (!uid) return reject(new Error('Odoo auth failed: invalid credentials'));
      resolve(uid);
    });
  });
}

function odooExecute(uid, model, method, args, kwargs = {}) {
  return new Promise((resolve, reject) => {
    const client = getOdooClient('/xmlrpc/2/object');
    client.methodCall(
      'execute_kw',
      [ODOO.db, uid, ODOO.password, model, method, args, kwargs],
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );
  });
}

let cachedUid = null;
let uidTimestamp = 0;
const UID_TTL = 30 * 60 * 1000;

async function getUid() {
  const now = Date.now();
  if (cachedUid && (now - uidTimestamp) < UID_TTL) return cachedUid;
  cachedUid = await odooAuthenticate();
  uidTimestamp = now;
  console.log(`[Odoo] Authenticated as UID ${cachedUid}`);
  return cachedUid;
}

// Helper: obtener vehículo desde líneas de un pedido de venta
// Helper: parsear nombre del producto Odoo para extraer marca / línea / año
// Formato observado: "P-006KXB TOYOTA PICK UP HI LUX 2025 - AUTO PLATEADO METALICO"
//                    "P-091LCM TOYOTA AGYA 2025 BLANCO"
//                    "TOYOTA YARIS 2023"
function parseProductName(name, placa) {
  if (!name) return { marca: '', linea: '', anio: null };

  let s = name.trim();
  if (placa && s.toUpperCase().startsWith(placa.toUpperCase())) {
    s = s.slice(placa.length).trim();
  }
  // Quita color/notas después del primer guión
  const dashIdx = s.indexOf(' - ');
  if (dashIdx > -1) s = s.slice(0, dashIdx).trim();

  // Extrae el año (4 dígitos entre 1990 y current_year+1)
  const yearMatch = s.match(/\b(19|20)\d{2}\b/);
  const anio = yearMatch ? parseInt(yearMatch[0]) : null;
  if (yearMatch) s = s.replace(yearMatch[0], '').trim();

  // Quita texto residual de color al final si quedó
  s = s.replace(/\s+(BLANCO|NEGRO|GRIS|ROJO|AZUL|PLATEADO|METALICO|VERDE|BEIGE|CAFE)\b.*$/i, '').trim();

  // Primer token = marca; resto = línea
  const tokens = s.split(/\s+/).filter(Boolean);
  const marca = tokens[0] || '';
  const linea = tokens.slice(1).join(' ').trim();

  return { marca, linea, anio };
}

async function getVehiculoFromOrder(uid, orderId, orderLines) {
  if (!orderLines || !orderLines.length) return null;
  try {
    const lines = await odooExecute(uid, 'sale.order.line', 'search_read', [
      [['order_id', '=', orderId], ['product_template_id', '!=', false]]
    ], { fields: ['product_template_id'], limit: 1 });

    if (!lines.length || !lines[0].product_template_id) return null;

    const productId = lines[0].product_template_id[0];
    const productos = await odooExecute(uid, 'product.template', 'read', [[productId]], {
      fields: ['id', 'name', 'default_code', 'x_studio_tipo_de_vehiculo', 'x_studio_status_vehiculo'],
    });

    if (!productos.length) return null;
    const p = productos[0];
    const parsed = parseProductName(p.name, p.default_code);
    return {
      odoo_id: p.id,
      nombre: p.name,
      placa: p.default_code || '',
      tipo_vehiculo: p.x_studio_tipo_de_vehiculo || '',
      status: p.x_studio_status_vehiculo || '',
      marca: parsed.marca,
      linea: parsed.linea,
      anio: parsed.anio,
    };
  } catch (err) {
    console.warn('[getVehiculoFromOrder] Error:', err.message);
    return null;
  }
}

// Helper: obtener datos de cliente desde res.partner
async function getClienteFromPartner(uid, partnerId, partnerName) {
  if (!partnerId) return { nombre: '', telefono: '', email: '', dpi: '', nit: '' };
  try {
    const partners = await odooExecute(uid, 'res.partner', 'read', [[partnerId]], {
      fields: ['phone', 'mobile', 'email', 'vat', 'x_studio_dpipasaporte_cliente'],
    });
    if (!partners.length) return { nombre: partnerName || '', telefono: '', email: '', dpi: '', nit: '' };
    return {
      nombre: partnerName || '',
      telefono: partners[0].phone || partners[0].mobile || '',
      email: partners[0].email || '',
      dpi: partners[0].x_studio_dpipasaporte_cliente || '',
      nit: partners[0].vat || '',
    };
  } catch (err) {
    console.warn('[getClienteFromPartner] Error:', err.message);
    return { nombre: partnerName || '', telefono: '', email: '', dpi: '', nit: '' };
  }
}

// ============================================================
// EXPRESS APP
// ============================================================

const app = express();

app.use(cors({
  origin: CORS_ORIGIN.split(',').map(s => s.trim()),
  methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ============================================================
// HEALTH CHECK
// ============================================================

app.get('/health', async (req, res) => {
  const status = { api: 'ok', timestamp: new Date().toISOString() };
  try {
    const uid = await getUid();
    status.odoo = { connected: true, uid };
  } catch (err) {
    status.odoo = { connected: false, error: err.message };
  }
  if (supabase) {
    try {
      const { count, error } = await supabase.from('talleres').select('*', { count: 'exact', head: true });
      status.supabase = { connected: !error, talleres: count };
    } catch (err) {
      status.supabase = { connected: false, error: err.message };
    }
  }
  res.json(status);
});

// ============================================================
// GET /vehiculos — Lista de vehículos desde Odoo
// ============================================================

app.get('/vehiculos', async (req, res) => {
  try {
    const uid = await getUid();
    const domain = [
      ['rent_ok', '=', true],
      ['categ_id', '=', 2],
      ['x_studio_tipo_de_vehiculo', '!=', 'Cotización'],
    ];
    if (req.query.status) domain.push(['x_studio_status_vehiculo', '=', req.query.status]);
    if (req.query.placa) domain.push(['default_code', 'ilike', req.query.placa]);

    const vehiculos = await odooExecute(uid, 'product.template', 'search_read', [domain], {
      fields: ['id', 'name', 'default_code', 'x_studio_tipo_de_vehiculo', 'x_studio_status_vehiculo', 'x_studio_tipo_de_servicio', 'categ_id'],
      order: 'default_code asc',
      limit: parseInt(req.query.limit) || 200,
    });

    const result = vehiculos.map(v => {
      const parsed = parseProductName(v.name, v.default_code);
      return {
        odoo_id: v.id,
        nombre: v.name,
        placa: v.default_code || '',
        tipo_vehiculo: v.x_studio_tipo_de_vehiculo || '',
        status: v.x_studio_status_vehiculo || '',
        tipo_servicio: v.x_studio_tipo_de_servicio || '',
        marca: parsed.marca,
        linea: parsed.linea,
        anio: parsed.anio,
      };
    });

    res.json({ count: result.length, vehiculos: result });
  } catch (err) {
    console.error('[GET /vehiculos]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /vehiculo/:placa — Detalle de vehículo + contrato activo
// ============================================================

app.get('/vehiculo/:placa', async (req, res) => {
  try {
    const uid = await getUid();
    const placa = req.params.placa.toUpperCase();

    const vehiculos = await odooExecute(uid, 'product.template', 'search_read', [
      [['default_code', '=', placa]]
    ], {
      fields: ['id', 'name', 'default_code', 'x_studio_tipo_de_vehiculo', 'x_studio_status_vehiculo'],
      limit: 1,
    });

    if (!vehiculos.length) {
      return res.status(404).json({ error: `Vehículo con placa ${placa} no encontrado` });
    }

    const vehiculo = vehiculos[0];

    let contrato = null;
    try {
      const orders = await odooExecute(uid, 'sale.order', 'search_read', [
        [
          ['order_line.product_template_id', '=', vehiculo.id],
          ['state', 'in', ['sale', 'done']],
          ['is_rental_order', '=', true],
        ]
      ], {
        fields: ['id', 'name', 'partner_id', 'date_order', 'state', 'order_line'],
        order: 'date_order desc',
        limit: 1,
      });

      if (orders.length) {
        const order = orders[0];
        const cliente = await getClienteFromPartner(uid, order.partner_id?.[0], order.partner_id?.[1]);
        contrato = {
          odoo_id: order.id,
          numero: order.name,
          contrato_numero: order.name,
          cliente_id: order.partner_id?.[0] ?? null,
          cliente_nombre: cliente.nombre,
          cliente_telefono: cliente.telefono,
          cliente_email: cliente.email,
          cliente_dpi: cliente.dpi,
          fecha_orden: order.date_order,
          estado: order.state,
        };
      }
    } catch (err) {
      console.warn('[GET /vehiculo] Error buscando contrato:', err.message);
    }

    const parsed = parseProductName(vehiculo.name, vehiculo.default_code);
    res.json({
      vehiculo: {
        odoo_id: vehiculo.id,
        nombre: vehiculo.name,
        placa: vehiculo.default_code || '',
        tipo_vehiculo: vehiculo.x_studio_tipo_de_vehiculo || '',
        status: vehiculo.x_studio_status_vehiculo || '',
        marca: parsed.marca,
        linea: parsed.linea,
        anio: parsed.anio,
      },
      contrato,
    });
  } catch (err) {
    console.error('[GET /vehiculo/:placa]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /contratos?q=394 — Búsqueda rápida de contratos (lista)
// ============================================================

app.get('/contratos', async (req, res) => {
  try {
    const uid = await getUid();
    const q = (req.query.q || '').trim().toUpperCase();
    if (!q || q.length < 2) return res.json({ contratos: [] });

    const orders = await odooExecute(uid, 'sale.order', 'search_read', [
      [
        ['is_rental_order', '=', true],
        ['state', 'in', ['sale', 'done']],
        ['name', 'ilike', q],
      ]
    ], {
      fields: ['id', 'name', 'partner_id', 'date_order', 'state'],
      order: 'date_order desc',
      limit: 10,
    });

    res.json({
      contratos: orders.map(o => ({
        odoo_id: o.id,
        numero: o.name,
        cliente_nombre: o.partner_id ? o.partner_id[1] : '',
        fecha_orden: o.date_order,
        estado: o.state,
      }))
    });
  } catch (err) {
    console.error('[GET /contratos]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /contratos/:id — Detalle completo por odoo_id
// ============================================================

app.get('/contratos/:id', async (req, res) => {
  try {
    const uid = await getUid();
    const orderId = parseInt(req.params.id);
    if (isNaN(orderId)) return res.status(400).json({ error: 'ID inválido' });

    const orders = await odooExecute(uid, 'sale.order', 'read', [[orderId]], {
      fields: ['id', 'name', 'partner_id', 'date_order', 'state', 'order_line'],
    });

    if (!orders.length) return res.status(404).json({ error: `Contrato ${orderId} no encontrado` });

    const order = orders[0];
    const cliente = await getClienteFromPartner(uid, order.partner_id?.[0], order.partner_id?.[1]);
    const vehiculo = await getVehiculoFromOrder(uid, orderId, order.order_line);

    console.log(`[GET /contratos/${orderId}] → ${order.name}, vehiculo: ${vehiculo?.placa ?? 'sin vehículo'}`);

    res.json({
      contrato: {
        odoo_id: order.id,
        numero: order.name,
        contrato_numero: order.name,
        estado: order.state,
        fecha_orden: order.date_order,
      },
      vehiculo,
      cliente,
    });
  } catch (err) {
    console.error('[GET /contratos/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// PATCH /vehiculo/:id/status — Cambiar x_studio_status_vehiculo
// ============================================================

app.patch('/vehiculo/:id/status', async (req, res) => {
  try {
    const uid = await getUid();
    const productId = parseInt(req.params.id);
    const { status } = req.body;

    const VALID_STATUS = [
      'Disponible', 'Rentado', 'Vehículo No Asegurado',
      'En Mantenimiento', 'Servicios Varios', 'En Reparación',
      'Asignado al personal', 'No aplica',
    ];

    if (!status || !VALID_STATUS.includes(status)) {
      return res.status(400).json({ error: `Status inválido. Valores permitidos: ${VALID_STATUS.join(', ')}` });
    }

    const result = await odooExecute(uid, 'product.template', 'write', [
      [productId], { x_studio_status_vehiculo: status },
    ]);

    if (!result) return res.status(500).json({ error: 'Odoo no confirmó la escritura' });

    console.log(`[PATCH /vehiculo/${productId}/status] → ${status}`);
    res.json({ success: true, odoo_id: productId, status, updated_at: new Date().toISOString() });
  } catch (err) {
    console.error('[PATCH /vehiculo/:id/status]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /vehiculo/:id/fleet — Datos de flota (fleet.vehicle)
// ============================================================

app.get('/vehiculo/:id/fleet', async (req, res) => {
  try {
    const uid = await getUid();
    const productId = parseInt(req.params.id);

    const fleet = await odooExecute(uid, 'fleet.vehicle', 'search_read', [
      [['x_product_template_id', '=', productId]]
    ], {
      fields: ['id', 'name', 'license_plate', 'model_id', 'model_year', 'color', 'vin_sn', 'odometer'],
      limit: 1,
    });

    if (!fleet.length) return res.status(404).json({ error: 'Vehículo no encontrado en fleet' });

    const v = fleet[0];
    res.json({
      fleet_id: v.id,
      nombre: v.name,
      placa: v.license_plate || '',
      modelo: v.model_id ? v.model_id[1] : '',
      anio: v.model_year || '',
      color: v.color || '',
      vin: v.vin_sn || '',
      odometro: v.odometer || 0,
    });
  } catch (err) {
    console.error('[GET /vehiculo/:id/fleet]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(50));
  console.log(`Pass Danos API v1.0.0`);
  console.log(`Port: ${PORT}`);
  console.log(`Odoo: ${ODOO.url} (db: ${ODOO.db})`);
  console.log(`CORS: ${CORS_ORIGIN}`);
  console.log(`Supabase: ${SUPABASE_URL ? 'configured' : 'NOT configured'}`);
  console.log(`TZ: ${TZ}`);
  console.log('='.repeat(50));
});
