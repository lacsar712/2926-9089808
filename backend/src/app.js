const express = require('express');
const cors = require('cors');
const logger = require('./utils/logger');
const db = require('./utils/db');

const authRoutes = require('./routes/auth');
const pipelineRoutes = require('./routes/pipeline');
const flowRoutes = require('./routes/flow');
const monitorRoutes = require('./routes/monitor');
const tagRoutes = require('./routes/tag');
const userRoutes = require('./routes/user');
const logRoutes = require('./routes/log');
const quotaRoutes = require('./routes/quota');
const alertRoutes = require('./routes/alert');
const lineageRoutes = require('./routes/lineage');
const apiKeyRoutes = require('./routes/apiKey');
const openRoutes = require('./routes/open');
const approvalRoutes = require('./routes/approval');
const environmentRoutes = require('./routes/environment');
const presetRoutes = require('./routes/preset');
const bookmarkRoutes = require('./routes/bookmark');

const { authMiddleware } = require('./middleware/auth');
const { environmentMiddleware } = require('./middleware/environment');

const app = express();
const PORT = 3001;

app.use(cors({
    origin: '*',
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Environment']
}));
app.use(express.json({ limit: '10mb' }));
app.use(environmentMiddleware);

// 健康检查
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 公开路由
app.use('/api/auth', authRoutes);

// API Key 开放路由
app.use('/api/open', openRoutes);

// 需要认证的路由
app.use('/api/pipelines', authMiddleware, pipelineRoutes);
app.use('/api/flows', authMiddleware, flowRoutes);
app.use('/api/monitor', authMiddleware, monitorRoutes);
app.use('/api/tags', authMiddleware, tagRoutes);
app.use('/api/users', authMiddleware, userRoutes);
app.use('/api/logs', authMiddleware, logRoutes);
app.use('/api/quota', authMiddleware, quotaRoutes);
app.use('/api/alert', authMiddleware, alertRoutes.router);
app.use('/api/lineage', authMiddleware, lineageRoutes);
app.use('/api/api-keys', authMiddleware, apiKeyRoutes);
app.use('/api/approval', authMiddleware, approvalRoutes);
app.use('/api/environments', authMiddleware, environmentRoutes);
app.use('/api/presets', authMiddleware, presetRoutes);
app.use('/api/bookmarks', authMiddleware, bookmarkRoutes);

// 全局错误处理
app.use((err, _req, res, _next) => {
    logger.error('Unhandled error:', { message: err.message, stack: err.stack });
    if (err.code === 'QUOTA_EXCEEDED') {
        return res.status(403).json({
            success: false,
            message: err.message,
            code: err.code,
            remaining: err.remaining,
            limit: err.limit
        });
    }
    res.status(500).json({ success: false, message: '服务器内部错误' });
});

const startServer = async () => {
    try {
        await db.testConnection();
        logger.info('Database connection established');
        app.listen(PORT, '0.0.0.0', () => {
            logger.info(`Server running on port ${PORT}`);
        });
    } catch (error) {
        logger.error('Failed to start server:', { message: error.message });
        setTimeout(startServer, 5000);
    }
};

startServer();
