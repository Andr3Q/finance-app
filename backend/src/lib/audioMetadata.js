'use strict'
// Isola o único ponto do backend que toca um pacote ESM puro (music-metadata
// 12+, sem build CJS — "type": "module"). import() dinâmico carrega um pacote
// ESM nativamente a partir de um arquivo CJS no Node, sem flag experimental,
// mas o Jest deste projeto (100% CommonJS, sem transform/Babel) não
// intercepta import() dinâmico com jest.mock()/moduleNameMapper como
// intercepta require(). Isolando atrás de um require() comum resolve os dois
// lados: produção carrega o pacote real via import() nativo, e os testes
// mockam este arquivo inteiro (um módulo CJS comum) em vez do pacote ESM.

// Retorna a duração em segundos, ou null se não for possível determinar.
async function getAudioDurationSeconds(buffer, mimeType) {
  const { parseBuffer } = await import('music-metadata')
  const { format } = await parseBuffer(buffer, mimeType, { duration: true, skipCovers: true })
  return format.duration ?? null
}

module.exports = { getAudioDurationSeconds }
