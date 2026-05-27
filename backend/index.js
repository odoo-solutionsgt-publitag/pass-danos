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

  const opts = {
    host: url.hostname,
    port: parseInt(port),
    path: path,
  };

  return isSecure
    ? xmlrpc.createSecureClient(opts)
    : xmlrpc.createClient(opts);
}

function odooAuthenticate() {
  return new Promise((resolve, reject) => {
    const client = getOdooClient('/xmlrpc/2/common');
    client.methodCall(
      'authenticate',
      [ODOO.db, ODOO.user, ODOO.password, {}],
      (err, uid) => {
        if (err) return reject(err);
        if (!uid) return reject(new Error('Odoo auth failed: invalid credentials'));
        resolve(uid);
      }
    );
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

// Cache UID para no autenticar en cada request
let cachedUid = null;
let uidTimestamp = 0;
const UID_TTL = 30 * 60 * 1000; // 30 min

async function getUid() {
  const now = Date.now();
  if (cachedUid && (now - uidTimestamp) < UID_TTL) {
    return cachedUid;
  }
  cachedUid = await odooAuthenticate();
  uidTimestamp = now;
  console.log(`[Odoo] Authenticated as UID ${cachedUid}`);
  return cachedUid;
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

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ============================================================
// HEALTH CHECK
// ============================================================

app.get('/health', async (req, res) => {
  const status = { api: 'ok', timestamp: new Date().toISOString() };

  // Test Odoo connection
  try {
    const uid = await getUid();
    status.odoo = { connected: true, uid };
  } catch (err) {
    status.odoo = { connected: false, error: err.message };
  }

  // Test Supabase connection
  if (supabase) {
    try {
      const { count, error } = await supabase
        .from('talleres')
        .select('*', { count: 'exact', head: true });
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

    // Filtrar por categoría de vehículos (categ_id = 2 = "Alquiler")
    // y opcionalmente por status
    const domain = [['rent_ok', '=', true]];

    if (req.query.status) {
      domain.push(['x_studio_status_vehiculo', '=', req.query.status]);
    }

    if (req.query.placa) {
      domain.push(['x_studio_placa_vehiculo_id', 'ilike', req.query.placa]);
    }

    const fields = [
      'id',
      'name',
      'x_studio_placa_vehiculo_id',
      'x_studio_tipo_de_vehiculo',
      'x_studio_status_vehiculo',
      'x_studio_tipo_de_servicio',
      'list_price',
    ];

    const vehiculos = await odooExecute(uid, 'product.template', 'search_read', [domain], {
      fields: fields,
      order: 'x_studio_placa_vehiculo_id asc',
      limit: parseInt(req.query.limit) || 200,
    });

    // Mapear a formato limpio
    const result = vehiculos.map(v => ({
      odoo_id: v.id,
      nombre: v.name,
      placa: v.x_studio_placa_vehiculo_id || '',
      tipo_vehiculo: v.x_studio_tipo_de_vehiculo || '',
      status: v.x_studio_status_vehiculo || '',
      tipo_servicio: v.x_studio_tipo_de_servicio || '',
    }));

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

    // Buscar vehículo por placa
    const vehiculos = await odooExecute(uid, 'product.template', 'search_read', [
      [['x_studio_placa_vehiculo_id', '=', placa]]
    ], {
      fields: [
        'id',
        'name',
        'x_studio_placa_vehiculo_id',
        'x_studio_tipo_de_vehiculo',
        'x_studio_status_vehiculo',
        'x_studio_tipo_de_servicio',
      ],
      limit: 1,
    });

    if (!vehiculos.length) {
      return res.status(404).json({ error: `Vehículo con placa ${placa} no encontrado` });
    }

    const vehiculo = vehiculos[0];

    // Buscar contrato activo (sale.order en estado confirmed/rental)
    let contrato = null;
    try {
      const orders = await odooExecute(uid, 'sale.order', 'search_read', [
        [
          ['order_line.product_template_id', '=', vehiculo.id],
          ['state', 'in', ['sale', 'done']],
          ['is_rental_order', '=', true],
        ]
      ], {
        fields: [
          'id',
          'name',
          'partner_id',
          'date_order',
          'x_studio_numero_contrato',
          'state',
        ],
        order: 'date_order desc',
        limit: 1,
      });

      if (orders.length) {
        const order = orders[0];
        contrato = {
          odoo_id: order.id,
          numero: order.name,
          contrato_numero: order.x_studio_numero_contrato || order.name,
          cliente_id: order.partner_id ? order.partner_id[0] : null,
          cliente_nombre: order.partner_id ? order.partner_id[1] : '',
          fecha_orden: order.date_order,
          estado: order.state,
        };

        // Si hay cliente, traer datos de contacto
        if (contrato.cliente_id) {
          const partners = await odooExecute(uid, 'res.partner', 'read', [
            [contrato.cliente_id]
          ], {
            fields: ['phone', 'mobile', 'email', 'vat'],
          });

          if (partners.length) {
            contrato.cliente_telefono = partners[0].phone || partners[0].mobile || '';
            contrato.cliente_email = partners[0].email || '';
            contrato.cliente_dpi = partners[0].vat || '';
          }
        }
      }
    } catch (err) {
      console.warn('[GET /vehiculo] Error buscando contrato:', err.message);
    }

    res.json({
      vehiculo: {
        odoo_id: vehiculo.id,
        nombre: vehiculo.name,
        placa: vehiculo.x_studio_placa_vehiculo_id || '',
        tipo_vehiculo: vehiculo.x_studio_tipo_de_vehiculo || '',
        status: vehiculo.x_studio_status_vehiculo || '',
        tipo_servicio: vehiculo.x_studio_tipo_de_servicio || '',
      },
      contrato,
    });
  } catch (err) {
    console.error('[GET /vehiculo/:placa]', err.message);
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
      'Disponible',
      'Rentado',
      'Vehículo No Asegurado',
      'En Mantenimiento',
      'Servicios Varios',
      'En Reparación',
      'Asignado al personal',
      'No aplica',
    ];

    if (!status || !VALID_STATUS.includes(status)) {
      return res.status(400).json({
        error: `Status inválido. Valores permitidos: ${VALID_STATUS.join(', ')}`,
      });
    }

    // Actualizar en Odoo
    const result = await odooExecute(uid, 'product.template', 'write', [
      [productId],
      { x_studio_status_vehiculo: status },
    ]);

    if (!result) {
      return res.status(500).json({ error: 'Odoo no confirmó la escritura' });
    }

    console.log(`[PATCH /vehiculo/${productId}/status] → ${status}`);

    res.json({
      success: true,
      odoo_id: productId,
      status,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[PATCH /vehiculo/:id/status]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /contrato/:numero — Buscar contrato por RSV-XXXXX o CTO-XXXXX
// ============================================================

app.get('/contrato/:numero', async (req, res) => {
  try {
    const uid = await getUid();
    const numero = req.params.numero.trim().toUpperCase();

    const orders = await odooExecute(uid, 'sale.order', 'search_read', [
      [
        ['is_rental_order', '=', true],
        '|',
        ['name', '=', numero],
        ['x_studio_numero_contrato', '=', numero],
      ]
    ], {
      fields: ['id', 'name', 'partner_id', 'date_order', 'x_studio_numero_contrato', 'state', 'order_line'],
      order: 'date_order desc',
      limit: 1,
    });

    if (!orders.length) {
      return res.status(404).json({ error: `No se encontró el contrato ${numero}` });
    }

    const order = orders[0];

    // Datos del cliente
    let cliente = { nombre: '', telefono: '', email: '', dpi: '' };
    if (order.partner_id) {
      try {
        const partners = await odooExecute(uid, 'res.partner', 'read', [[order.partner_id[0]]], {
          fields: ['phone', 'mobile', 'email', 'vat'],
        });
        if (partners.length) {
          cliente = {
            nombre: order.partner_id[1],
            telefono: partners[0].phone || partners[0].mobile || '',
            email: partners[0].email || '',
            dpi: partners[0].vat || '',
          };
        }
      } catch (err) {
        console.warn('[GET /contrato] Error leyendo partner:', err.message);
      }
    }

    // Vehículo desde las líneas del pedido
    let vehiculo = null;
    if (order.order_line && order.order_line.length) {
      try {
        const lines = await odooExecute(uid, 'sale.order.line', 'search_read', [
          [['order_id', '=', order.id], ['product_template_id', '!=', false]]
        ], {
          fields: ['product_template_id'],
          limit: 1,
        });

        if (lines.length && lines[0].product_template_id) {
          const productId = lines[0].product_template_id[0];
          const productos = await odooExecute(uid, 'product.template', 'read', [[productId]], {
            fields: ['id', 'name', 'x_studio_placa_vehiculo_id', 'x_studio_tipo_de_vehiculo', 'x_studio_status_vehiculo'],
          });
          if (productos.length) {
            const p = productos[0];
            vehiculo = {
              odoo_id: p.id,
              nombre: p.name,
              placa: p.x_studio_placa_vehiculo_id || '',
              tipo_vehiculo: p.x_studio_tipo_de_vehiculo || '',
              status: p.x_studio_status_vehiculo || '',
            };
          }
        }
      } catch (err) {
        console.warn('[GET /contrato] Error leyendo líneas:', err.message);
      }
    }

    console.log(`[GET /contrato/${numero}] → order ${order.id}, vehiculo: ${vehiculo?.placa ?? 'no encontrado'}`);

    res.json({
      contrato: {
        odoo_id: order.id,
        numero: order.name,
        contrato_numero: order.x_studio_numero_contrato || order.name,
        estado: order.state,
        fecha_orden: order.date_order,
      },
      vehiculo,
      cliente,
    });
  } catch (err) {
    console.error('[GET /contrato/:numero]', err.message);
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

    // Buscar en fleet.vehicle vinculado al product.template
    const fleet = await odooExecute(uid, 'fleet.vehicle', 'search_read', [
      [['x_product_template_id', '=', productId]]
    ], {
      fields: [
        'id',
        'name',
        'license_plate',
        'model_id',
        'model_year',
        'color',
        'vin_sn',
        'odometer',
      ],
      limit: 1,
    });

    if (!fleet.length) {
      return res.status(404).json({ error: 'Vehículo no encontrado en fleet' });
    }

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
