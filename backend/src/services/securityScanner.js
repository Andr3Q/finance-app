const { execFile } = require('child_process')
const { promisify } = require('util')
const path = require('path')
const fs   = require('fs')
const prisma = require('../lib/prisma')

const execFileAsync = promisify(execFile)
const APP_DIR = path.resolve(__dirname, '../../')

function findTrivy() {
  const candidates = ['/usr/local/bin/trivy', '/tmp/trivy-bin/trivy']
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c } catch {}
  }
  return null
}

async function runNpmAudit() {
  try {
    let stdout
    try {
      const r = await execFileAsync('npm', ['audit', '--json'], { cwd: APP_DIR })
      stdout = r.stdout
    } catch (err) {
      stdout = err.stdout
    }
    if (!stdout) throw new Error('npm audit: sem output')

    const report = JSON.parse(stdout)
    const v = report.metadata?.vulnerabilities || {}
    const vulnCount = (v.low || 0) + (v.moderate || 0) + (v.high || 0) + (v.critical || 0)

    await prisma.securityScan.create({
      data: {
        tool: 'npm_audit',
        status: vulnCount === 0 ? 'clean' : 'found',
        vulnCount,
        details: {
          critical: v.critical || 0,
          high:     v.high     || 0,
          moderate: v.moderate || 0,
          low:      v.low      || 0,
        },
      },
    })
    console.log(`[security] npm audit: ${vulnCount} vulnerabilidades`)
  } catch (err) {
    console.error('[security] npm audit erro:', err.message)
    try {
      await prisma.securityScan.create({
        data: { tool: 'npm_audit', status: 'error', vulnCount: 0, details: { error: err.message.slice(0, 200) } },
      })
    } catch {}
  }
}

async function runTrivy() {
  const bin = findTrivy()
  if (!bin) {
    console.log('[security] trivy não encontrado, pulando')
    try {
      await prisma.securityScan.create({
        data: { tool: 'trivy', status: 'unavailable', vulnCount: 0, details: { error: 'binário não encontrado' } },
      })
    } catch {}
    return
  }

  const cacheDir = '/tmp/.trivy-cache'
  try {
    const { stdout } = await execFileAsync(bin, [
      'fs', APP_DIR,
      '--format', 'json',
      '--exit-code', '0',
      '--cache-dir', cacheDir,
      '--severity', 'HIGH,CRITICAL',
      '--skip-dirs', 'node_modules/.cache',
      '--skip-dirs', 'public',
      '--skip-dirs', '.trivy-cache',
      '--quiet',
    ], { timeout: 90_000, maxBuffer: 20 * 1024 * 1024 })

    const report = JSON.parse(stdout || '{}')
    const vulns  = (report.Results || []).flatMap(r => r.Vulnerabilities || [])
    const crit   = vulns.filter(v => v.Severity === 'CRITICAL').length
    const high   = vulns.filter(v => v.Severity === 'HIGH').length

    await prisma.securityScan.create({
      data: {
        tool: 'trivy',
        status: vulns.length === 0 ? 'clean' : 'found',
        vulnCount: vulns.length,
        details: { critical: crit, high },
      },
    })
    console.log(`[security] trivy: ${vulns.length} vulnerabilidades`)
  } catch (err) {
    const detail = (err.stderr || err.message || '').slice(0, 400)
    console.error('[security] trivy erro:', detail)
    try {
      await prisma.securityScan.create({
        data: { tool: 'trivy', status: 'error', vulnCount: 0, details: { error: detail } },
      })
    } catch {}
  }
}

async function pruneOldScans() {
  for (const tool of ['npm_audit', 'trivy']) {
    const old = await prisma.securityScan.findMany({
      where: { tool },
      orderBy: { runAt: 'desc' },
      skip: 24,
      select: { id: true },
    })
    if (old.length > 0) {
      await prisma.securityScan.deleteMany({ where: { id: { in: old.map(o => o.id) } } })
    }
  }
}

async function runAllScans() {
  console.log('[security] Iniciando scans...')
  await Promise.allSettled([runNpmAudit(), runTrivy()])
  await pruneOldScans().catch(() => {})
  console.log('[security] Scans concluídos')
}

module.exports = { runAllScans }
