const express = require('express');
const db = require('../utils/db');
const logger = require('../utils/logger');
const { roleGuard } = require('../middleware/auth');
const quotaUtil = require('../utils/quota');

const router = express.Router();

router.get('/usage', async (req, res) => {
    try {
        const userId = req.user.id;
        const [quota, usage] = await Promise.all([
            quotaUtil.getEffectiveQuota(userId),
            quotaUtil.getUsage(userId)
        ]);

        const result = {
            quota: quota.effective,
            usage,
            details: {
                pipelines: {
                    used: usage.pipelines,
                    limit: quota.effective.max_pipelines,
                    remaining: quota.effective.max_pipelines === -1 ? Infinity : quota.effective.max_pipelines - usage.pipelines,
                    percentage: quota.effective.max_pipelines === -1 ? 0 : Math.min(100, (usage.pipelines / quota.effective.max_pipelines) * 100)
                },
                tags: {
                    used: usage.tags,
                    limit: quota.effective.max_tags,
                    remaining: quota.effective.max_tags === -1 ? Infinity : quota.effective.max_tags - usage.tags,
                    percentage: quota.effective.max_tags === -1 ? 0 : Math.min(100, (usage.tags / quota.effective.max_tags) * 100)
                },
                publishes_today: {
                    used: usage.publishes_today,
                    limit: quota.effective.max_publishes_per_day,
                    remaining: quota.effective.max_publishes_per_day === -1 ? Infinity : quota.effective.max_publishes_per_day - usage.publishes_today,
                    percentage: quota.effective.max_publishes_per_day === -1 ? 0 : Math.min(100, (usage.publishes_today / quota.effective.max_publishes_per_day) * 100)
                }
            },
            hasUserOverride: !!quota.userOverride
        };

        res.json({ success: true, data: result });
    } catch (error) {
        logger.error('Get quota usage error:', { message: error.message });
        res.status(500).json({ success: false, message: '获取配额使用情况失败' });
    }
});

router.get('/config', roleGuard('admin'), async (_req, res) => {
    try {
        const config = await quotaUtil.getGlobalConfig();
        res.json({ success: true, data: config });
    } catch (error) {
        logger.error('Get quota config error:', { message: error.message });
        res.status(500).json({ success: false, message: '获取配额配置失败' });
    }
});

router.put('/config', roleGuard('admin'), async (req, res) => {
    try {
        const { max_pipelines, max_tags, max_nodes_per_pipeline, max_publishes_per_day } = req.body;
        
        const existing = await db.query('SELECT id FROM quota_config ORDER BY id DESC LIMIT 1');
        
        if (existing.length > 0) {
            await db.query(
                `UPDATE quota_config SET 
                 max_pipelines = ?, max_tags = ?, max_nodes_per_pipeline = ?, max_publishes_per_day = ?
                 WHERE id = ?`,
                [max_pipelines, max_tags, max_nodes_per_pipeline, max_publishes_per_day, existing[0].id]
            );
        } else {
            await db.query(
                `INSERT INTO quota_config (max_pipelines, max_tags, max_nodes_per_pipeline, max_publishes_per_day)
                 VALUES (?, ?, ?, ?)`,
                [max_pipelines, max_tags, max_nodes_per_pipeline, max_publishes_per_day]
            );
        }

        logger.info('Quota config updated:', { updatedBy: req.user.username });
        res.json({ success: true, message: '全局配额配置已更新' });
    } catch (error) {
        logger.error('Update quota config error:', { message: error.message });
        res.status(500).json({ success: false, message: '更新配额配置失败' });
    }
});

router.get('/users', roleGuard('admin'), async (_req, res) => {
    try {
        const data = await quotaUtil.getAllUsersQuotaUsage();
        res.json({ success: true, data });
    } catch (error) {
        logger.error('Get users quota usage error:', { message: error.message });
        res.status(500).json({ success: false, message: '获取用户配额使用情况失败' });
    }
});

