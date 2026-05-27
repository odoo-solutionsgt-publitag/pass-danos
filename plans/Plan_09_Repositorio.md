# FASE 9 — Repositorio de Documentos

**Estado**: ✅ Completado
**Depende de**: Fases 2 y 6

---

## Objetivo

Vista global de todos los documentos subidos al sistema (PDFs, fotos, facturas, comprobantes) con upload drag & drop, descarga vía signed URL y vínculo con su daño/servicio de origen.

---

## Archivos

- [frontend/src/pages/Repositorio.jsx](../frontend/src/pages/Repositorio.jsx)

---

## Storage Supabase

- Bucket: `documentos` — **privado**
- File size limit: 10MB
- MIME types permitidos: `application/pdf`, `image/jpeg`, `image/png`, `image/webp`
- Path pattern: `{numero}/{tipo}/{timestamp}_{filename_sanitizado}`

---

## Tabla global

Columnas: Archivo (con icono por mime), Tipo (badge), Origen (vinculado a daño o servicio + placa), Fecha, Tamaño, Acciones.

Query con join:
```sql
SELECT documentos.*,
       siniestros(numero, placa),
       ordenes_servicio(numero, placa)
ORDER BY created_at DESC LIMIT 500
```

### Filtros
- Búsqueda libre (nombre archivo / número / placa)
- Dropdown tipo: cotización_pdf, proforma_pdf, foto_dano, factura, comprobante_pago, avaluo, otro
- Dropdown origen: Solo daños / Solo servicios / Ambos

### Acciones por fila
- **Descargar**: `supabase.storage.from('documentos').createSignedUrl(path, 60)` → abre en nueva pestaña
- **Eliminar**: borra del storage + DELETE en `documentos` (con `confirm()` previo)

### Click en el número del origen
Navega al detalle (`/siniestros/:id` o `/servicios/:id`).

---

## Upload Modal

### Selector de origen
Toggle Daño / Servicio.

### Autocomplete del origen
Input con debounce (300ms) que busca en la tabla correspondiente por `numero` ilike o `placa` ilike. Muestra dropdown de resultados.

### Tipo de documento
Select de 7 valores del enum `tipo_documento`.

### Drag & drop
Zona con border dashed, soporta:
- Drag & drop de archivo
- Click → file picker

Validaciones cliente:
- `file.size <= 10MB`
- `file.type IN [PDF, JPG, PNG, WebP]`

### Upload
1. Genera path: `{numero_origen}/{tipo}/{Date.now()}_{filename_sanitizado}`
2. `supabase.storage.upload(path, file)` — con `contentType` y `upsert: false`
3. Si OK → INSERT en `documentos` con todos los metadatos
4. **Si el INSERT falla, rollback del archivo en storage** para no dejar huérfanos

Barra de progreso indicativa (no real, solo visual: 10 → 30 → 75 → 100).

---

## Helpers

- `formatSize`: B / KB / MB
- `formatDate`: dd MMM yyyy HH:mm
- `FileTypeIcon`: muestra ícono distinto según MIME (imagen, PDF, otro)

---

## Decisiones

- **Signed URL de 60s**: suficiente para abrir el archivo en una pestaña; no es link permanente.
- **Sanitización del filename**: `replace(/[^a-zA-Z0-9._-]/g, '_')` evita problemas con espacios y caracteres especiales en el path.
- **Sin preview inline**: las imágenes y PDFs se abren en nueva pestaña — más simple y consistente.
- **Rollback de storage**: si el INSERT en DB falla después de subir el archivo, se elimina del bucket para no acumular basura.
- **Eliminar con `confirm()`**: para esta acción crítica un confirm nativo es suficiente. ConfirmModal sería overkill.

---

## Criterio de éxito (cumplido)

- [x] Drag & drop sube archivos correctamente
- [x] Validaciones bloquean tipos y tamaños no permitidos
- [x] Los documentos aparecen en la lista global con todos los metadatos
- [x] Descarga funciona con signed URL
- [x] Eliminación borra de storage + DB en una sola acción
- [x] Click en el origen navega al detalle del daño/servicio
