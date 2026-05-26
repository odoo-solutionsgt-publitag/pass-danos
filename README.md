# Pass Daños — Gestión de Daños Vehiculares

Sistema externo de gestión de siniestros y reparaciones para Pass Rent a Car Guatemala.

## Stack

- **Frontend**: React + Vite + Tailwind CSS
- **Backend**: Node.js + Express + XML-RPC (Odoo proxy)
- **Database**: Supabase (PostgreSQL)
- **Hosting**: Coolify (Docker) en Contabo VPS
- **Integración**: Odoo 19 Enterprise via XML-RPC

## Estructura

```
pass-danos/
├── backend/          # API proxy Node.js → Odoo XML-RPC
│   ├── package.json
│   └── index.js
└── frontend/         # React app (por implementar)
    └── ...
```

## Backend API Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Health check (Odoo + Supabase) |
| GET | `/vehiculos` | Lista de vehículos desde Odoo |
| GET | `/vehiculo/:placa` | Detalle vehículo + contrato activo |
| PATCH | `/vehiculo/:id/status` | Cambiar status vehículo en Odoo |
| GET | `/vehiculo/:id/fleet` | Datos de flota (fleet.vehicle) |

## Environment Variables (Backend)

```env
PORT=3000
NODE_ENV=production
TZ=America/Guatemala
CORS_ORIGIN=https://gestion-danos.odoo-server.online
ODOO_URL=https://odoo-server.online
ODOO_DB=odoo19server
ODOO_API_USER=api_danos
ODOO_API_PASSWORD=...
SUPABASE_URL=https://cxoqviwdryvjahykazpb.supabase.co
SUPABASE_SERVICE_KEY=...
```
