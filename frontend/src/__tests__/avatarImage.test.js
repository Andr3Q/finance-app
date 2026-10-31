import { resizeToAvatar, dataUrlBytes, avatarSrc, AVATAR_SIZE, AVATAR_MAX_BYTES, SOURCE_MAX_BYTES } from '../utils/avatarImage.js'

const ctx = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() }
let toDataURL
const fileOf = (type = 'image/png', size = 10) => { const f = new File(['x'], 'a.png', { type }); Object.defineProperty(f, 'size', { value: size }); return f }
// data URL com `n` bytes decodificados
const urlWithBytes = (n) => 'data:image/jpeg;base64,' + 'A'.repeat(Math.ceil(n / 3) * 4)

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx)
  toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(urlWithBytes(5000))
  globalThis.createImageBitmap = vi.fn().mockResolvedValue({ width: 400, height: 200, close: vi.fn() })
})
afterEach(() => { vi.restoreAllMocks(); delete globalThis.createImageBitmap })

describe('avatarImage', () => {
  it('dataUrlBytes conta os bytes decodificados (com e sem padding)', () => {
    expect(dataUrlBytes('data:image/jpeg;base64,QUJD')).toBe(3)
    expect(dataUrlBytes('data:image/jpeg;base64,QUI=')).toBe(2)
    expect(dataUrlBytes('data:image/jpeg;base64,QQ==')).toBe(1)
    expect(dataUrlBytes('')).toBe(0)
  })

  it('recorta o centro em quadrado, desenha em 256x256 com fundo branco e devolve JPEG', async () => {
    const url = await resizeToAvatar(fileOf())
    expect(url.startsWith('data:image/jpeg;base64,')).toBe(true)
    expect(ctx.fillStyle).toBe('#fff')
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, AVATAR_SIZE, AVATAR_SIZE)
    // imagem 400x200: quadrado de 200 tirado do centro (x = 100)
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 100, 0, 200, 200, 0, 0, AVATAR_SIZE, AVATAR_SIZE)
    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.86)
  })

  it('imagem em pé: recorta pelo centro na vertical', async () => {
    globalThis.createImageBitmap.mockResolvedValue({ width: 200, height: 600, close: vi.fn() })
    await resizeToAvatar(fileOf())
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 200, 200, 200, 0, 0, AVATAR_SIZE, AVATAR_SIZE)
  })

  it('baixa a qualidade até caber no limite', async () => {
    toDataURL.mockImplementation((_t, q) => urlWithBytes(q > 0.7 ? AVATAR_MAX_BYTES + 5000 : 20000))
    const url = await resizeToAvatar(fileOf())
    expect(dataUrlBytes(url)).toBeLessThanOrEqual(AVATAR_MAX_BYTES)
    expect(toDataURL.mock.calls.map(c => c[1])).toEqual([0.86, 0.78, 0.7])
  })

  it('se nem na menor qualidade couber, recusa ("too-big")', async () => {
    toDataURL.mockReturnValue(urlWithBytes(AVATAR_MAX_BYTES * 3))
    await expect(resizeToAvatar(fileOf())).rejects.toThrow('too-big')
  })

  it('recusa arquivo que não é imagem e arquivo original enorme', async () => {
    await expect(resizeToAvatar(fileOf('application/pdf'))).rejects.toThrow('not-image')
    await expect(resizeToAvatar(null)).rejects.toThrow('not-image')
    await expect(resizeToAvatar(fileOf('image/png', SOURCE_MAX_BYTES + 1))).rejects.toThrow('too-big')
    expect(globalThis.createImageBitmap).not.toHaveBeenCalled()
  })

  it('se o navegador devolver outro formato (não JPEG), não aceita', async () => {
    toDataURL.mockReturnValue('data:image/png;base64,AAAA')
    await expect(resizeToAvatar(fileOf())).rejects.toThrow('too-big')
  })

  it('avatarSrc: endereço versionado pela data da troca; sem data (ou sem usuário) não há foto', () => {
    expect(avatarSrc({ avatarUpdatedAt: '2026-10-22T15:00:00.000Z' })).toBe('/api/auth/avatar?v=2026-10-22T15%3A00%3A00.000Z')
    expect(avatarSrc({ avatarUpdatedAt: null })).toBeNull()
    expect(avatarSrc({})).toBeNull()
    expect(avatarSrc(null)).toBeNull()
  })
})
