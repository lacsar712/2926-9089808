const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../utils/db');
const logger = require('../utils/logger');

const router = express.Router();

const generateApiKey = () => {
    const prefix = 'dp_' + crypto.randomBytes(4).toString('hex');
    const key = prefix + crypto.randomBytes(24).toString('hex');
    return { prefix, key };
};

const getExpiryDate = (days) => {
    if (!days || days === -1) return null;
    const date = new Date();
    date.setDate(date.getDate() + parseInt(days));
    return date;
};

router.get('/', async (req, res) => {
    try {
        const { page = 1, pageSize = 10, scope, status } = req.query;
        let sql = 'SELECT id, name, key_prefix, scope, status, expires_at, last_used_at, created_at, revoked_at FROM api_key WHERE user_id = ?';
        const params = [req.user.id];
        if (scope) { sql += ' AND scope = ?'; params.push(scope); }
        if (status) { sql += ' AND status = ?'; params.push(status); }
        const countSql = sql.replace('SELECT id, name, key_prefix, scope, status, expires_at, last_used_at, created_at, revoked_at', 'SELECT COUNT(*) as total');
        const [countResult] = await db.query(countSql, params);
        const limit = parseInt(pageSize);
        const offset = (parseInt(page) - 1) * limit;
        sql += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
        const rows = await db.query(sql, params);
        const list = rows.map(row => ({
            ...row,
            is_expired: row.expires_at ? new Date(row.expires_at) < new Date() : false
        }));
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
        logger.error('Get api keys error:', { message: error.message });
        res.status(500).json({ success: false, message: '获取 API 密钥列表失败' });
    }
});

router.post('/', async (req, res) => {
    try {
        const { name, scope = 'read', expiresIn = 30 } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: '密钥名称不能为空' });
        }
        if (!['read', 'write'].includes(scope)) {
            return res.status(400).json({ success: false, message: '无效的 scope 值' });
        }
        if (![30, 90, 365, -1].includes(parseInt(expiresIn))) {
            return res.status(400).json({ success: false, message: '无效的过期时间' });
        }
        const { prefix, key } = generateApiKey();
        const keyHash = await bcrypt.hash(key, 10);
        const expiresAt = getExpiryDate(expiresIn);
        const result = await db.query(
            'INSERT INTO api_key (name, key_prefix, key_hash, scope, user_id, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
            [name.trim(), prefix, keyHash, scope, req.user.id, expiresAt]
        );
        logger.info('API key created:', { id: result.insertId, name: name.trim(), userId: req.user.id });
        res.json({
            success: true,
            data: {
                id: result.insertId,
                name: name.trim(),
                key,
                key_prefix: prefix,
                scope,
                expires_at: expiresAt,
                created_at: new Date()
            },
            message: '创建成功'
        });
    } catch (error) {
        logger.error('Create api key error:', { message: error.message });
        res.status(500).json({ success: false, message: '创建 API 密钥失败' });
    }
});

router.put('/:id/revoke', async (req, res) => {
    try {
        const keys = await db.query('SELECT * FROM api_key WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        if (keys.length === 0) {
            return res.status(404).json({ success: false, message: 'API 密钥不存在' });
        }
        if (keys[0].status === 'revoked') {
            return res.status(400).json({ success: false, message: 'API 密钥已被吊销' });
        }
        await db.query(
            'UPDATE api_key SET status = ?, revoked_at = NOW() WHERE id = ?',
            ['revoked', req.params.id]
        );
        logger.info('API key revoked:', { id: req.params.id, userId: req.user.id });
        res.json({ success: true, message: '吊销成功' });
    } catch (error) {
        logger.error('Revoke api key error:', { message: error.message });
        res.status(500).json({ success: false, message: '吊销 API 密钥失败' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const keys = await db.query('SELECT * FROM api_key WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        if (keys.length === 0) {
            return res.status(404).json({ success: false, message: 'API 密钥不存在' });
        }
        await db.query('DELETE FROM api_key WHERE id = ?', [req.params.id]);
        logger.info('API key deleted:', { id: req.params.id, userId: req.user.id });
        res.json({ success: true, message: '删除成功' });
    } catch (error) {
        logger.error('Delete api key error:', { message: error.message });
        res.status(500).json({ success: false, message: '删除 API 密钥失败' });
    }
});

module.exports = router;