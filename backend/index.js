const express = require('express');
const cors = require('cors');
const xmlrpc = require('xmlrpc');
const jwt = require('jsonwebtoken');
const { v5: uuidv5 } = require('uuid');
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
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
const ODOO_DANOS_NAMESPACE_UUID = process.env.ODOO_DANOS_NAMESPACE_UUID;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'https://gestion-danos.odoo-server.online';
const BITACORA_BASE_URL = (process.env.BITACORA_BASE_URL || CORS_ORIGIN.split(',')[0].trim()) + '/bitacora';

// ============================================================
// SUPABASE CLIENT (service role — bypasses RLS)
// ============================================================

let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  console.log('[Supabase] Client initialized (service role)');
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

// Autentica con credenciales arbitrarias (NO el API user) — para SSO de usuarios finales.
// Retorna el uid de Odoo si las credenciales son válidas, o null si no lo son.
function odooAuthenticateAs(login, password) {
  return new Promise((resolve, reject) => {
    const client = getOdooClient('/xmlrpc/2/common');
    client.methodCall('authenticate', [ODOO.db, login, password, {}], (err, uid) => {
      if (err) return reject(err);
      resolve(uid || null);
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
  const vacio = { nombre: '', telefono: '', email: '', dpi: '', nit: '', direccion: '' };
  if (!partnerId) return vacio;
  try {
    const partners = await odooExecute(uid, 'res.partner', 'read', [[partnerId]], {
      fields: [
        'name', 'phone', 'mobile', 'email', 'vat',
        'x_studio_dpipasaporte_cliente',
        'street', 'street2', 'city',
        'is_company', 'child_ids',
      ],
    });
    if (!partners.length) return { ...vacio, nombre: partnerName || '' };
    const p = partners[0];

    const resultado = {
      nombre:    partnerName || p.name || '',
      telefono:  p.phone || p.mobile || '',
      email:     p.email || '',
      dpi:       p.x_studio_dpipasaporte_cliente || '',
      nit:       p.vat || '',
      direccion: [p.street, p.street2, p.city].filter(Boolean).join(', '),
    };

    // Fallback empresa → contactos hijos para teléfono/email
    if (p.is_company && Array.isArray(p.child_ids) && p.child_ids.length > 0 &&
        (!resultado.telefono || !resultado.email)) {
      try {
        const hijos = await odooExecute(uid, 'res.partner', 'read', [p.child_ids], {
          fields: ['name', 'phone', 'mobile', 'email', 'type', 'function'],
        });
        const contacto = hijos.find(h =>
          (h.type === 'contact' || !h.type) && (h.phone || h.mobile || h.email)
        );
        if (contacto) {
          resultado.telefono = resultado.telefono || contacto.phone || contacto.mobile || '';
          resultado.email    = resultado.email    || contacto.email                       || '';
        }
      } catch (errHijos) {
        console.warn('[getClienteFromPartner] Error leyendo child_ids:', errHijos.message);
      }
    }

    return resultado;
  } catch (err) {
    console.warn('[getClienteFromPartner] Error:', err.message);
    return { ...vacio, nombre: partnerName || '' };
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
// POST /auth/odoo — SSO: autentica con credenciales Odoo y devuelve
// un JWT compatible con Supabase para el frontend.
// ============================================================

app.post('/auth/odoo', async (req, res) => {
  const { login, password } = req.body || {};
  if (!login || !password) {
    return res.status(400).json({ error: 'Correo y contraseña requeridos' });
  }
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase no configurado en backend' });
  }
  if (!SUPABASE_JWT_SECRET || !ODOO_DANOS_NAMESPACE_UUID) {
    return res.status(500).json({ error: 'SSO no configurado (faltan SUPABASE_JWT_SECRET o ODOO_DANOS_NAMESPACE_UUID)' });
  }

  try {
    // 1. Autenticar las credenciales contra Odoo
    const userUid = await odooAuthenticateAs(login.trim(), password);
    if (!userUid) {
      return res.status(401).json({ error: 'Credenciales incorrectas en Odoo' });
    }

    // 2. Leer el res.users con el API user (con permisos completos para read)
    const adminUid = await getUid();
    const users = await odooExecute(adminUid, 'res.users', 'read', [[userUid]], {
      fields: ['name', 'login', 'email', 'x_can_access_danos', 'active'],
    });
    if (!users.length) {
      return res.status(403).json({ error: 'Usuario no encontrado en Odoo' });
    }
    const u = users[0];
    if (!u.active) {
      return res.status(403).json({ error: 'Usuario desactivado en Odoo' });
    }
    if (!u.x_can_access_danos) {
      return res.status(403).json({ error: 'No tiene permiso para acceder a Gestión de Daños. Solicite al administrador habilitar el acceso en su ficha de usuario de Odoo.' });
    }

    const userEmail = u.email || u.login;

    // 3. Calcular UUID determinístico para auth.users
    const userId = uuidv5(`odoo:${userUid}`, ODOO_DANOS_NAMESPACE_UUID);

    // 4. Crear / actualizar usuario en auth.users y perfiles
    await ensureSupabaseUser({ userId, email: userEmail, nombre: u.name });

    // 5. Firmar JWT compatible con Supabase
    const now = Math.floor(Date.now() / 1000);
    const expSec = now + 3600; // 1 hora
    const accessToken = jwt.sign({
      iss: 'supabase',
      sub: userId,
      aud: 'authenticated',
      role: 'authenticated',
      iat: now,
      exp: expSec,
      email: userEmail,
      user_metadata: {
        nombre: u.name,
        odoo_uid: userUid,
      },
      app_metadata: { provider: 'odoo' },
    }, SUPABASE_JWT_SECRET, { algorithm: 'HS256' });

    console.log(`[POST /auth/odoo] OK — ${u.login} (Odoo uid=${userUid})`);

    res.json({
      access_token: accessToken,
      refresh_token: accessToken, // sin refresh real — el TTL fuerza re-login
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: expSec,
      user: {
        id: userId,
        email: userEmail,
        nombre: u.name,
        odoo_uid: userUid,
      },
    });
  } catch (err) {
    console.error('[POST /auth/odoo]', err.message);
    res.status(500).json({ error: err.message });
  }
});

async function ensureSupabaseUser({ userId, email, nombre }) {
  // 1. Verificar si el usuario ya existe en auth.users (por UUID)
  const getRes = await supabase.auth.admin.getUserById(userId);
  // getUserById devuelve { data: { user }, error } — error si no existe
  const existing = getRes.data?.user || null;

  if (existing) {
    console.log(`[ensureSupabaseUser] User ${userId} ya existe en auth.users`);
    // Actualizar si cambió
    if (existing.email !== email || existing.user_metadata?.nombre !== nombre) {
      const upd = await supabase.auth.admin.updateUserById(userId, {
        email,
        user_metadata: { nombre, provider: 'odoo' },
      });
      if (upd.error) {
        console.warn('[ensureSupabaseUser] updateUserById warning:', upd.error.message);
      }
    }
  } else {
    // 1a. Verificar si ya existe alguien con ese email (id distinto)
    const listRes = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
    const conflictByEmail = listRes.data?.users?.find(u => u.email === email);

    if (conflictByEmail) {
      // Existe con otro UUID — reutilizamos ese UUID en vez de crear duplicado
      console.log(`[ensureSupabaseUser] User con email ${email} ya existía con id ${conflictByEmail.id}, reutilizando`);
      // Actualizar el sub mapping: no, no podemos cambiar ids. Solo aceptar el existente.
      // Para que la firma del JWT use ese UUID en vez del nuestro, hay que retornarlo.
      throw new Error(
        `Un usuario con email ${email} ya existe con id ${conflictByEmail.id}. ` +
        `Esto puede pasar si el usuario fue creado manualmente antes. ` +
        `Solución: borrar manualmente ese usuario en Supabase Auth o ajustar el namespace UUID.`
      );
    }

    // 1b. Crear el usuario con UUID determinístico
    const createRes = await supabase.auth.admin.createUser({
      id: userId,
      email,
      email_confirm: true,
      user_metadata: { nombre, provider: 'odoo' },
    });
    if (createRes.error) {
      console.error('[ensureSupabaseUser] createUser ERROR:', createRes.error);
      throw new Error(`No se pudo crear el usuario en Supabase: ${createRes.error.message}`);
    }
    if (!createRes.data?.user) {
      throw new Error('createUser no devolvió usuario');
    }
    console.log(`[ensureSupabaseUser] CREADO auth.users ${userId} (${email})`);
  }

  // 2. Asegurar fila en perfiles — los nuevos usuarios SSO entran como
  //    readonly por defecto. Admin los promueve después desde /usuarios.
  const perfilRes = await supabase.from('perfiles').select('id, rol, activo, permisos').eq('id', userId).maybeSingle();
  if (perfilRes.error) {
    console.error('[ensureSupabaseUser] perfiles select error:', perfilRes.error);
    throw new Error(`Error consultando perfil: ${perfilRes.error.message}`);
  }

  if (!perfilRes.data) {
    const insRes = await supabase.from('perfiles').insert({
      id: userId,
      nombre_completo: nombre,
      rol: 'readonly',
      activo: true,
      permisos: { crear: false, editar: false, ver: true, eliminar: false },
    });
    if (insRes.error) {
      console.error('[ensureSupabaseUser] perfiles insert error:', insRes.error);
      throw new Error(`Error creando perfil: ${insRes.error.message}`);
    }
    console.log(`[ensureSupabaseUser] Created perfiles row for ${userId} (rol=readonly)`);
  } else if (!perfilRes.data.activo) {
    throw new Error('Perfil desactivado en la app. Contacte al administrador.');
  }
}

// ============================================================
// POST /odoo/sync-bitacora — Pone la URL de bitácora en el campo
// x_studio_bitacora_de_servicios del product.template del vehículo.
// Body: { placa } o { odoo_product_id } (al menos uno)
// ============================================================

app.post('/odoo/sync-bitacora', async (req, res) => {
  const { placa, odoo_product_id } = req.body || {};
  if (!placa && !odoo_product_id) {
    return res.status(400).json({ error: 'Se requiere placa u odoo_product_id' });
  }

  try {
    const uid = await getUid();
    let productId = odoo_product_id;
    let placaUp = placa ? placa.toUpperCase() : null;

    // Si no nos dieron el id, buscar por placa
    if (!productId) {
      const found = await odooExecute(uid, 'product.template', 'search_read', [
        [['default_code', '=', placaUp]]
      ], { fields: ['id', 'default_code'], limit: 1 });
      if (!found.length) {
        return res.status(404).json({ error: `Vehículo ${placaUp} no encontrado en Odoo` });
      }
      productId = found[0].id;
      placaUp = found[0].default_code;
    } else if (!placaUp) {
      // Si nos dieron el id pero no la placa, leerla
      const prod = await odooExecute(uid, 'product.template', 'read', [[productId]], {
        fields: ['default_code'],
      });
      if (!prod.length) {
        return res.status(404).json({ error: `Product ${productId} no encontrado` });
      }
      placaUp = prod[0].default_code;
    }

    const url = `${BITACORA_BASE_URL}/${placaUp}`;

    const ok = await odooExecute(uid, 'product.template', 'write', [
      [productId], { x_studio_bitacora_de_servicios: url }
    ]);
    if (!ok) {
      return res.status(500).json({ error: 'Odoo no confirmó la escritura' });
    }

    console.log(`[POST /odoo/sync-bitacora] ${placaUp} (id=${productId}) → ${url}`);
    res.json({ success: true, odoo_product_id: productId, placa: placaUp, url });
  } catch (err) {
    console.error('[POST /odoo/sync-bitacora]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /odoo/sync-bitacora-all — Pobla el campo en TODOS los vehículos
// de la flota (rent_ok=true AND categ_id=2). Útil para inicialización.
// ============================================================

app.post('/odoo/sync-bitacora-all', async (req, res) => {
  try {
    const uid = await getUid();
    const products = await odooExecute(uid, 'product.template', 'search_read', [
      [
        ['rent_ok', '=', true],
        ['categ_id', '=', 2],
        ['default_code', '!=', false],
      ]
    ], { fields: ['id', 'default_code'], limit: 1000 });

    let updated = 0;
    const errors = [];
    for (const p of products) {
      if (!p.default_code) continue;
      try {
        const url = `${BITACORA_BASE_URL}/${p.default_code}`;
        await odooExecute(uid, 'product.template', 'write', [
          [p.id], { x_studio_bitacora_de_servicios: url }
        ]);
        updated += 1;
      } catch (err) {
        errors.push({ id: p.id, placa: p.default_code, error: err.message });
      }
    }

    console.log(`[POST /odoo/sync-bitacora-all] ${updated}/${products.length} actualizados`);
    res.json({
      success: true,
      total_found: products.length,
      updated,
      errors,
      base_url: BITACORA_BASE_URL,
    });
  } catch (err) {
    console.error('[POST /odoo/sync-bitacora-all]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /siniestros/:id/refresh-cliente
// Re-extrae los datos del cliente desde Odoo (res.partner) y los
// actualiza en el siniestro. Útil cuando se completan campos en
// Odoo después de haber registrado el daño.
// ============================================================

app.post('/siniestros/:id/refresh-cliente', async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'id requerido' });
  if (!supabase) return res.status(500).json({ error: 'Supabase no configurado' });

  try {
    // 1. Leer el siniestro
    const sinRes = await supabase
      .from('siniestros')
      .select('id, numero, contrato_id, cliente_nombre')
      .eq('id', id)
      .maybeSingle();
    if (sinRes.error) throw sinRes.error;
    if (!sinRes.data) return res.status(404).json({ error: 'Siniestro no encontrado' });

    const sin = sinRes.data;
    if (!sin.contrato_id) {
      return res.status(400).json({ error: 'El siniestro no tiene contrato vinculado en Odoo' });
    }

    // 2. Releer el contrato en Odoo
    const uid = await getUid();
    const orders = await odooExecute(uid, 'sale.order', 'read', [[sin.contrato_id]], {
      fields: ['id', 'name', 'x_studio_no_contrato', 'partner_id'],
    });
    if (!orders.length) {
      return res.status(404).json({ error: `Contrato ${sin.contrato_id} no encontrado en Odoo` });
    }
    const order = orders[0];
    if (!order.partner_id) {
      return res.status(404).json({ error: 'El contrato no tiene cliente vinculado' });
    }

    // 3. Obtener datos frescos del partner
    const cliente = await getClienteFromPartner(uid, order.partner_id[0], order.partner_id[1]);

    // 4. Actualizar siniestro con los datos frescos (sin tocar nombre si ya estaba bien)
    const updateData = {
      cliente_nombre:     cliente.nombre || sin.cliente_nombre,
      cliente_dpi:        cliente.dpi       || null,
      cliente_nit:        cliente.nit       || null,
      cliente_telefono:   cliente.telefono  || null,
      cliente_email:      cliente.email     || null,
      cliente_direccion:  cliente.direccion || null,
      reservacion_numero: order.name        || null,
      contrato_numero:    order.x_studio_no_contrato || null,
    };
    const updRes = await supabase.from('siniestros').update(updateData).eq('id', id);
    if (updRes.error) throw updRes.error;

    console.log(`[POST /siniestros/${id}/refresh-cliente] ${sin.numero} → cliente refrescado`);
    res.json({
      success: true,
      siniestro_id: id,
      numero: sin.numero,
      cliente: updateData,
      partner_id: order.partner_id[0],
    });
  } catch (err) {
    console.error('[POST /siniestros/:id/refresh-cliente]', err.message);
    res.status(500).json({ error: err.message });
  }
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
        fields: ['id', 'name', 'x_studio_no_contrato', 'partner_id', 'date_order', 'state', 'order_line'],
        order: 'date_order desc',
        limit: 1,
      });

      if (orders.length) {
        const order = orders[0];
        const cliente = await getClienteFromPartner(uid, order.partner_id?.[0], order.partner_id?.[1]);
        contrato = {
          odoo_id: order.id,
          numero: order.name,
          reservacion_numero: order.name,
          contrato_numero: order.x_studio_no_contrato || null,
          cliente_id: order.partner_id?.[0] ?? null,
          cliente_nombre: cliente.nombre,
          cliente_telefono: cliente.telefono,
          cliente_email: cliente.email,
          cliente_dpi: cliente.dpi,
          cliente_nit: cliente.nit,
          cliente_direccion: cliente.direccion,
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
        '|',
          ['name', 'ilike', q],
          ['x_studio_no_contrato', 'ilike', q],
      ]
    ], {
      fields: ['id', 'name', 'x_studio_no_contrato', 'partner_id', 'date_order', 'state'],
      order: 'date_order desc',
      limit: 10,
    });

    res.json({
      contratos: orders.map(o => ({
        odoo_id: o.id,
        numero: o.name,
        reservacion_numero: o.name,
        contrato_numero: o.x_studio_no_contrato || null,
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
      fields: ['id', 'name', 'x_studio_no_contrato', 'partner_id', 'date_order', 'state', 'order_line'],
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
        reservacion_numero: order.name,
        contrato_numero: order.x_studio_no_contrato || null,
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
