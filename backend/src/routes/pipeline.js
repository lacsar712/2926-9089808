const express = require('express');
const db = require('../utils/db');
const logger = require('../utils/logger');
const { roleGuard } = require('../middleware/auth');
const quotaUtil = require('../utils/quota');

const router = express.Router();

const TRASH_RETENTION_DAYS = 30;

router.get('/', async (req, res) => {
    try {
        const { keyword, status, tagId, environment, page = 1, pageSize = 10 } = req.query;
        let sql = `SELECT p.*, u.nickname as creator_name FROM pipeline p LEFT JOIN sys_user u ON p.creator_id = u.id WHERE p.deleted_at IS NULL`;
        const params = [];
        sql += ` AND p.environment = ?`;
        params.push(environment || req.environment);
        if (keyword) { sql += ` AND (p.name LIKE ? OR p.description LIKE ?)`; params.push(`%${keyword}%`, `%${keyword}%`); }
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

router.get('/trash', async (req, res) => {
    try {
        const { keyword, page = 1, pageSize = 10 } = req.query;
        let sql = `SELECT p.*, u.nickname as creator_name, du.nickname as deleter_name
                   FROM pipeline p
                   LEFT JOIN sys_user u ON p.creator_id = u.id
                   LEFT JOIN sys_user du ON p.deleted_by = du.id
                   WHERE p.deleted_at IS NOT NULL
                   AND p.deleted_at >= DATE_SUB(NOW(), INTERVAL ${TRASH_RETENTION_DAYS} DAY)
                   AND p.environment = ?`;
        const params = [req.environment];
        if (keyword) { sql += ` AND (p.name LIKE ? OR p.description LIKE ?)`; params.push(`%${keyword}%`, `%${keyword}%`); }
        const countSql = sql.replace('SELECT p.*, u.nickname as creator_name, du.nickname as deleter_name', 'SELECT COUNT(*) as total');
        const [countResult] = await db.query(countSql, params);
        const total = countResult.total;
        const limit = parseInt(pageSize);
        const offset = (parseInt(page) - 1) * limit;
        sql += ` ORDER BY p.deleted_at DESC LIMIT ${limit} OFFSET ${offset}`;
        const rows = await db.query(sql, params);
        for (const row of rows) {
            const tags = await db.query(
                'SELECT t.* FROM tag t INNER JOIN pipeline_tag pt ON t.id = pt.tag_id WHERE pt.pipeline_id = ?',
                [row.id]
            );
            row.tags = tags;
            if (row.deleted_at) {
                const deletedAt = new Date(row.deleted_at);
                const expireAt = new Date(deletedAt.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
                const now = new Date();
                const remainingMs = expireAt - now;
                row.remaining_days = Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
            }
        }
        res.json({ success: true, data: { list: rows, total, page: parseInt(page), pageSize: parseInt(pageSize) } });
    } catch (error) {
        logger.error('Get trash pipelines error:', { message: error.message });
        res.status(500).json({ success: false, message: '获取回收站列表失败' });
    }
});

router.get('/trash/stats', async (req, res) => {
    try {
        const [countResult] = await db.query(
            `SELECT COUNT(*) as count,
                    COALESCE(SUM(
                        CASE WHEN pf.flow_data IS NOT NULL
                        THEN CHAR_LENGTH(pf.flow_data)
                        ELSE 0 END
                    ), 0) as flow_size
             FROM pipeline p
             LEFT JOIN pipeline_flow pf ON p.id = pf.pipeline_id
             WHERE p.deleted_at IS NOT NULL
             AND p.deleted_at >= DATE_SUB(NOW(), INTERVAL ${TRASH_RETENTION_DAYS} DAY)`
        );
        const [expiredResult] = await db.query(
            `SELECT COUNT(*) as count FROM pipeline
             WHERE deleted_at IS NOT NULL
             AND deleted_at < DATE_SUB(NOW(), INTERVAL ${TRASH_RETENTION_DAYS} DAY)`
        );
        const formatBytes = (bytes) => {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        };
        res.json({
            success: true,
            data: {
                total_count: countResult.count,
                total_size: countResult.flow_size,
                total_size_formatted: formatBytes(countResult.flow_size),
                expired_count: expiredResult.count,
                retention_days: TRASH_RETENTION_DAYS
            }
        });
    } catch (error) {
        logger.error('Get trash stats error:', { message: error.message });
        res.status(500).json({ success: false, message: '获取回收站统计失败' });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const rows = await db.query(
            'SELECT p.*, u.nickname as creator_name FROM pipeline p LEFT JOIN sys_user u ON p.creator_id = u.id WHERE p.id = ? AND p.deleted_at IS NULL AND p.environment = ?',
            [req.params.id, req.environment]
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

router.post('/', roleGuard('admin', 'editor'), async (req, res) => {
    try {
        const { name, description, tagIds = [], environment } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ success: false, message: '生产线名称不能为空' });

        await quotaUtil.validateQuota(req.user.id, quotaUtil.QUOTA_DIMENSIONS.PIPELINES, 1);

        const pipelineEnv = req.user.role === 'admin' ? (environment || req.environment) : req.environment;
        const result = await db.query(
            'INSERT INTO pipeline (name, description, creator_id, environment) VALUES (?, ?, ?, ?)',
            [name.trim(), description || '', req.user.id, pipelineEnv]
        );
        const pipelineId = result.insertId;
        for (const tagId of tagIds) {
            await db.query('INSERT INTO pipeline_tag (pipeline_id, tag_id) VALUES (?, ?)', [pipelineId, tagId]);
        }
        await db.query('INSERT INTO pipeline_flow (pipeline_id, flow_data) VALUES (?, ?)', [pipelineId, JSON.stringify({ nodes: [], edges: [] })]);
        await db.query(
            'INSERT INTO operation_log (user_id, username, action, target, detail, ip) VALUES (?, ?, ?, ?, ?, ?)',
            [req.user.id, req.user.username, '创建生产线', name, `创建新生产线: ${name}`, req.ip]
        );
        logger.info('Pipeline created:', { id: pipelineId, name });
        res.json({ success: true, data: { id: pipelineId }, message: '创建成功' });
    } catch (error) {
        logger.error('Create pipeline error:', { message: error.message });
        if (error.code === 'QUOTA_EXCEEDED') {
            return res.status(403).json({
                success: false,
                message: error.message,
                code: error.code,
                remaining: error.remaining,
                limit: error.limit
            });
        }
        res.status(500).json({ success: false, message: '创建生产线失败' });
    }
});

router.put('/:id', roleGuard('admin', 'editor'), async (req, res) => {
    try {
        const { name, description, status, tagIds, environment } = req.body;
        if (name !== undefined && !name.trim()) return res.status(400).json({ success: false, message: '名称不能为空' });
        const updates = [];
        const params = [];
        if (name) { updates.push('name = ?'); params.push(name.trim()); }
        if (description !== undefined) { updates.push('description = ?'); params.push(description); }
        if (status) { updates.push('status = ?'); params.push(status); }
        if (environment && req.user.role === 'admin') { updates.push('environment = ?'); params.push(environment); }
        if (updates.length > 0) {
            params.push(req.params.id);
            await db.query(`UPDATE pipeline SET ${updates.join(', ')} WHERE id = ? AND deleted_at IS NULL`, params);
        }
        if (tagIds !== undefined) {
            await db.query('DELETE FROM pipeline_tag WHERE pipeline_id = ?', [req.params.id]);
            for (const tagId of tagIds) {
                await db.query('INSERT INTO pipeline_tag (pipeline_id, tag_id) VALUES (?, ?)', [req.params.id, tagId]);
            }
        }
        logger.info('Pipeline updated:', { id: req.params.id });
        res.json({ success: true, message: '更新成功' });
    } catch (error) {
        logger.error('Update pipeline error:', { message: error.message });
        res.status(500).json({ success: false, message: '更新生产线失败' });
    }
});

router.post('/:id/restore', roleGuard('admin', 'editor'), async (req, res) => {
    try {
        const rows = await db.query('SELECT name FROM pipeline WHERE id = ? AND deleted_at IS NOT NULL', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: '生产线不存在或未删除' });
        await db.query(
            'UPDATE pipeline SET deleted_at = NULL, deleted_by = NULL, status = ? WHERE id = ?',
            ['draft', req.params.id]
        );
        await db.query(
            'INSERT INTO operation_log (user_id, username, action, target, detail, ip) VALUES (?, ?, ?, ?, ?, ?)',
            [req.user.id, req.user.username, '恢复生产线', rows[0].name, `从回收站恢复生产线: ${rows[0].name}`, req.ip]
        );
        logger.info('Pipeline restored:', { id: req.params.id });
        res.json({ success: true, message: '恢复成功' });
    } catch (error) {
        logger.error('Restore pipeline error:', { message: error.message });
        res.status(500).json({ success: false, message: '恢复生产线失败' });
    }
});

router.post('/restore/batch', roleGuard('admin', 'editor'), async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, message: '请选择要恢复的生产线' });
        }
        const placeholders = ids.map(() => '?').join(',');
        const rows = await db.query(`SELECT name FROM pipeline WHERE id IN (${placeholders}) AND deleted_at IS NOT NULL`, ids);
        if (rows.length === 0) return res.status(404).json({ success: false, message: '未找到可恢复的生产线' });
        await db.query(
            `UPDATE pipeline SET deleted_at = NULL, deleted_by = NULL, status = ? WHERE id IN (${placeholders}) AND deleted_at IS NOT NULL`,
            ['draft', ...ids]
        );
        const names = rows.map(r => r.name).join(', ');
        await db.query(
            'INSERT INTO operation_log (user_id, username, action, target, detail, ip) VALUES (?, ?, ?, ?, ?, ?)',
            [req.user.id, req.user.username, '批量恢复生产线', names, `批量恢复生产线: ${names}`, req.ip]
        );
        logger.info('Pipelines batch restored:', { ids });
        res.json({ success: true, message: `成功恢复 ${rows.length} 条生产线` });
    } catch (error) {
        logger.error('Batch restore pipelines error:', { message: error.message });
        res.status(500).json({ success: false, message: '批量恢复生产线失败' });
    }
});

