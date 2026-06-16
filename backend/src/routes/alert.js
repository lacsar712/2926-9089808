const express = require('express');
const db = require('../utils/db');
const logger = require('../utils/logger');
const { roleGuard } = require('../middleware/auth');

const router = express.Router();

const MATCH_RULES_SQL = `
  SELECT ar.*, p.name AS pipeline_name
  FROM alert_rule ar
  LEFT JOIN pipeline p ON ar.pipeline_id = p.id
  WHERE ar.enabled = 1
`;

async function matchAndCreateEvent(run, pipelineId) {
    try {
        const rules = await db.query(MATCH_RULES_SQL);
        for (const rule of rules) {
            if (rule.pipeline_id !== null && rule.pipeline_id !== pipelineId) continue;

            let triggered = false;
            switch (rule.condition_type) {
                case 'run_failed':
                    triggered = run.status === 'failed';
                    break;
                case 'run_timeout':
                    if (run.start_time && run.end_time) {
                        const diffMin = (new Date(run.end_time) - new Date(run.start_time)) / 60000;
                        triggered = diffMin > rule.threshold;
                    }
                    break;
                case 'error_threshold':
                    triggered = (run.error_count || 0) >= rule.threshold;
                    break;
                case 'consecutive_failure': {
                    const recentRuns = await db.query(
                        `SELECT status FROM pipeline_run WHERE pipeline_id = ? ORDER BY start_time DESC LIMIT ?`,
                        [pipelineId, rule.threshold]
                    );
                    if (recentRuns.length >= rule.threshold) {
                        triggered = recentRuns.every(r => r.status === 'failed');
                    }
                    break;
                }
            }

            if (!triggered) continue;

            if (rule.silence_minutes > 0) {
                const [lastEvent] = await db.query(
                    `SELECT triggered_at FROM alert_event WHERE rule_id = ? AND pipeline_id = ? ORDER BY triggered_at DESC LIMIT 1`,
                    [rule.id, pipelineId]
                );
                if (lastEvent) {
                    const elapsed = (Date.now() - new Date(lastEvent.triggered_at).getTime()) / 60000;
                    if (elapsed < rule.silence_minutes) continue;
                }
            }

            await db.query(
                `INSERT INTO alert_event (rule_id, rule_name, pipeline_id, run_id) VALUES (?, ?, ?, ?)`,
                [rule.id, rule.name, pipelineId, run.id]
            );
            logger.info('Alert event created', { ruleId: rule.id, ruleName: rule.name, pipelineId, runId: run.id });
        }
    } catch (error) {
        logger.error('Match alert rules error:', { message: error.message });
    }
}

router.get('/rules', async (req, res) => {
    try {
        const { keyword, conditionType, enabled, page = 1, pageSize = 10 } = req.query;
        let sql = `SELECT ar.*, p.name AS pipeline_name, u.nickname AS creator_name FROM alert_rule ar LEFT JOIN pipeline p ON ar.pipeline_id = p.id LEFT JOIN sys_user u ON ar.creator_id = u.id WHERE 1=1`;
        const params = [];
        if (keyword) { sql += ` AND ar.name LIKE ?`; params.push(`%${keyword}%`); }
        if (conditionType) { sql += ` AND ar.condition_type = ?`; params.push(conditionType); }
        if (enabled !== undefined && enabled !== '') { sql += ` AND ar.enabled = ?`; params.push(parseInt(enabled)); }

        const countSql = sql.replace('SELECT ar.*, p.name AS pipeline_name, u.nickname AS creator_name', 'SELECT COUNT(*) as total');
        const [countResult] = await db.query(countSql, params);
        const total = countResult.total;
        const limit = parseInt(pageSize);
        const offset = (parseInt(page) - 1) * limit;
        sql += ` ORDER BY ar.updated_at DESC LIMIT ${limit} OFFSET ${offset}`;
        const rows = await db.query(sql, params);
        res.json({ success: true, data: { list: rows, total, page: parseInt(page), pageSize: parseInt(pageSize) } });
    } catch (error) {
        logger.error('Get alert rules error:', { message: error.message });
        res.status(500).json({ success: false, message: '获取告警规则列表失败' });
    }
});

router.get('/rules/:id', async (req, res) => {
    try {
        const rows = await db.query(
            `SELECT ar.*, p.name AS pipeline_name, u.nickname AS creator_name FROM alert_rule ar LEFT JOIN pipeline p ON ar.pipeline_id = p.id LEFT JOIN sys_user u ON ar.creator_id = u.id WHERE ar.id = ?`,
            [req.params.id]
        );
        if (rows.length === 0) return res.status(404).json({ success: false, message: '告警规则不存在' });
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        logger.error('Get alert rule error:', { message: error.message });
        res.status(500).json({ success: false, message: '获取告警规则详情失败' });
    }
});