router.get('/user/:userId', roleGuard('admin'), async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const userQuota = await quotaUtil.getUserQuotaOverride(userId);
        const user = await db.query('SELECT id, username, nickname, role FROM sys_user WHERE id = ?', [userId]);
        
        if (user.length === 0) {
            return res.status(404).json({ success: false, message: '用户不存在' });
        }

        res.json({
            success: true,
            data: {
                user: user[0],
                userQuota: userQuota || {
                    max_pipelines: null,
                    max_tags: null,
                    max_nodes_per_pipeline: null,
                    max_publishes_per_day: null
                }
            }
        });
    } catch (error) {
        logger.error('Get user quota error:', { message: error.message });
        res.status(500).json({ success: false, message: '获取用户配额失败' });
    }
});

router.put('/user/:userId', roleGuard('admin'), async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const { max_pipelines, max_tags, max_nodes_per_pipeline, max_publishes_per_day } = req.body;

        const existing = await db.query('SELECT id FROM user_quota WHERE user_id = ?', [userId]);
        
        if (existing.length > 0) {
            await db.query(
                `UPDATE user_quota SET 
                 max_pipelines = ?, max_tags = ?, max_nodes_per_pipeline = ?, max_publishes_per_day = ?
                 WHERE user_id = ?`,
                [max_pipelines, max_tags, max_nodes_per_pipeline, max_publishes_per_day, userId]
            );
        } else {
            await db.query(
                `INSERT INTO user_quota (user_id, max_pipelines, max_tags, max_nodes_per_pipeline, max_publishes_per_day)
                 VALUES (?, ?, ?, ?, ?)`,
                [userId, max_pipelines, max_tags, max_nodes_per_pipeline, max_publishes_per_day]
            );
        }

        logger.info('User quota updated:', { userId, updatedBy: req.user.username });
        res.json({ success: true, message: '用户配额已更新' });
    } catch (error) {
        logger.error('Update user quota error:', { message: error.message });
        res.status(500).json({ success: false, message: '更新用户配额失败' });
    }
});

router.delete('/user/:userId', roleGuard('admin'), async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        await db.query('DELETE FROM user_quota WHERE user_id = ?', [userId]);
        logger.info('User quota deleted:', { userId, updatedBy: req.user.username });
        res.json({ success: true, message: '用户配额已重置为全局配置' });
    } catch (error) {
        logger.error('Delete user quota error:', { message: error.message });
        res.status(500).json({ success: false, message: '重置用户配额失败' });
    }
});

router.get('/export', roleGuard('admin'), async (_req, res) => {
    try {
        const data = await quotaUtil.getAllUsersQuotaUsage();
        
        const headers = ['用户ID', '用户名', '昵称', '角色', 
            '生产线已用', '生产线上限', '生产线剩余',
            '标签已用', '标签上限', '标签剩余',
            '今日发布已用', '今日发布上限', '今日发布剩余'];
        
        const rows = data.map(item => [
            item.user.id,
            item.user.username,
            item.user.nickname,
            { admin: '管理员', editor: '编辑者', viewer: '查看者' }[item.user.role] || item.user.role,
            item.usage.pipelines,
            item.quota.max_pipelines === -1 ? '无限制' : item.quota.max_pipelines,
            item.details.pipelines.remaining === Infinity ? '无限制' : item.details.pipelines.remaining,
            item.usage.tags,
            item.quota.max_tags === -1 ? '无限制' : item.quota.max_tags,
            item.details.tags.remaining === Infinity ? '无限制' : item.details.tags.remaining,
            item.usage.publishes_today,
            item.quota.max_publishes_per_day === -1 ? '无限制' : item.quota.max_publishes_per_day,
            item.details.publishes_today.remaining === Infinity ? '无限制' : item.details.publishes_today.remaining
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        const filename = `quota_usage_${new Date().toISOString().slice(0, 10)}.csv`;
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Cache-Control', 'no-cache');
        
        res.write('\uFEFF');
        res.write(csvContent);
        res.end();

        logger.info('Quota usage CSV exported:', { exportedBy: req.user.username });
    } catch (error) {
        logger.error('Export quota usage error:', { message: error.message });
        res.status(500).json({ success: false, message: '导出CSV失败' });
    }
});

module.exports = router;
