// Worker do Cloudflare que atende o myfinancepro.com.br: repassa tudo ao Cloud Run (serviço finance-app).
// Fica versionado aqui para não existir só no painel. Publicar: Cloudflare > Workers e Pages > bold-haze-b815 > Editar código.
//
// Passo A (IP real): o servidor enxergava o IP de saída do Worker, que muda a cada requisição, e por isso os limites
// por IP e o alerta de "novo acesso" não funcionavam. Agora o Worker manda o IP verdadeiro do visitante (cf-connecting-ip,
// que o Cloudflare define e o cliente não consegue forjar) junto de um segredo compartilhado (EDGE_SECRET). O app só confia
// nesse IP quando o segredo bate (backend/src/middleware/clientIp.js). Sem o segredo configurado aqui, nada é enviado
// e o app volta a usar o IP de antes, então o Worker nunca fica pior do que era.
export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    url.hostname = 'finance-app-1042158013294.southamerica-east1.run.app'
    url.protocol = 'https:'

    const headers = new Headers(request.headers)
    // Nunca repassar o que o cliente mandar nesses dois cabeçalhos: só o Worker pode defini-los.
    headers.delete('x-nancy-client-ip')
    headers.delete('x-nancy-edge')
    const ip = request.headers.get('cf-connecting-ip')
    if (env.EDGE_SECRET && ip) {
      headers.set('x-nancy-client-ip', ip)
      headers.set('x-nancy-edge', env.EDGE_SECRET)
    }

    return fetch(new Request(url.toString(), {
      method:   request.method,
      headers,
      body:     ['GET', 'HEAD'].includes(request.method) ? null : request.body,
      redirect: 'follow'
    }))
  }
}
