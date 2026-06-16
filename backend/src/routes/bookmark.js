const express = require('express');
const db = require('../utils/db');
const logger = require('../utils/logger');

const router = express.Router();

// 收藏运行记录
router.post('/', async (req, res) => {
    try {
        const { runId, remark } = req.body;
        const userId = req.user.id;

        if (!runId) {
            return res.status(400).json({ success: false, message: '运行ID不能为空' });
        }

        const runs = await db.query('SELECT id FROM pipeline_run WHERE id = ?', [runId]);
        if (runs.length === 0) {
            return res.status(404).json({ success: false, message: '运行记录不存在' });
        }

        const existing = await db.query(
            'SELECT id FROM run_bookmark WHERE user_id = ? AND run_id = ?',
            [userId, runId]
        );

        if (existing.length > 0) {
            await db.query(
                'UPDATE run_bookmark SET remark = ?, created_at = CURRENT_TIMESTAMP WHERE user_id = ? AND run_id = ?',
                [remark || null, userId, runId]
            );
            return res.json({ success: true, message: '更新收藏成功', bookmarked: true });
        }

        await db.query(
            'INSERT INTO run_bookmark (user_id, run_id, remark) VALUES (?, ?, ?)',
            [userId, runId, remark || null]
        );

        res.json({ success: true, message: '收藏成功', bookmarked: true });
    } catch (error) {
        logger.error('Bookmark run error:', { message: error.message });
        res.status(500).json({ success: false, message: '收藏失败' });
    }
});

// 取消收藏
router.delete('/:runId', async (req, res) => {
    try {
        const { runId } = req.params;
        const userId = req.user.id;

        await db.query(
            'DELETE FROM run_bookmark WHERE user_id = ? AND run_id = ?',
            [userId, runId]
        );

        res.json({ success: true, message: '取消收藏成功', bookmarked: false });
    } catch (error) {
        logger.error('Unbookmark run error:', { message: error.message });
        res.status(500).json({ success: false, message: '取消收藏失败' });
    }
});

// 批量取消收藏
router.delete('/', async (req, res) => {
    try {
        const { runIds } = req.body;
        const userId = req.user.id;

        if (!Array.isArray(runIds) || runIds.length === 0) {
            return res.status(400).json({ success: false, message: '请选择要取消收藏的记录' });
        }

        const placeholders = runIds.map(() => '?').join(',');
        await db.query(
            `DELETE FROM run_bookmark WHERE user_id = ? AND run_id IN (${placeholders})`,
            [userId, ...runIds]
        );

        res.json({ success: true, message: `已取消 ${runIds.length} 条收藏` });
    } catch (error) {
        logger.error('Batch unbookmark error:', { message: error.message });
        res.status(500).json({ success: false, message: '批量取消收藏失败' });
    }
});

// 获取收藏列表
router.get('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const { keyword, page = 1, pageSize = 10 } = req.query;
        const offset = (page - 1) * pageSize;

        let countSql = `
            SELECT COUNT(*) as total
            FROM run_bookmark b
            INNER JOIN pipeline_run r ON b.run_id = r.id
            INNER JOIN pipeline p ON r.pipeline_id = p.id
            WHERE b.user_id = ? AND p.deleted_at IS NULL
        `;

        let listSql = `
            SELECT
                b.id as bookmark_id,
                b.remark as bookmark_remark,
                b.created_at as bookmark_time,
                r.id as run_id,
                r.status,
                r.start_time,
                r.end_time,
                r.total_input,
                r.total_output,
                r.error_count,
                p.id as pipeline_id,
                p.name as pipeline_name
            FROM run_bookmark b
            INNER JOIN pipeline_run r ON b.run_id = r.id
            INNER JOIN pipeline p ON r.pipeline_id = p.id
            WHERE b.user_id = ? AND p.deleted_at IS NULL
        `;

        const params = [userId];
        if (keyword) {
            const keywordParam = `%${keyword}%`;
            countSql += ' AND (p.name LIKE ? OR b.remark LIKE ?)';
            listSql += ' AND (p.name LIKE ? OR b.remark LIKE ?)';
            params.push(keywordParam, keywordParam);
        }

        listSql += ' ORDER BY b.created_at DESC LIMIT ? OFFSET ?';
        const listParams = [...params, parseInt(pageSize), parseInt(offset)];

        const [countResult] = await db.query(countSql, params);
        const list = await db.query(listSql, listParams);

        res.json({
            success: true,
            data: {
                list,
                total: countResult.total,
                page: parseInt(page),
                pageSize: parseInt(pageSize)
            }
        });
    } catch (error) {
        logger.error('Get bookmarks error:', { message: error.message });
        res.status(500).json({ success: false, message: '获取收藏列表失败' });
    }
});

