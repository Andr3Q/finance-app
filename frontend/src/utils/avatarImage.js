// Foto de perfil: reduz a imagem escolhida para um JPEG quadrado de 256x256 (cortando o excesso pelo
// centro, como um círculo mostraria) antes de enviar — o servidor só aceita isso, até 48 KB.
export const AVATAR_SIZE = 256
export const AVATAR_MAX_BYTES = 44 * 1024      // folga sobre o teto de 48 KB do servidor
export const SOURCE_MAX_BYTES = 12 * 1024 * 1024
const QUALITIES = [0.86, 0.78, 0.7, 0.6, 0.5, 0.4]

export const dataUrlBytes = (url) => {
  const b64 = String(url).split(',')[1] || ''
  return Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0)
}

async function loadBitmap(file) {
  // createImageBitmap já respeita a orientação EXIF (foto de celular não sai deitada)
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch { /* cai no <img> */ }
  }
  const url = URL.createObjectURL(file)
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('bad image'))
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** @returns {Promise<string>} data URL JPEG 256x256 de até AVATAR_MAX_BYTES */
export async function resizeToAvatar(file) {
  if (!file || !/^image\//.test(file.type)) throw new Error('not-image')
  if (file.size > SOURCE_MAX_BYTES) throw new Error('too-big')
  const bmp = await loadBitmap(file)
  const w = bmp.width || bmp.naturalWidth
  const h = bmp.height || bmp.naturalHeight
  if (!w || !h) throw new Error('bad image')
  const side = Math.min(w, h)
  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_SIZE
  canvas.height = AVATAR_SIZE
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'                       // PNG/WebP com fundo transparente
  ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE)
  ctx.drawImage(bmp, (w - side) / 2, (h - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE)
  if (typeof bmp.close === 'function') bmp.close()
  for (const q of QUALITIES) {
    const url = canvas.toDataURL('image/jpeg', q)
    if (url.startsWith('data:image/jpeg') && dataUrlBytes(url) <= AVATAR_MAX_BYTES) return url
  }
  throw new Error('too-big')
}

/**
 * Endereço da foto de perfil do usuário (ou null se não tem). `avatarUpdatedAt` vem do servidor e
 * serve de versão: trocar a foto muda o endereço e o navegador busca a nova, sem recarregar tudo.
 */
export const avatarSrc = (user) => (user && user.avatarUpdatedAt ? `/api/auth/avatar?v=${encodeURIComponent(user.avatarUpdatedAt)}` : null)
