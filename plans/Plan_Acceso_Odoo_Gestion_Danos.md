# Plan — Control de acceso vía Odoo para Gestión de Daños

**Objetivo**: que los usuarios accedan a la app `gestion-danos.odoo-server.online` solamente si:
1. Están autenticados en Odoo (mismo correo/contraseña que usan para Odoo)
2. Tienen marcado el checkbox `x_can_access_danos` en su ficha de usuario

El único usuario con cuenta directa en Supabase será el **administrador**. Todos los demás autentican contra Odoo y la app los reconoce.

---

## Arquitectura

```
┌─────────────┐   1. login (email+pass)   ┌──────────────────┐
│  Frontend   │ ─────────────────────────▶│  Backend Express │
│   React     │                            │  /auth/odoo      │
└─────────────┘                            └──────────┬───────┘
       ▲                                              │
       │ 5. JWT + datos                               │ 2. XML-RPC authenticate
       │                                              │ 3. read x_can_access_danos
       │                                              ▼
       │                                   ┌──────────────────┐
       │                                   │  Odoo 19         │
       │                                   │  res.users       │
       │                                   └──────────────────┘
       │                                              │
       │                                              │ 4. service_role:
       │                                              │    - createUser si es 1ra vez
       │                                              │    - sign JWT Supabase-compatible
       │                                              ▼
       │                                   ┌──────────────────┐
       └──── 6. setSession(jwt) ────────── │  Supabase Auth   │
                                            │  auth.users      │
                                            │  perfiles        │
                                            └──────────────────┘
```

### Flujo paso a paso

1. **Usuario abre la app** → ProtectedRoute detecta que no hay sesión → redirect a `/login`
2. **Login form** envía email+contraseña al backend `POST /auth/odoo`
3. **Backend autentica contra Odoo** via XML-RPC (`common.authenticate(db, login, pass, {})`)
4. **Backend lee** `res.users.x_can_access_danos` del UID recibido
   - Si es `false` o no existe → respuesta `403`
5. **Backend prepara la sesión Supabase**:
   - Calcula UUID determinístico: `uuidv5(NAMESPACE, "odoo:" + uid)`
   - Si es 1ra vez: crea fila en `auth.users` con ese UUID + crea fila en `perfiles` con rol por defecto
   - Si ya existe: actualiza nombre/email/rol
   - Firma un **JWT compatible con Supabase** usando `SUPABASE_JWT_SECRET` (mismo secret del proyecto Supabase)
6. **Backend devuelve** `{ access_token, refresh_token, user, perfil }` al frontend
7. **Frontend** llama `supabase.auth.setSession({ access_token, refresh_token })` → Supabase JS reconoce el JWT y todas las queries pasan RLS normalmente

### Por qué este diseño

- **Una sola fuente de verdad para acceso**: Odoo (`x_can_access_danos`)
- **Frontend mantiene Supabase JS directo**: no hay que mover todo el CRUD al backend, las queries siguen siendo desde el frontend
- **RLS funciona**: el JWT tiene `sub` con el UUID del usuario, las policies de Supabase siguen aplicando
- **Sin doble password**: el usuario solo recuerda su login de Odoo
- **Revocación inmediata**: si en Odoo se desactiva el checkbox, el próximo login falla. El JWT actual expira en 1 hora (corto a propósito).

---

## Módulo Odoo: `pass_gestion_danos`

**Ubicación**: `pass_gestion_danos - odoo/odoo_addons/pass_gestion_danos/`

Sigue la convención de `pass_inspeccion_vehicular` (manifest, models, security, views).

### `__manifest__.py`

```python
{
    'name': 'Pass - Gestión de Daños',
    'version': '19.0.1.0.0',
    'category': 'Fleet',
    'summary': 'Integración con app externa de Gestión de Daños / Mantenimiento',
    'description': 'Agrega menú al módulo Rental para acceder a la app, '
                   'y campo en res.users para controlar acceso.',
    'author': 'Publitag',
    'license': 'LGPL-3',
    'depends': ['base', 'sale_renting'],
    'data': [
        'security/ir.model.access.csv',
        'data/gestion_danos_action.xml',
        'views/res_users_views.xml',
        'views/menu_gestion_danos.xml',
    ],
    'installable': True,
    'application': False,
    'auto_install': False,
}
```

### Archivos del módulo