// 导出收藏清单CSV
router.get('/export', async (req, res) => {
    try {
        const userId = req.user.id;
        const { keyword } = req.query;

        let sql = `
            SELECT
                r.id as run_id,
                p.name as pipeline_name,
                r.status,
                r.start_time,
                r.end_time,
                r.total_input,
                r.total_output,
                r.error_count,
                b.remark as bookmark_remark,
                b.created_at as bookmark_time
            FROM run_bookmark b
            INNER JOIN pipeline_run r ON b.run_id = r.id
            INNER JOIN pipeline p ON r.pipeline_id = p.id
            WHERE b.user_id = ? AND p.deleted_at IS NULL
        `;

        const params = [userId];
        if (keyword) {
            const keywordParam = `%${keyword}%`;
            sql += ' AND (p.name LIKE ? OR b.remark LIKE ?)';
            params.push(keywordParam, keywordParam);
        }

        sql += ' ORDER BY b.created_at DESC';

        const list = await db.query(sql, params);

        const statusMap = { running: '运行中', completed: '已完成', failed: '失败', cancelled: '已取消' };
        const calcDuration = (s, e) => {
            if (!s) return '-';
            if (!e) return '进行中';
            const diff = (new Date(e) - new Date(s)) / 60000;
            const hours = Math.floor(diff / 60);
            const minutes = Math.floor(diff % 60);
            return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
        };
        const formatDate = (d) => d ? new Date(d).toLocaleString('zh-CN') : '-';

        const headers = ['运行ID', '生产线名', '状态', '总输入', '总输出', '错误数', '耗时', '备注', '收藏时间'];
        const rows = list.map(item => [
            item.run_id,
            item.pipeline_name,
            statusMap[item.status] || item.status,
            item.total_input || 0,
            item.total_output || 0,
            item.error_count || 0,
            calcDuration(item.start_time, item.end_time),
            item.bookmark_remark || '',
            formatDate(item.bookmark_time)
        ]);

        const escapeCsv = (str) => {
            if (str === null || str === undefined) return '';
            str = String(str);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        const csvContent = [headers, ...rows]
            .map(row => row.map(escapeCsv).join(','))
            .join('\n');

        const bom = '\uFEFF';
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="bookmarks_${Date.now()}.csv"`);
        res.send(bom + csvContent);
    } catch (error) {
        logger.error('Export bookmarks error:', { message: error.message });
        res.status(500).json({ success: false, message: '导出失败' });
    }
});

// 检查运行记录是否已收藏
router.get('/check/:runId', async (req, res) => {
    try {
        const { runId } = req.params;
        const userId = req.user.id;

        const result = await db.query(
            'SELECT id, remark, created_at FROM run_bookmark WHERE user_id = ? AND run_id = ?',
            [userId, runId]
        );

        res.json({
            success: true,
            data: {
                bookmarked: result.length > 0,
                remark: result[0]?.remark || null,
                bookmarkTime: result[0]?.created_at || null
            }
        });
    } catch (error) {
        logger.error('Check bookmark error:', { message: error.message });
        res.status(500).json({ success: false, message: '检查收藏状态失败' });
    }
});

module.exports = router;
