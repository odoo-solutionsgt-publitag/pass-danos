import { useAuth } from './useAuth'

const PERMISOS_DEFAULT = { crear: false, editar: false, ver: true, eliminar: false }

/**
 * Hook centralizado para leer permisos del usuario actual.
 * Los permisos vienen de perfiles.permisos (JSONB con 4 flags).
 *
 * Uso:
 *   const { puedeCrear, puedeEditar, puedeEliminar, esAdmin } = usePermisos()
 *   {puedeCrear && <button>+ Nuevo</button>}
 */
export function usePermisos() {
  const { perfil, loading } = useAuth()
  const p = perfil?.permisos ?? PERMISOS_DEFAULT

  return {
    puedeCrear:    !!p.crear,
    puedeEditar:   !!p.editar,
    puedeVer:      p.ver !== false,    // ver es true por default
    puedeEliminar: !!p.eliminar,
    esAdmin:       perfil?.rol === 'admin',
    esAdminOSenior: perfil?.rol === 'admin' || perfil?.rol === 'agente_senior',
    rol:           perfil?.rol ?? 'readonly',
    loading,
  }
}