```
odoo_addons/pass_gestion_danos/
├── __init__.py
├── __manifest__.py
├── models/
│   ├── __init__.py
│   └── res_users.py              ← campo can_access_danos
├── data/
│   └── gestion_danos_action.xml  ← ir.actions.act_url
├── views/
│   ├── res_users_views.xml       ← checkbox en form de res.users
│   └── menu_gestion_danos.xml    ← menú "Gestión de Daños/Mant"
└── security/
    └── ir.model.access.csv       ← (vacío, solo extiende res.users)
```

### `models/res_users.py`

```python
from odoo import fields, models


class ResUsers(models.Model):
    _inherit = 'res.users'

    x_can_access_danos = fields.Boolean(
        string='Puede acceder a Gestión de Daños',
        default=False,
        help='Permite al usuario iniciar sesión en la app externa '
             'https://gestion-danos.odoo-server.online',
    )
```

### `views/res_users_views.xml`

En Odoo 19 las vistas usan `<list>` (no `<tree>`) y los atributos `invisible=` van inline. Cuidado al heredar:

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>
    <record id="view_users_form_inherit_danos" model="ir.ui.view">
        <field name="name">res.users.form.inherit.danos</field>
        <field name="model">res.users</field>
        <field name="inherit_id" ref="base.view_users_form"/>
        <field name="arch" type="xml">
            <xpath expr="//notebook" position="inside">
                <page string="Pass — Apps Externas" name="pass_apps">
                    <group>
                        <field name="x_can_access_danos"/>
                    </group>
                </page>
            </xpath>
        </field>
    </record>
</odoo>
```

### `data/gestion_danos_action.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo noupdate="0">
    <record id="action_gestion_danos_url" model="ir.actions.act_url">
        <field name="name">Gestión de Daños/Mant</field>
        <field name="url">https://gestion-danos.odoo-server.online</field>
        <field name="target">new</field>
    </record>
</odoo>
```

### `views/menu_gestion_danos.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>
    <menuitem
        id="menu_gestion_danos_external"
        name="Gestión de Daños/Mant"
        parent="sale_renting.rental_menu_root"
        action="action_gestion_danos_url"
        sequence="50"
        groups="base.group_user"/>
</odoo>
```

> Nota: `sale_renting.rental_menu_root` es el menú raíz del módulo Rental. Si la versión 19 cambió el xml_id, se ajusta. Sequence 50 lo deja debajo de Flotilla Vehicular (normalmente sequence 40).

### `security/ir.model.access.csv`

Vacío con encabezado (no se agregan modelos nuevos, solo se extiende `res.users`).

```csv
id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink
```

### `__init__.py`

```python
from . import models
```

### `models/__init__.py`

```python
from . import res_users
```

---

## Backend Express — cambios

### 1. Nuevas dependencias en `backend/package.json`

```bash
npm install jsonwebtoken uuid
```

- `jsonwebtoken`: firmar el JWT compatible con Supabase
- `uuid`: generar UUID v5 determinístico desde el `uid` Odoo

### 2. Nuevas variables de entorno

```env
SUPABASE_JWT_SECRET=<JWT secret del proyecto Supabase>
ODOO_DANOS_NAMESPACE_UUID=<UUID fijo para el namespace de Odoo users>
```

**Dónde encontrar `SUPABASE_JWT_SECRET`**:
Dashboard Supabase → Project Settings → API → "JWT Settings" → "JWT Secret" (NO el anon/service key — es un secret separado para firmar JWTs).

**Cómo generar `ODOO_DANOS_NAMESPACE_UUID`**: una sola vez, en cualquier shell Node:
```js
require('crypto').randomUUID()
```
Lo configuras en Coolify y no lo cambias jamás (sino los UUIDs de usuarios existentes dejarían de coincidir).

### 3. Nuevo endpoint `POST /auth/odoo`

```javascript
import jwt from 'jsonwebtoken'
import { v5 as uuidv5 } from 'uuid'
import xmlrpc from 'xmlrpc'

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET
const NAMESPACE  = process.env.ODOO_DANOS_NAMESPACE_UUID

