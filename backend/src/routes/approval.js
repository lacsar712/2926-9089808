const express = require('express');
const db = require('../utils/db');
const logger = require('../utils/logger');
const { roleGuard } = require('../middleware/auth');
const quotaUtil = require('../utils/quota');

const router = express.Router();

// 提交发布审批申请
router.post('/:pipelineId', roleGuard('admin', 'editor'), async (req, res) => {
    try {
        const { remark } = req.body;
        const pipelineId = req.params.pipelineId;

        const pipelineRows = await db.query(
            'SELECT id, name, version FROM pipeline WHERE id = ? AND deleted_at IS NULL',
            [pipelineId]
        );
        if (pipelineRows.length === 0) {
            return res.status(404).json({ success: false, message: '生产线不存在' });
        }

        const flowRows = await db.query(
            'SELECT flow_data FROM pipeline_flow WHERE pipeline_id = ?',
            [pipelineId]
        );
        if (flowRows.length === 0) {
            return res.status(400).json({ success: false, message: '请先编排生产线' });
        }

        const pendingRows = await db.query(
            'SELECT id FROM publish_request WHERE pipeline_id = ? AND status = ?',
            [pipelineId, 'pending']
        );
        if (pendingRows.length > 0) {
            return res.status(400).json({ success: false, message: '该生产线已有待审批的发布申请' });
        }

        const targetVersion = (pipelineRows[0].version || 0) + 1;
        const flowData = typeof flowRows[0].flow_data === 'string'
            ? flowRows[0].flow_data
            : JSON.stringify(flowRows[0].flow_data);

        const result = await db.query(
            `INSERT INTO publish_request 
             (pipeline_id, applicant_id, applicant_name, target_version, remark, flow_data)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [pipelineId, req.user.id, req.user.username, targetVersion, remark || '', flowData]
        );

        await db.query(
            'INSERT INTO operation_log (user_id, username, action, target, detail, ip) VALUES (?, ?, ?, ?, ?, ?)',
            [
                req.user.id,
                req.user.username,
                '提交发布申请',
                pipelineRows[0].name,
                `申请发布版本 v${targetVersion}`,
                req.ip
            ]
        );

        logger.info('Publish request submitted:', { id: result.insertId, pipelineId });
        res.json({ success: true, message: '已提交发布审批，请等待管理员审核', data: { id: result.insertId } });
    } catch (error) {
        logger.error('Submit publish request error:', { message: error.message });
        res.status(500).json({ success: false, message: '提交审批申请失败' });
    }
});

// 获取审批列表（admin 看全部，editor 看自己的）
router.get('/', async (req, res) => {
    try {
        const { status, keyword, page = 1, pageSize = 10 } = req.query;
        let sql = `SELECT pr.*, p.name as pipeline_name 
                   FROM publish_request pr 
                   LEFT JOIN pipeline p ON pr.pipeline_id = p.id 
                   WHERE 1=1`;
        const params = [];

        if (req.user.role !== 'admin') {
            sql += ' AND pr.applicant_id = ?';
            params.push(req.user.id);
        }

        if (status) {
            sql += ' AND pr.status = ?';
            params.push(status);
        }

        if (keyword) {
            sql += ' AND (p.name LIKE ? OR pr.applicant_name LIKE ? OR pr.remark LIKE ?)';
            params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
        }

        const countSql = sql.replace('SELECT pr.*, p.name as pipeline_name', 'SELECT COUNT(*) as total');
        const [countResult] = await db.query(countSql, params);
        const total = countResult.total;

        const limit = parseInt(pageSize);
        const offset = (parseInt(page) - 1) * limit;
        sql += ' ORDER BY pr.submitted_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const rows = await db.query(sql, params);
        const parsed = rows.map(row => ({
            ...row,
            flow_data: undefined
        }));

        res.json({
            success: true,
            data: { list: parsed, total, page: parseInt(page), pageSize: parseInt(pageSize) }
        });
    } catch (error) {
        logger.error('Get approval list error:', { message: error.message });
        res.status(500).json({ success: false, message: '获取审批列表失败' });
    }
});

// 获取审批详情
router.get('/:id', async (req, res) => {
    try {
        const rows = await db.query(
            `SELECT pr.*, p.name as pipeline_name 
             FROM publish_request pr 
             LEFT JOIN pipeline p ON pr.pipeline_id = p.id 
             WHERE pr.id = ?`,
            [req.params.id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: '审批申请不存在' });
        }

        if (req.user.role !== 'admin' && rows[0].applicant_id !== req.user.id) {
            return res.status(403).json({ success: false, message: '无权限查看此申请' });
        }

        const request = rows[0];
        if (request.flow_data) {
            request.flow_data = typeof request.flow_data === 'string'
                ? JSON.parse(request.flow_data)
                : request.flow_data;
            request.node_count = request.flow_data?.nodes?.length || 0;
            request.edge_count = request.flow_data?.edges?.length || 0;
        }

        res.json({ success: true, data: request });
    } catch (error) {
        logger.error('Get approval detail error:', { message: error.message });
        res.status(500).json({ success: false, message: '获取审批详情失败' });
    }
});

// 批准发布申请
router.post('/:id/approve', roleGuard('admin'), async (req, res) => {
    const conn = await db.pool.getConnection();
    try {
        await conn.beginTransaction();

        const [rows] = await conn.execute(
            'SELECT * FROM publish_request WHERE id = ? FOR UPDATE',
            [req.params.id]
        );
        if (rows.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: '审批申请不存在' });
        }

        const request = rows[0];
        if (request.status !== 'pending') {
            await conn.rollback();
            return res.status(400).json({ success: false, message: '该申请已处理' });
        }

        const [pipelineRows] = await conn.execute(
            'SELECT id, name, version FROM pipeline WHERE id = ? AND deleted_at IS NULL',
            [request.pipeline_id]
        );
        if (pipelineRows.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: '生产线不存在' });
        }

        await quotaUtil.validateQuota(request.applicant_id, quotaUtil.QUOTA_DIMENSIONS.PUBLISHES_PER_DAY, 1);

        const flowData = typeof request.flow_data === 'string'
            ? request.flow_data
            : JSON.stringify(request.flow_data);

        const newVersion = (pipelineRows[0].version || 0) + 1;

        await conn.execute(
            'UPDATE pipeline SET status = ?, version = ? WHERE id = ?',
            ['published', newVersion, request.pipeline_id]
        );

        await conn.execute(
            'UPDATE pipeline_flow SET flow_data = ? WHERE pipeline_id = ?',
            [flowData, request.pipeline_id]
        );

        await conn.execute(
            `INSERT INTO pipeline_history (pipeline_id, version, flow_data, operator, action, remark)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [request.pipeline_id, newVersion, flowData, request.applicant_name, 'publish', request.remark || '']
        );

        await conn.execute(
            `UPDATE publish_request 
             SET status = ?, approver_id = ?, approver_name = ?, approved_at = NOW() 
             WHERE id = ?`,
            ['approved', req.user.id, req.user.username, req.params.id]
        );

        await conn.execute(
            'INSERT INTO operation_log (user_id, username, action, target, detail, ip) VALUES (?, ?, ?, ?, ?, ?)',
            [
                req.user.id,
                req.user.username,
                '批准发布',
                pipelineRows[0].name,
                `批准发布版本 v${newVersion}，申请人：${request.applicant_name}`,
                req.ip
            ]
        );

        await conn.commit();
        logger.info('Publish request approved:', { id: req.params.id, pipelineId: request.pipeline_id });
        res.json({ success: true, message: '已批准发布' });
    } catch (error) {
        await conn.rollback();
        logger.error('Approve publish request error:', { message: error.message });
        res.status(500).json({ success: false, message: '批准发布失败' });
    } finally {
        conn.release();
    }
});

