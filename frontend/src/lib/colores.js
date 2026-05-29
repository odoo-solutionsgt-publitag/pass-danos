export const PALETA_COTIZACIONES = [
  { bg: '#FFE4E6', border: '#FECDD3', textHeader: '#9F1239', name: 'rosa' },
  { bg: '#DBEAFE', border: '#BFDBFE', textHeader: '#1E3A8A', name: 'azul' },
  { bg: '#DCFCE7', border: '#BBF7D0', textHeader: '#14532D', name: 'verde' },
  { bg: '#FEF9C3', border: '#FEF08A', textHeader: '#713F12', name: 'amarillo' },
  { bg: '#EDE9FE', border: '#DDD6FE', textHeader: '#4C1D95', name: 'lavanda' },
  { bg: '#FFEDD5', border: '#FED7AA', textHeader: '#7C2D12', name: 'durazno' },
  { bg: '#CCFBF1', border: '#99F6E4', textHeader: '#134E4A', name: 'menta' },
  { bg: '#FCE7F3', border: '#FBCFE8', textHeader: '#831843', name: 'lila' },
]

export function colorPorIndice(indice) {
  return PALETA_COTIZACIONES[indice % PALETA_COTIZACIONES.length]
}
