// Configuração global de testes — carrega variáveis de ambiente mínimas
process.env.NODE_ENV    = 'test'
process.env.JWT_SECRET  = 'test-secret-key-that-is-long-enough-for-jwt-256'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb'
process.env.MONITOR_SECRET = 'test-monitor-secret'
process.env.CRON_SECRET = 'test-cron-secret'
process.env.UPGRADE_SECRET = 'test-upgrade-secret'
process.env.ALLOWED_ORIGINS = 'http://localhost:3000'
process.env.PORT = '3099'
