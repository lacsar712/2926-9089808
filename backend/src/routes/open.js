const express = require('express');
const db = require('../utils/db');
const logger = require('../utils/logger');
const { apiKeyAuth } = require('../middleware/apiKeyAuth');

const router = express.Router();

// ============ Pipelines (read scope) ============

router.get('/pipelines', apiKeyAuth('read'), async (req, res) => {
    try {
        const { keyword, status, tagId, page = 1, pageSize = 10 } = req.query;
        let sql = `SELECT p.*, u.nickname as creator_name FROM pipeline p LEFT JOIN sys_user u ON p.creator_id = u.id WHERE p.deleted_at IS NULL`;
        const params = [];
        if (keyword) {
            sql += ` AND (p.name LIKE ? OR p.description LIKE ?)`;
            params.push(`%${keyword}%`, `%${keyword}%`);
        }
        if (status) { sql += ` AND p.status = ?`; params.push(status); }
        if (tagId) {
            sql += ` AND p.id IN (SELECT pipeline_id FROM pipeline_tag WHERE tag_id = ?)`;
            params.push(tagId);
        }
        const countSql = sql.replace('SELECT p.*, u.nickname as creator_name', 'SELECT COUNT(*) as total');
        const [countResult] = await db.query(countSql, params);
        const total = countResult.total;
        const limit = parseInt(pageSize);
        const offset = (parseInt(page) - 1) * limit;
        sql += ` ORDER BY p.updated_at DESC LIMIT ${limit} OFFSET ${offset}`;
        const rows = await db.query(sql, params);
        for (const row of rows) {
            const tags = await db.query(
                'SELECT t.* FROM tag t INNER JOIN pipeline_tag pt ON t.id = pt.tag_id WHERE pt.pipeline_id = ?',
                [row.id]
            );
            row.tags = tags;
        }
        res.json({ success: true, data: { list: rows, total, page: parseInt(page), pageSize: parseInt(pageSize) } });
    } catch (error) {
        logger.error('Get pipelines error:', { message: error.message });
        res.status(500).json({ success: false, message: '获取生产线列表失败' });
    }
});

router.get('/pipelines/:id', apiKeyAuth('read'), async (req, res) => {
    try {
        const rows = await db.query(
            'SELECT p.*, u.nickname as creator_name FROM pipeline p LEFT JOIN sys_user u ON p.creator_id = u.id WHERE p.id = ? AND p.deleted_at IS NULL',
            [req.params.id]
        );
        if (rows.length === 0) return res.status(404).json({ success: false, message: '生产线不存在' });
        const pipeline = rows[0];
        pipeline.tags = await db.query(
            'SELECT t.* FROM tag t INNER JOIN pipeline_tag pt ON t.id = pt.tag_id WHERE pt.pipeline_id = ?',
            [pipeline.id]
        );
        res.json({ success: true, data: pipeline });
    } catch (error) {
        logger.error('Get pipeline error:', { message: error.message });
        res.status(500).json({ success: false, message: '获取生产线详情失败' });
    }
});

// ============ Monitor (read scope) ============

router.get('/monitor/overview', apiKeyAuth('read'), async (_req, res) => {
    try {
        const [totalPipelines] = await db.query('SELECT COUNT(*) as count FROM pipeline WHERE deleted_at IS NULL');
        const [runningPipelines] = await db.query("SELECT COUNT(*) as count FROM pipeline WHERE status = 'running' AND deleted_at IS NULL");
        const [totalRuns] = await db.query('SELECT COUNT(*) as count FROM pipeline_run r INNER JOIN pipeline p ON r.pipeline_id = p.id WHERE p.deleted_at IS NULL');
        const [failedRuns] = await db.query("SELECT COUNT(*) as count FROM pipeline_run r INNER JOIN pipeline p ON r.pipeline_id = p.id WHERE r.status = 'failed' AND p.deleted_at IS NULL");
        const recentRuns = await db.query(
            `SELECT r.*, p.name as pipeline_name FROM pipeline_run r LEFT JOIN pipeline p ON r.pipeline_id = p.id WHERE p.deleted_at IS NULL ORDER BY r.start_time DESC LIMIT 10`
        );
        const pipelineStats = await db.query(
            `SELECT p.id, p.name, p.status, COUNT(r.id) as run_count,
       SUM(r.total_input) as total_input, SUM(r.total_output) as total_output, SUM(r.error_count) as total_errors
       FROM pipeline p LEFT JOIN pipeline_run r ON p.id = r.pipeline_id WHERE p.deleted_at IS NULL GROUP BY p.id ORDER BY run_count DESC`
        );
        res.json({
            success: true,
            data: {
                summary: {
                    totalPipelines: totalPipelines.count,
                    runningPipelines: runningPipelines.count,
                    totalRuns: totalRuns.count,
                    failedRuns: failedRuns.count
                },
                recentRuns,
                pipelineStats
            }
        });
    } catch (error) {
        logger.error('Get overview error:', { message: error.message });
        res.status(500).json({ success: false, message: '获取监控概览失败' });
    }
});

