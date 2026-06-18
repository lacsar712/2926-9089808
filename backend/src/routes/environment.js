const express = require('express');
const db = require('../utils/db');
const logger = require('../utils/logger');
const { roleGuard } = require('../middleware/auth');
const { VALID_ENVIRONMENTS } = require('../middleware/environment');

const router = express.Router();

const ENV_LABELS = { development: '开发环境', test: '测试环境', production: '生产环境' };

const parseJsonArray = (value) => {
    if (value == null) return [];
    if (typeof value === 'string') return JSON.parse(value);
    return value;
};

router.get('/list', async (req, res) => {
    try {
        const configs = await db.query('SELECT * FROM environment_config ORDER BY FIELD(environment, "development", "test", "production")');
        const result = [];
        for (const envName of VALID_ENVIRONMENTS) {
            const cfg = configs.find(c => c.environment === envName);
            const [pipelineCount] = await db.query(
                'SELECT COUNT(*) as count FROM pipeline WHERE environment = ? AND deleted_at IS NULL',
                [envName]
            );
            const [runCount] = await db.query(
                'SELECT COUNT(*) as count FROM pipeline_run pr INNER JOIN pipeline p ON pr.pipeline_id = p.id WHERE p.environment = ?',
                [envName]
            );
            result.push({
                environment: envName,
                label: cfg?.label || ENV_LABELS[envName] || envName,
                pipeline_count: pipelineCount.count,
                run_count: runCount.count,
                default_tag_ids: parseJsonArray(cfg?.default_tag_ids),
                quota_multiplier: cfg?.quota_multiplier ? parseFloat(cfg.quota_multiplier) : 1.0
            });
        }
        res.json({ success: true, data: result });
    } catch (error) {
        logger.error('Get environments error:', { message: error.message });
        res.status(500).json({ success: false, message: '获取环境列表失败' });
    }
});

router.get('/stats', roleGuard('admin'), async (req, res) => {
    try {
        const stats = [];
        for (const envName of VALID_ENVIRONMENTS) {
            const [pipelineCount] = await db.query(
                'SELECT COUNT(*) as count FROM pipeline WHERE environment = ? AND deleted_at IS NULL',
                [envName]
            );
            const [runCount] = await db.query(
                'SELECT COUNT(*) as count FROM pipeline_run pr INNER JOIN pipeline p ON pr.pipeline_id = p.id WHERE p.environment = ?',
                [envName]
            );
            const [statusBreakdown] = await db.query(
                'SELECT status, COUNT(*) as count FROM pipeline WHERE environment = ? AND deleted_at IS NULL GROUP BY status',
                [envName]
            );
            const cfg = await db.query('SELECT * FROM environment_config WHERE environment = ?', [envName]);
            stats.push({
                environment: envName,
                label: cfg.length > 0 ? cfg[0].label : ENV_LABELS[envName],
                pipeline_count: pipelineCount.count,
                run_count: runCount.count,
                status_breakdown: statusBreakdown,
                default_tag_ids: cfg.length > 0 ? parseJsonArray(cfg[0].default_tag_ids) : [],
                quota_multiplier: cfg.length > 0 ? parseFloat(cfg[0].quota_multiplier) : 1.0
            });
        }
        res.json({ success: true, data: stats });
    } catch (error) {
        logger.error('Get environment stats error:', { message: error.message });
        res.status(500).json({ success: false, message: '获取环境统计失败' });
    }
});

router.put('/config/:environment', roleGuard('admin'), async (req, res) => {
    try {
        const { environment } = req.params;
        if (!VALID_ENVIRONMENTS.includes(environment)) {
            return res.status(400).json({ success: false, message: '无效的环境名称' });
        }
        const { label, default_tag_ids, quota_multiplier } = req.body;
        const existing = await db.query('SELECT id FROM environment_config WHERE environment = ?', [environment]);
        if (existing.length > 0) {
            await db.query(
                'UPDATE environment_config SET label = ?, default_tag_ids = ?, quota_multiplier = ? WHERE environment = ?',
                [label || ENV_LABELS[environment], JSON.stringify(default_tag_ids || []), quota_multiplier || 1.0, environment]
            );
        } else {
            await db.query(
                'INSERT INTO environment_config (environment, label, default_tag_ids, quota_multiplier) VALUES (?, ?, ?, ?)',
                [environment, label || ENV_LABELS[environment], JSON.stringify(default_tag_ids || []), quota_multiplier || 1.0]
            );
        }
        logger.info('Environment config updated:', { environment, updatedBy: req.user.username });
        res.json({ success: true, message: '环境配置已更新' });
    } catch (error) {
        logger.error('Update environment config error:', { message: error.message });
        res.status(500).json({ success: false, message: '更新环境配置失败' });
    }
});

router.post('/clone', roleGuard('admin'), async (req, res) => {
    try {
        const { pipelineId, targetEnvironment } = req.body;
        if (!pipelineId || !targetEnvironment) {
            return res.status(400).json({ success: false, message: '缺少必要参数' });
        }
        if (!VALID_ENVIRONMENTS.includes(targetEnvironment)) {
            return res.status(400).json({ success: false, message: '无效的目标环境' });
        }
        const rows = await db.query(
            'SELECT * FROM pipeline WHERE id = ? AND deleted_at IS NULL',
            [pipelineId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: '源生产线不存在' });
        }
        const source = rows[0];
        if (source.environment === targetEnvironment) {
            return res.status(400).json({ success: false, message: '目标环境不能与源环境相同' });
        }
        const result = await db.query(
            'INSERT INTO pipeline (name, description, status, version, environment, creator_id) VALUES (?, ?, ?, ?, ?, ?)',
            [`${source.name} (复制-${targetEnvironment})`, source.description, 'draft', 1, targetEnvironment, req.user.id]
        );
        const newPipelineId = result.insertId;
        const sourceTags = await db.query(
            'SELECT tag_id FROM pipeline_tag WHERE pipeline_id = ?',
            [source.id]
        );
        for (const tag of sourceTags) {
            await db.query('INSERT INTO pipeline_tag (pipeline_id, tag_id) VALUES (?, ?)', [newPipelineId, tag.tag_id]);
        }
        const flowRows = await db.query(
            'SELECT flow_data FROM pipeline_flow WHERE pipeline_id = ?',
            [source.id]
        );
        if (flowRows.length > 0) {
            await db.query(
                'INSERT INTO pipeline_flow (pipeline_id, flow_data) VALUES (?, ?)',
                [newPipelineId, flowRows[0].flow_data]
            );
        }
        await db.query(
            'INSERT INTO operation_log (user_id, username, action, target, detail, ip) VALUES (?, ?, ?, ?, ?, ?)',
            [req.user.id, req.user.username, '跨环境复制生产线', source.name, `从 ${source.environment} 复制到 ${targetEnvironment}: ${source.name}`, req.ip]
        );
        logger.info('Pipeline cloned across environments:', { sourceId: pipelineId, newId: newPipelineId, targetEnvironment });
        res.json({ success: true, data: { id: newPipelineId }, message: `已复制到${ENV_LABELS[targetEnvironment] || targetEnvironment}` });
    } catch (error) {
        logger.error('Clone pipeline across environments error:', { message: error.message });
        res.status(500).json({ success: false, message: '跨环境复制生产线失败' });
    }
});

module.exports = router;