app.post('/auth/odoo', async (req, res) => {
  const { login, password } = req.body
  if (!login || !password) {
    return res.status(400).json({ error: 'Email y contraseña requeridos' })
  }

  try {
    // 1. Autenticar contra Odoo (NO con el usuario API global,
    //    sino con las credenciales del usuario que está intentando entrar)
    const common = xmlrpc.createSecureClient({ url: `${ODOO_URL}/xmlrpc/2/common` })
    const uid = await new Promise((resolve, reject) => {
      common.methodCall('authenticate', [ODOO_DB, login, password, {}], (err, value) => {
        if (err) return reject(err)
        resolve(value)
      })
    })

    if (!uid) {
      return res.status(401).json({ error: 'Credenciales inválidas en Odoo' })
    }

    // 2. Leer el usuario en Odoo (usando el uid recién autenticado)
    const users = await odooExecute(uid, 'res.users', 'read', [[uid]], {
      fields: ['name', 'login', 'email', 'x_can_access_danos', 'active'],
    })
    if (!users.length) {
      return res.status(403).json({ error: 'Usuario no encontrado' })
    }
    const u = users[0]
    if (!u.active) {
      return res.status(403).json({ error: 'Usuario desactivado en Odoo' })
    }
    if (!u.x_can_access_danos) {
      return res.status(403).json({ error: 'Sin permiso para Gestión de Daños' })
    }

    // 3. Calcular UUID determinístico
    const userId = uuidv5(`odoo:${uid}`, NAMESPACE)

    // 4. Crear / actualizar usuario en auth.users y perfiles via service_role
    //    (idempotente — solo crea si no existe)
    await ensureSupabaseUser({ userId, email: u.email || u.login, nombre: u.name })

    // 5. Firmar JWT Supabase-compatible (1 hora)
    const now    = Math.floor(Date.now() / 1000)
    const expSec = now + 3600
    const accessToken = jwt.sign({
      iss: 'supabase',
      sub: userId,
      aud: 'authenticated',
      role: 'authenticated',
      iat: now,
      exp: expSec,
      email: u.email || u.login,
      user_metadata: {
        nombre: u.name,
        odoo_uid: uid,
      },
      app_metadata: { provider: 'odoo' },
    }, JWT_SECRET, { algorithm: 'HS256' })

    // 6. Devolver al frontend
    res.json({
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: expSec,
      user: {
        id: userId,
        email: u.email || u.login,
        nombre: u.name,
        odoo_uid: uid,
      },
    })
  } catch (err) {
    console.error('[POST /auth/odoo]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Helper para crear usuario en Supabase si no existe
async function ensureSupabaseUser({ userId, email, nombre }) {
  // Verificar si ya existe en auth.users via service_role
  const { data: existing } = await supabase.auth.admin.getUserById(userId)
  if (!existing?.user) {
    await supabase.auth.admin.createUser({
      id: userId,
      email,
      email_confirm: true,
      user_metadata: { nombre },
    })
  }
  // Verificar / crear en perfiles
  const { data: perfil } = await supabase.from('perfiles').select('id').eq('id', userId).maybeSingle()
  if (!perfil) {
    await supabase.from('perfiles').insert({
      id: userId,
      nombre_completo: nombre,
      rol: 'agente',  // rol por defecto; admin lo ajusta luego
      activo: true,
    })
  }
}
```

### 4. No se rompe nada del login de admin actual

El admin existente (que tiene su perfil en `perfiles` y cuenta en Supabase Auth) sigue usando el flujo normal de `supabase.auth.signInWithPassword`. El endpoint `/auth/odoo` es **adicional**, no reemplazo.

---

## Frontend React — cambios

### 1. Login.jsx — agregar opción "Login con Odoo"

Dos pestañas:
- **Odoo** (default): pide email + password → llama backend `/auth/odoo` → `supabase.auth.setSession(data)`
- **Admin Supabase** (oculto/colapsado): el flujo actual con `signInWithPassword` directo. Solo para el admin que tiene cuenta nativa en Supabase.

```jsx
async function handleOdooLogin(e) {
  e.preventDefault()
  setError('')
  setLoading(true)
  try {
    const res = await fetch(`${import.meta.env.VITE_API_URL}/auth/odoo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Error de autenticación')
    // Instalar la sesión en Supabase JS
    await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.access_token,  // no usamos refresh — token corto, se relogea
    })
    navigate('/')
  } catch (err) {
    setError(err.message)
  } finally {
    setLoading(false)
  }
}
```

### 2. `useAuth` hook — sin cambios

Funciona igual porque `supabase.auth.setSession` dispara `onAuthStateChange`. El hook carga el perfil con el `sub` del JWT y todo continúa como ahora.

### 3. Reautenticación al expirar el token

El JWT dura 1 hora. Cuando expira, las queries empiezan a fallar con `401`. Hay dos opciones:

**Opción A — Re-login forzado**: detectar el 401 y redirect a `/login`. Simple.

**Opción B — Refresh con backend**: backend mantiene una sesión interna del usuario, frontend pide `/auth/refresh` periódicamente. Más complejo, no se justifica para uso interno.

Recomiendo **Opción A** para simplicidad. La sesión real del usuario en Odoo no se prolonga aquí; si se desconecta, vuelve a entrar.

---

## SQL en Supabase — políticas RLS

Las policies actuales funcionan sin cambios porque usan `auth.uid()` que sigue retornando el UUID del JWT firmado. Solo hay que asegurar:

```sql
-- Verificar que get_user_rol() esté definida (ya existe, según CLAUDE.md)
SELECT get_user_rol();   -- debe retornar el rol del usuario actual

-- Si por alguna razón fallara, recrearla:
CREATE OR REPLACE FUNCTION get_user_rol()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT rol FROM perfiles WHERE id = auth.uid();
$$;
```

---

## Configuración de roles desde admin

Como el rol se asigna desde la tabla `perfiles`, hay dos formas:

1. **Manual** (mientras no exista UI): el admin entra a Supabase → Table Editor → `perfiles` → encuentra al usuario (filtrar por email) → cambia `rol` a `admin / agente_senior / agente / operaciones / readonly`.

2. **Futura** (no es alcance de este plan): página `/usuarios` en la app que liste todos los perfiles y permita al admin cambiar rol con un select. Roadmap menor.

---

## Pasos de implementación

1. **Crear módulo Odoo** `pass_gestion_danos` con los 7 archivos descritos
2. **Instalar el módulo en Odoo** (Apps → Update Apps List → buscar e instalar)
3. **Marcar `x_can_access_danos = TRUE`** en al menos un usuario de prueba
4. **Generar `ODOO_DANOS_NAMESPACE_UUID`** y configurar en Coolify
5. **Conseguir `SUPABASE_JWT_SECRET`** del dashboard Supabase y configurar en Coolify
6. **Implementar endpoint `/auth/odoo`** en `backend/index.js` + dependencias npm
7. **Redeploy backend** en Coolify
8. **Modificar Login.jsx** con la pestaña Odoo
9. **Redeploy frontend** en Coolify
10. **Probar end-to-end**:
    - Login con usuario Odoo con check activado → entra
    - Login con usuario Odoo sin check → 403
    - Login con credenciales malas → 401
    - Admin sigue entrando con su cuenta Supabase nativa
    - Una vez dentro, las queries de Supabase funcionan normalmente

---

## Casos borde a considerar

| Escenario | Comportamiento |
|-----------|----------------|
| Usuario cambia password en Odoo | Próximo login pide la nueva. El JWT actual sigue válido hasta que expire (max 1h). |
| Admin desactiva `x_can_access_danos` | El JWT actual sigue válido hasta 1h. Para revocación inmediata, hay que llamar `supabase.auth.admin.signOut(userId)` desde el backend al momento de desactivar (NO incluido en este plan inicial, se puede agregar después). |
| Usuario eliminado de Odoo | XML-RPC authenticate falla → 401. Pero el perfil en `perfiles` queda. Mantenimiento manual. |
| Usuario nuevo en Odoo | Al primer login se le crea automáticamente con rol `agente`. El admin lo promueve si requiere más permisos. |
| Cambio de email en Odoo | Al próximo login, backend actualiza email en `auth.users` (TODO en `ensureSupabaseUser`). |
| Admin Supabase pierde acceso a Odoo | No le afecta — entra con su cuenta nativa de Supabase. |

---

## Resumen del entregable

| Cambio | Archivo / componente | Riesgo |
|--------|---------------------|--------|
| Crear módulo Odoo | `odoo_addons/pass_gestion_danos/` (7 archivos) | Bajo — solo extiende res.users y agrega menú |
| Endpoint `/auth/odoo` | `backend/index.js` | Bajo — endpoint nuevo, no toca rutas existentes |
| Pestaña Odoo en login | `frontend/src/pages/Login.jsx` | Bajo — agrega opción, el flujo admin sigue |
| Variables Coolify | `SUPABASE_JWT_SECRET`, `ODOO_DANOS_NAMESPACE_UUID` | Bajo — solo se agregan, no se modifican |
| Tabla `perfiles` | Sin cambios | — |
| RLS policies | Sin cambios | — |

**Sin migraciones SQL nuevas** porque la tabla `perfiles` ya existe y acepta UUIDs externos.
