const express = require('express');
const db = require('../utils/db');
const logger = require('../utils/logger');
const { roleGuard } = require('../middleware/auth');
const quotaUtil = require('../utils/quota');
const path = require('path');
const { validateFlow, COMPONENT_KEYS, CATEGORY_KEYS, getComponentSchema } = require(path.join(__dirname, '../../../shared/index.js'));

const router = express.Router();

// 获取编排数据
router.get('/:pipelineId', async (req, res) => {
    try {
        const pipelineRows = await db.query('SELECT id FROM pipeline WHERE id = ? AND deleted_at IS NULL', [req.params.pipelineId]);
        if (pipelineRows.length === 0) return res.status(404).json({ success: false, message: '生产线不存在' });
        const rows = await db.query('SELECT * FROM pipeline_flow WHERE pipeline_id = ?', [req.params.pipelineId]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: '编排数据不存在' });
        const flowData = typeof rows[0].flow_data === 'string' ? JSON.parse(rows[0].flow_data) : rows[0].flow_data;
        res.json({ success: true, data: { ...rows[0], flow_data: flowData } });
    } catch (error) {
        logger.error('Get flow error:', { message: error.message });
        res.status(500).json({ success: false, message: '获取编排数据失败' });
    }
});

// 保存编排数据
router.put('/:pipelineId', roleGuard('admin', 'editor'), async (req, res) => {
    try {
        const { flowData } = req.body;
        if (!flowData) return res.status(400).json({ success: false, message: '编排数据不能为空' });

        const pipelineRows = await db.query('SELECT id FROM pipeline WHERE id = ? AND deleted_at IS NULL', [req.params.pipelineId]);
        if (pipelineRows.length === 0) return res.status(404).json({ success: false, message: '生产线不存在' });

        const nodeCount = flowData.nodes ? flowData.nodes.length : 0;
        await quotaUtil.validateNodeQuota(req.user.id, req.params.pipelineId, nodeCount);

        const existing = await db.query('SELECT id FROM pipeline_flow WHERE pipeline_id = ?', [req.params.pipelineId]);
        if (existing.length === 0) {
            await db.query('INSERT INTO pipeline_flow (pipeline_id, flow_data) VALUES (?, ?)',
                [req.params.pipelineId, JSON.stringify(flowData)]);
        } else {
            await db.query('UPDATE pipeline_flow SET flow_data = ? WHERE pipeline_id = ?',
                [JSON.stringify(flowData), req.params.pipelineId]);
        }
        logger.info('Flow saved:', { pipelineId: req.params.pipelineId });
        res.json({ success: true, message: '保存成功' });
    } catch (error) {
        logger.error('Save flow error:', { message: error.message });
        if (error.code === 'QUOTA_EXCEEDED') {
            return res.status(403).json({
                success: false,
                message: error.message,
                code: error.code,
                remaining: error.remaining,
                limit: error.limit
            });
        }
        res.status(500).json({ success: false, message: '保存编排数据失败' });
    }
});

// 发布生产线（仅 admin 可直接发布）
router.post('/:pipelineId/publish', roleGuard('admin'), async (req, res) => {
    try {
        const { remark } = req.body;

        const existRows = await db.query('SELECT id, version FROM pipeline WHERE id = ? AND deleted_at IS NULL', [req.params.pipelineId]);
        if (existRows.length === 0) return res.status(404).json({ success: false, message: '生产线不存在' });

        await quotaUtil.validateQuota(req.user.id, quotaUtil.QUOTA_DIMENSIONS.PUBLISHES_PER_DAY, 1);

        const flowRows = await db.query('SELECT flow_data FROM pipeline_flow WHERE pipeline_id = ?', [req.params.pipelineId]);
        if (flowRows.length === 0) return res.status(400).json({ success: false, message: '请先编排生产线' });

        const newVersion = (existRows[0]?.version || 0) + 1;

        await db.query('UPDATE pipeline SET status = ?, version = ? WHERE id = ?', ['published', newVersion, req.params.pipelineId]);
        await db.query(
            'INSERT INTO pipeline_history (pipeline_id, version, flow_data, operator, action, remark) VALUES (?, ?, ?, ?, ?, ?)',
            [req.params.pipelineId, newVersion, JSON.stringify(flowRows[0].flow_data), req.user.username, 'publish', remark || '']
        );
        await db.query(
            'INSERT INTO operation_log (user_id, username, action, target, detail, ip) VALUES (?, ?, ?, ?, ?, ?)',
            [req.user.id, req.user.username, '发布生产线', `Pipeline #${req.params.pipelineId}`, `发布版本v${newVersion}`, req.ip]
        );
        logger.info('Pipeline published:', { pipelineId: req.params.pipelineId, version: newVersion });
        res.json({ success: true, message: `发布成功，当前版本 v${newVersion}` });
    } catch (error) {
        logger.error('Publish pipeline error:', { message: error.message });
        if (error.code === 'QUOTA_EXCEEDED') {
            return res.status(403).json({
                success: false,
                message: error.message,
                code: error.code,
                remaining: error.remaining,
                limit: error.limit
            });
        }
        res.status(500).json({ success: false, message: '发布失败' });
    }
});

// 检查编排合法性
router.post('/:pipelineId/check', async (req, res) => {
    try {
        const pipelineRows = await db.query('SELECT id FROM pipeline WHERE id = ? AND deleted_at IS NULL', [req.params.pipelineId]);
        if (pipelineRows.length === 0) return res.status(404).json({ success: false, message: '生产线不存在' });
        const flowRows = await db.query('SELECT flow_data FROM pipeline_flow WHERE pipeline_id = ?', [req.params.pipelineId]);
        if (flowRows.length === 0) return res.json({ success: true, data: { valid: false, errors: ['编排数据为空'] } });
        const flowData = typeof flowRows[0].flow_data === 'string' ? JSON.parse(flowRows[0].flow_data) : flowRows[0].flow_data;
        const result = validateFlow(flowData);
        res.json({ success: true, data: result });
    } catch (error) {
        logger.error('Check flow error:', { message: error.message });
        res.status(500).json({ success: false, message: '检查失败' });
    }
});

// 获取发布历史
router.get('/:pipelineId/history', async (req, res) => {
    try {
        const pipelineRows = await db.query('SELECT id FROM pipeline WHERE id = ? AND deleted_at IS NULL', [req.params.pipelineId]);
        if (pipelineRows.length === 0) return res.status(404).json({ success: false, message: '生产线不存在' });
        const rows = await db.query(
            'SELECT * FROM pipeline_history WHERE pipeline_id = ? ORDER BY created_at DESC',
            [req.params.pipelineId]
        );
        const parsed = rows.map(row => ({
            ...row,
            flow_data: typeof row.flow_data === 'string' ? JSON.parse(row.flow_data) : row.flow_data
        }));
        res.json({ success: true, data: parsed });
    } catch (error) {
        logger.error('Get history error:', { message: error.message });
        res.status(500).json({ success: false, message: '获取历史失败' });
    }
});

module.exports = router;