// 驳回发布申请
router.post('/:id/reject', roleGuard('admin'), async (req, res) => {
    try {
        const { rejectReason } = req.body;
        if (!rejectReason || !rejectReason.trim()) {
            return res.status(400).json({ success: false, message: '请填写驳回原因' });
        }

        const rows = await db.query('SELECT * FROM publish_request WHERE id = ?', [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: '审批申请不存在' });
        }
        if (rows[0].status !== 'pending') {
            return res.status(400).json({ success: false, message: '该申请已处理' });
        }

        await db.query(
            `UPDATE publish_request 
             SET status = ?, approver_id = ?, approver_name = ?, reject_reason = ? 
             WHERE id = ?`,
            ['rejected', req.user.id, req.user.username, rejectReason.trim(), req.params.id]
        );

        const [pipelineRows] = await db.query(
            'SELECT name FROM pipeline WHERE id = ?',
            [rows[0].pipeline_id]
        );

        await db.query(
            'INSERT INTO operation_log (user_id, username, action, target, detail, ip) VALUES (?, ?, ?, ?, ?, ?)',
            [
                req.user.id,
                req.user.username,
                '驳回发布',
                pipelineRows?.name || `Pipeline #${rows[0].pipeline_id}`,
                `驳回发布申请，原因：${rejectReason.trim()}，申请人：${rows[0].applicant_name}`,
                req.ip
            ]
        );

        logger.info('Publish request rejected:', { id: req.params.id });
        res.json({ success: true, message: '已驳回发布申请' });
    } catch (error) {
        logger.error('Reject publish request error:', { message: error.message });
        res.status(500).json({ success: false, message: '驳回失败' });
    }
});

// 我的申请列表
router.get('/mine/list', roleGuard('admin', 'editor'), async (req, res) => {
    try {
        const { status, page = 1, pageSize = 10 } = req.query;
        let sql = `SELECT pr.*, p.name as pipeline_name 
                   FROM publish_request pr 
                   LEFT JOIN pipeline p ON pr.pipeline_id = p.id 
                   WHERE pr.applicant_id = ?`;
        const params = [req.user.id];

        if (status) {
            sql += ' AND pr.status = ?';
            params.push(status);
        }

        const countSql = sql.replace('SELECT pr.*, p.name as pipeline_name', 'SELECT COUNT(*) as total');
        const [countResult] = await db.query(countSql, params);
        const total = countResult.total;

        const limit = parseInt(pageSize);
        const offset = (parseInt(page) - 1) * limit;
        sql += ' ORDER BY pr.submitted_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const rows = await db.query(sql, params);
        const parsed = rows.map(row => ({
            ...row,
            flow_data: undefined
        }));

        res.json({
            success: true,
            data: { list: parsed, total, page: parseInt(page), pageSize: parseInt(pageSize) }
        });
    } catch (error) {
        logger.error('Get my approval list error:', { message: error.message });
        res.status(500).json({ success: false, message: '获取我的申请列表失败' });
    }
});

// 待审批数量
router.get('/pending/count', roleGuard('admin'), async (req, res) => {
    try {
        const [result] = await db.query(
            'SELECT COUNT(*) as count FROM publish_request WHERE status = ?',
            ['pending']
        );
        res.json({ success: true, data: { count: result.count } });
    } catch (error) {
        logger.error('Get pending count error:', { message: error.message });
        res.status(500).json({ success: false, message: '获取待审批数量失败' });
    }
});

module.exports = router;