router.get('/monitor/runs', apiKeyAuth('read'), async (req, res) => {
    try {
        const { pipelineId, status } = req.query;
        let sql = `SELECT r.*, p.name as pipeline_name FROM pipeline_run r LEFT JOIN pipeline p ON r.pipeline_id = p.id WHERE p.deleted_at IS NULL`;
        const params = [];
        if (pipelineId) { sql += ' AND r.pipeline_id = ?'; params.push(pipelineId); }
        if (status) { sql += ' AND r.status = ?'; params.push(status); }
        sql += ' ORDER BY r.start_time DESC LIMIT 50';
        const rows = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        logger.error('Get runs error:', { message: error.message });
        res.status(500).json({ success: false, message: '获取运行记录失败' });
    }
});

router.get('/monitor/runs/:runId', apiKeyAuth('read'), async (req, res) => {
    try {
        const runs = await db.query(
            'SELECT r.*, p.name as pipeline_name FROM pipeline_run r LEFT JOIN pipeline p ON r.pipeline_id = p.id WHERE r.id = ?',
            [req.params.runId]
        );
        if (runs.length === 0) return res.status(404).json({ success: false, message: '运行记录不存在' });
        const details = await db.query('SELECT * FROM node_run_detail WHERE run_id = ? ORDER BY start_time', [req.params.runId]);
        const parsedDetails = details.map(d => ({
            ...d,
            input_sample: typeof d.input_sample === 'string' ? JSON.parse(d.input_sample) : d.input_sample,
            output_sample: typeof d.output_sample === 'string' ? JSON.parse(d.output_sample) : d.output_sample
        }));
        res.json({ success: true, data: { ...runs[0], nodeDetails: parsedDetails } });
    } catch (error) {
        logger.error('Get run detail error:', { message: error.message });
        res.status(500).json({ success: false, message: '获取运行详情失败' });
    }
});

// ============ Flow (write scope) ============

router.put('/flows/:pipelineId', apiKeyAuth('write'), async (req, res) => {
    try {
        const { flowData } = req.body;
        if (!flowData) return res.status(400).json({ success: false, message: '编排数据不能为空' });
        const pipelineRows = await db.query('SELECT id FROM pipeline WHERE id = ? AND deleted_at IS NULL', [req.params.pipelineId]);
        if (pipelineRows.length === 0) return res.status(404).json({ success: false, message: '生产线不存在' });
        const existing = await db.query('SELECT id FROM pipeline_flow WHERE pipeline_id = ?', [req.params.pipelineId]);
        if (existing.length === 0) {
            await db.query('INSERT INTO pipeline_flow (pipeline_id, flow_data) VALUES (?, ?)',
                [req.params.pipelineId, JSON.stringify(flowData)]);
        } else {
            await db.query('UPDATE pipeline_flow SET flow_data = ? WHERE pipeline_id = ?',
                [JSON.stringify(flowData), req.params.pipelineId]);
        }
        logger.info('Flow saved via API key:', { pipelineId: req.params.pipelineId, apiKeyId: req.apiKey?.id });
        res.json({ success: true, message: '保存成功' });
    } catch (error) {
        logger.error('Save flow error:', { message: error.message });
        res.status(500).json({ success: false, message: '保存编排数据失败' });
    }
});

// ============ Pipeline (write scope) ============

router.post('/pipelines', apiKeyAuth('write'), async (req, res) => {
    try {
        const { name, description, tagIds = [] } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ success: false, message: '生产线名称不能为空' });
        const result = await db.query(
            'INSERT INTO pipeline (name, description, creator_id) VALUES (?, ?, ?)',
            [name.trim(), description || '', req.apiKey?.userId || null]
        );
        const pipelineId = result.insertId;
        for (const tagId of tagIds) {
            await db.query('INSERT INTO pipeline_tag (pipeline_id, tag_id) VALUES (?, ?)', [pipelineId, tagId]);
        }
        await db.query('INSERT INTO pipeline_flow (pipeline_id, flow_data) VALUES (?, ?)', [pipelineId, JSON.stringify({ nodes: [], edges: [] })]);
        logger.info('Pipeline created via API key:', { id: pipelineId, name, apiKeyId: req.apiKey?.id });
        res.json({ success: true, data: { id: pipelineId }, message: '创建成功' });
    } catch (error) {
        logger.error('Create pipeline error:', { message: error.message });
        res.status(500).json({ success: false, message: '创建生产线失败' });
    }
});

module.exports = router;