router.delete('/:id', roleGuard('admin', 'editor'), async (req, res) => {
    try {
        const rows = await db.query('SELECT name FROM pipeline WHERE id = ? AND deleted_at IS NULL AND environment = ?', [req.params.id, req.environment]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: '生产线不存在' });
        await db.query(
            'UPDATE pipeline SET deleted_at = NOW(), deleted_by = ? WHERE id = ?',
            [req.user.id, req.params.id]
        );
        await db.query(
            'INSERT INTO operation_log (user_id, username, action, target, detail, ip) VALUES (?, ?, ?, ?, ?, ?)',
            [req.user.id, req.user.username, '删除生产线', rows[0].name, `移入回收站: ${rows[0].name}`, req.ip]
        );
        logger.info('Pipeline soft deleted:', { id: req.params.id });
        res.json({ success: true, message: '已移入回收站' });
    } catch (error) {
        logger.error('Soft delete pipeline error:', { message: error.message });
        res.status(500).json({ success: false, message: '删除生产线失败' });
    }
});

const purgePipelineByIds = async (ids, userId, username, ip) => {
    if (!Array.isArray(ids) || ids.length === 0) return 0;
    const placeholders = ids.map(() => '?').join(',');
    const rows = await db.query(`SELECT id, name FROM pipeline WHERE id IN (${placeholders}) AND deleted_at IS NOT NULL`, ids);
    if (rows.length === 0) return 0;
    const validIds = rows.map(r => r.id);
    const validPlaceholders = validIds.map(() => '?').join(',');
    const runIdsResult = await db.query(`SELECT id FROM pipeline_run WHERE pipeline_id IN (${validPlaceholders})`, validIds);
    const runIds = runIdsResult.map(r => r.id);
    if (runIds.length > 0) {
        const runPlaceholders = runIds.map(() => '?').join(',');
        await db.query(`DELETE FROM node_run_detail WHERE run_id IN (${runPlaceholders})`, runIds);
        await db.query(`DELETE FROM pipeline_run WHERE id IN (${runPlaceholders})`, runIds);
    }
    await db.query(`DELETE FROM pipeline_tag WHERE pipeline_id IN (${validPlaceholders})`, validIds);
    await db.query(`DELETE FROM pipeline_flow WHERE pipeline_id IN (${validPlaceholders})`, validIds);
    await db.query(`DELETE FROM pipeline_history WHERE pipeline_id IN (${validPlaceholders})`, validIds);
    await db.query(`UPDATE alert_rule SET pipeline_id = NULL WHERE pipeline_id IN (${validPlaceholders})`, validIds);
    await db.query(`DELETE FROM pipeline WHERE id IN (${validPlaceholders})`, validIds);
    const names = rows.map(r => r.name).join(', ');
    await db.query(
        'INSERT INTO operation_log (user_id, username, action, target, detail, ip) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, username, '永久删除生产线', names, `永久删除生产线（物理删除）: ${names}`, ip]
    );
    logger.info('Pipelines purged:', { ids: validIds });
    return rows.length;
};