router.post('/rules', roleGuard('admin', 'editor'), async (req, res) => {
    try {
        const { name, pipelineId, conditionType, threshold, silenceMinutes, notifyChannel, enabled } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ success: false, message: '规则名称不能为空' });
        if (!conditionType) return res.status(400).json({ success: false, message: '条件类型不能为空' });

        const result = await db.query(
            `INSERT INTO alert_rule (name, pipeline_id, condition_type, threshold, silence_minutes, notify_channel, enabled, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [name.trim(), pipelineId || null, conditionType, threshold || 0, silenceMinutes || 0, notifyChannel || 'in_app', enabled !== undefined ? enabled : 1, req.user.id]
        );
        await db.query(
            'INSERT INTO operation_log (user_id, username, action, target, detail, ip) VALUES (?, ?, ?, ?, ?, ?)',
            [req.user.id, req.user.username, '创建告警规则', name, `创建告警规则: ${name}`, req.ip]
        );
        logger.info('Alert rule created:', { id: result.insertId, name });
        res.json({ success: true, data: { id: result.insertId }, message: '创建成功' });
    } catch (error) {
        logger.error('Create alert rule error:', { message: error.message });
        res.status(500).json({ success: false, message: '创建告警规则失败' });
    }
});

router.put('/rules/:id', roleGuard('admin', 'editor'), async (req, res) => {
    try {
        const { name, pipelineId, conditionType, threshold, silenceMinutes, notifyChannel, enabled } = req.body;
        if (name !== undefined && !name.trim()) return res.status(400).json({ success: false, message: '规则名称不能为空' });

        const updates = [];
        const params = [];
        if (name !== undefined) { updates.push('name = ?'); params.push(name.trim()); }
        if (pipelineId !== undefined) { updates.push('pipeline_id = ?'); params.push(pipelineId || null); }
        if (conditionType !== undefined) { updates.push('condition_type = ?'); params.push(conditionType); }
        if (threshold !== undefined) { updates.push('threshold = ?'); params.push(threshold); }
        if (silenceMinutes !== undefined) { updates.push('silence_minutes = ?'); params.push(silenceMinutes); }
        if (notifyChannel !== undefined) { updates.push('notify_channel = ?'); params.push(notifyChannel); }
        if (enabled !== undefined) { updates.push('enabled = ?'); params.push(enabled ? 1 : 0); }

        if (updates.length > 0) {
            params.push(req.params.id);
            await db.query(`UPDATE alert_rule SET ${updates.join(', ')} WHERE id = ?`, params);
        }
        logger.info('Alert rule updated:', { id: req.params.id });
        res.json({ success: true, message: '更新成功' });
    } catch (error) {
        logger.error('Update alert rule error:', { message: error.message });
        res.status(500).json({ success: false, message: '更新告警规则失败' });
    }
});

router.delete('/rules/:id', roleGuard('admin', 'editor'), async (req, res) => {
    try {
        const rows = await db.query('SELECT name FROM alert_rule WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: '告警规则不存在' });
        await db.query('DELETE FROM alert_rule WHERE id = ?', [req.params.id]);
        await db.query(
            'INSERT INTO operation_log (user_id, username, action, target, detail, ip) VALUES (?, ?, ?, ?, ?, ?)',
            [req.user.id, req.user.username, '删除告警规则', rows[0].name, `删除告警规则: ${rows[0].name}`, req.ip]
        );
        logger.info('Alert rule deleted:', { id: req.params.id });
        res.json({ success: true, message: '删除成功' });
    } catch (error) {
        logger.error('Delete alert rule error:', { message: error.message });
        res.status(500).json({ success: false, message: '删除告警规则失败' });
    }
});

router.post('/rules/:id/simulate', roleGuard('admin', 'editor'), async (req, res) => {
    try {
        const rules = await db.query('SELECT * FROM alert_rule WHERE id = ?', [req.params.id]);
        if (rules.length === 0) return res.status(404).json({ success: false, message: '告警规则不存在' });
        const rule = rules[0];
        await db.query(
            `INSERT INTO alert_event (rule_id, rule_name, pipeline_id, run_id) VALUES (?, ?, ?, NULL)`,
            [rule.id, rule.name, rule.pipeline_id]
        );
        logger.info('Alert simulated event created', { ruleId: rule.id });
        res.json({ success: true, message: '模拟触发成功，已写入测试事件' });
    } catch (error) {
        logger.error('Simulate alert error:', { message: error.message });
        res.status(500).json({ success: false, message: '模拟触发失败' });
    }
});

router.patch('/rules/:id/toggle', roleGuard('admin', 'editor'), async (req, res) => {
    try {
        const { enabled } = req.body;
        await db.query('UPDATE alert_rule SET enabled = ? WHERE id = ?', [enabled ? 1 : 0, req.params.id]);
        logger.info('Alert rule toggled:', { id: req.params.id, enabled });
        res.json({ success: true, message: enabled ? '已启用' : '已禁用' });
    } catch (error) {
        logger.error('Toggle alert rule error:', { message: error.message });
        res.status(500).json({ success: false, message: '切换状态失败' });
    }
});

router.get('/events', async (req, res) => {
    try {
        const { ruleName, confirmed, startTime, endTime, page = 1, pageSize = 10 } = req.query;
        let sql = `SELECT ae.*, p.name AS pipeline_name FROM alert_event ae LEFT JOIN pipeline p ON ae.pipeline_id = p.id WHERE 1=1`;
        const params = [];
        if (ruleName) { sql += ` AND ae.rule_name LIKE ?`; params.push(`%${ruleName}%`); }
        if (confirmed !== undefined && confirmed !== '') { sql += ` AND ae.confirmed = ?`; params.push(parseInt(confirmed)); }
        if (startTime) { sql += ` AND ae.triggered_at >= ?`; params.push(startTime); }
        if (endTime) { sql += ` AND ae.triggered_at <= ?`; params.push(endTime); }

        const countSql = sql.replace('SELECT ae.*, p.name AS pipeline_name', 'SELECT COUNT(*) as total');
        const [countResult] = await db.query(countSql, params);
        const total = countResult.total;
        const limit = parseInt(pageSize);
        const offset = (parseInt(page) - 1) * limit;
        sql += ` ORDER BY ae.triggered_at DESC LIMIT ${limit} OFFSET ${offset}`;
        const rows = await db.query(sql, params);
        res.json({ success: true, data: { list: rows, total, page: parseInt(page), pageSize: parseInt(pageSize) } });
    } catch (error) {
        logger.error('Get alert events error:', { message: error.message });
        res.status(500).json({ success: false, message: '获取告警事件列表失败' });
    }
});

router.patch('/events/batch-confirm', roleGuard('admin', 'editor'), async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, message: '请选择要确认的事件' });
        }
        const placeholders = ids.map(() => '?').join(',');
        await db.query(
            `UPDATE alert_event SET confirmed = 1, confirmed_by = ?, confirmed_at = NOW() WHERE id IN (${placeholders}) AND confirmed = 0`,
            [req.user.username, ...ids]
        );
        logger.info('Alert events batch confirmed', { ids });
        res.json({ success: true, message: '批量确认成功' });
    } catch (error) {
        logger.error('Batch confirm events error:', { message: error.message });
        res.status(500).json({ success: false, message: '批量确认失败' });
    }
});

router.get('/events/export', async (req, res) => {
    try {
        const { startTime, endTime } = req.query;
        let sql = `SELECT ae.id, ae.rule_name, ae.pipeline_id, p.name AS pipeline_name, ae.run_id, ae.triggered_at, ae.confirmed, ae.confirmed_by, ae.confirmed_at FROM alert_event ae LEFT JOIN pipeline p ON ae.pipeline_id = p.id WHERE 1=1`;
        const params = [];
        if (startTime) { sql += ` AND ae.triggered_at >= ?`; params.push(startTime); }
        if (endTime) { sql += ` AND ae.triggered_at <= ?`; params.push(endTime); }
        sql += ` ORDER BY ae.triggered_at DESC`;
        const rows = await db.query(sql, params);

        const header = 'ID,规则名称,关联生产线,关联Run ID,触发时间,是否确认,确认人,确认时间\n';
        const csvRows = rows.map(r =>
            `${r.id},"${r.rule_name}","${r.pipeline_name || '全部'}",${r.run_id || ''},"${r.triggered_at}",${r.confirmed ? '是' : '否'},"${r.confirmed_by || ''}","${r.confirmed_at || ''}"`
        );
        const csv = '\uFEFF' + header + csvRows.join('\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=alert_events_${Date.now()}.csv`);
        res.send(csv);
    } catch (error) {
        logger.error('Export alert events error:', { message: error.message });
        res.status(500).json({ success: false, message: '导出失败' });
    }
});

module.exports = { router, matchAndCreateEvent };