router.delete('/:id/purge', roleGuard('admin', 'editor'), async (req, res) => {
    try {
        const count = await purgePipelineByIds([parseInt(req.params.id)], req.user.id, req.user.username, req.ip);
        if (count === 0) return res.status(404).json({ success: false, message: '生产线不存在或未删除' });
        res.json({ success: true, message: '永久删除成功' });
    } catch (error) {
        logger.error('Purge pipeline error:', { message: error.message });
        res.status(500).json({ success: false, message: '永久删除生产线失败' });
    }
});

router.delete('/purge/batch', roleGuard('admin', 'editor'), async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, message: '请选择要删除的生产线' });
        }
        const count = await purgePipelineByIds(ids.map(id => parseInt(id)), req.user.id, req.user.username, req.ip);
        if (count === 0) return res.status(404).json({ success: false, message: '未找到可删除的生产线' });
        res.json({ success: true, message: `成功永久删除 ${count} 条生产线` });
    } catch (error) {
        logger.error('Batch purge pipelines error:', { message: error.message });
        res.status(500).json({ success: false, message: '批量永久删除失败' });
    }
});

router.delete('/trash/purge-expired', roleGuard('admin', 'editor'), async (req, res) => {
    try {
        const rows = await db.query(
            `SELECT id FROM pipeline
             WHERE deleted_at IS NOT NULL
             AND deleted_at < DATE_SUB(NOW(), INTERVAL ${TRASH_RETENTION_DAYS} DAY)`
        );
        if (rows.length === 0) {
            return res.json({ success: true, message: '没有过期的回收站项目', data: { count: 0 } });
        }
        const ids = rows.map(r => r.id);
        const count = await purgePipelineByIds(ids, req.user.id, req.user.username, req.ip);
        res.json({ success: true, message: `成功清空 ${count} 条过期记录`, data: { count } });
    } catch (error) {
        logger.error('Purge expired pipelines error:', { message: error.message });
        res.status(500).json({ success: false, message: '清空过期记录失败' });
    }
});

module.exports = router;
