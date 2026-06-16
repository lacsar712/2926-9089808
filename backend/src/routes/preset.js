const express = require('express');
const db = require('../utils/db');
const logger = require('../utils/logger');
const { roleGuard } = require('../middleware/auth');

const router = express.Router();

const buildWhereClause = (userId, filters = {}) => {
    const conditions = [];
    const params = [];

    conditions.push('(is_public = 1 OR creator_id = ?)');
    params.push(userId);

    if (filters.componentType) {
        conditions.push('component_type = ?');
        params.push(filters.componentType);
    }

    if (filters.keyword) {
        conditions.push('(name LIKE ? OR description LIKE ? OR tags LIKE ?)');
        const kw = `%${filters.keyword}%`;
        params.push(kw, kw, kw);
    }

    return { where: conditions.join(' AND '), params };
};

router.get('/', async (req, res) => {
    try {
        const { component_type, keyword, sort_by = 'created_at', sort_order = 'desc' } = req.query;
        const userId = req.user.id;

        const { where, params } = buildWhereClause(userId, {
            componentType: component_type,
            keyword: keyword
        });

        const validSortFields = ['created_at', 'updated_at', 'usage_count', 'name'];
        const sortField = validSortFields.includes(sort_by) ? sort_by : 'created_at';
        const sortOrder = sort_order === 'asc' ? 'ASC' : 'DESC';

        const rows = await db.query(
            `SELECT id, name, component_type, config, description, tags, is_public, 
                    creator_id, creator_name, usage_count, created_at, updated_at 
             FROM preset WHERE ${where} ORDER BY ${sortField} ${sortOrder}`,
            params
        );

        const data = rows.map(row => ({
            ...row,
            config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
            tags: row.tags ? row.tags.split(',').filter(t => t.trim()) : [],
            is_public: !!row.is_public
        }));

        res.json({ success: true, data });
    } catch (error) {
        logger.error('Get presets error:', { message: error.message });
        res.status(500).json({ success: false, message: '获取预设列表失败' });
    }
});

router.get('/component/:componentType', async (req, res) => {
    try {
        const { componentType } = req.params;
        const userId = req.user.id;

        const { where, params } = buildWhereClause(userId, { componentType });

        const rows = await db.query(
            `SELECT id, name, component_type, description, tags, is_public, 
                    creator_name, usage_count, created_at 
             FROM preset WHERE ${where} ORDER BY usage_count DESC, created_at DESC`,
            params
        );

        const data = rows.map(row => ({
            ...row,
            tags: row.tags ? row.tags.split(',').filter(t => t.trim()) : [],
            is_public: !!row.is_public
        }));

        res.json({ success: true, data });
    } catch (error) {
        logger.error('Get presets by component error:', { message: error.message });
        res.status(500).json({ success: false, message: '获取组件预设失败' });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const rows = await db.query(
            `SELECT * FROM preset WHERE id = ? AND (is_public = 1 OR creator_id = ?)`,
            [id, userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: '预设不存在或无权限访问' });
        }

        const row = rows[0];
        const data = {
            ...row,
            config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
            tags: row.tags ? row.tags.split(',').filter(t => t.trim()) : [],
            is_public: !!row.is_public
        };

        res.json({ success: true, data });
    } catch (error) {
        logger.error('Get preset detail error:', { message: error.message });
        res.status(500).json({ success: false, message: '获取预设详情失败' });
    }
});

router.post('/', roleGuard('admin', 'editor'), async (req, res) => {
    try {
        const { name, component_type, config, description, tags, is_public } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: '预设名称不能为空' });
        }
        if (!component_type) {
            return res.status(400).json({ success: false, message: '组件类型不能为空' });
        }
        if (!config || typeof config !== 'object') {
            return res.status(400).json({ success: false, message: '配置必须为有效的JSON对象' });
        }

        const existing = await db.query(
            'SELECT id FROM preset WHERE name = ? AND creator_id = ?',
            [name.trim(), req.user.id]
        );
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: '您已创建过同名预设' });
        }

        const tagsStr = Array.isArray(tags) ? tags.join(',') : (tags || '');
        const configStr = JSON.stringify(config);

        const result = await db.query(
            `INSERT INTO preset (name, component_type, config, description, tags, is_public, creator_id, creator_name) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                name.trim(),
                component_type,
                configStr,
                description || '',
                tagsStr,
                is_public ? 1 : 0,
                req.user.id,
                req.user.nickname || req.user.username
            ]
        );

        logger.info('Preset created:', { id: result.insertId, name, userId: req.user.id });
        res.json({ success: true, data: { id: result.insertId }, message: '创建成功' });
    } catch (error) {
        logger.error('Create preset error:', { message: error.message });
        res.status(500).json({ success: false, message: '创建预设失败' });
    }
});

router.put('/:id', roleGuard('admin', 'editor'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, component_type, config, description, tags, is_public } = req.body;

        const existing = await db.query('SELECT * FROM preset WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: '预设不存在' });
        }

        if (existing[0].creator_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: '仅创建者或管理员可编辑此预设' });
        }

        const updates = [];
        const params = [];

        if (name !== undefined) {
            if (!name.trim()) {
                return res.status(400).json({ success: false, message: '预设名称不能为空' });
            }
            updates.push('name = ?');
            params.push(name.trim());
        }
        if (component_type !== undefined) {
            updates.push('component_type = ?');
            params.push(component_type);
        }
        if (config !== undefined) {
            if (typeof config !== 'object') {
                return res.status(400).json({ success: false, message: '配置必须为有效的JSON对象' });
            }
            updates.push('config = ?');
            params.push(JSON.stringify(config));
        }
        if (description !== undefined) {
            updates.push('description = ?');
            params.push(description || '');
        }
        if (tags !== undefined) {
            const tagsStr = Array.isArray(tags) ? tags.join(',') : (tags || '');
            updates.push('tags = ?');
            params.push(tagsStr);
        }
        if (is_public !== undefined) {
            updates.push('is_public = ?');
            params.push(is_public ? 1 : 0);
        }

        if (updates.length > 0) {
            params.push(id);
            await db.query(`UPDATE preset SET ${updates.join(', ')} WHERE id = ?`, params);
        }

        logger.info('Preset updated:', { id, userId: req.user.id });
        res.json({ success: true, message: '更新成功' });
    } catch (error) {
        logger.error('Update preset error:', { message: error.message });
        res.status(500).json({ success: false, message: '更新预设失败' });
    }
});

router.delete('/:id', roleGuard('admin', 'editor'), async (req, res) => {
    try {
        const { id } = req.params;

        const existing = await db.query('SELECT * FROM preset WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: '预设不存在' });
        }

        if (existing[0].creator_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: '仅创建者或管理员可删除此预设' });
        }

        await db.query('DELETE FROM preset WHERE id = ?', [id]);
        logger.info('Preset deleted:', { id, userId: req.user.id });
        res.json({ success: true, message: '删除成功' });
    } catch (error) {
        logger.error('Delete preset error:', { message: error.message });
        res.status(500).json({ success: false, message: '删除预设失败' });
    }
});

router.post('/:id/load', async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const rows = await db.query(
            `SELECT * FROM preset WHERE id = ? AND (is_public = 1 OR creator_id = ?)`,
            [id, userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: '预设不存在或无权限访问' });
        }

        await db.query('UPDATE preset SET usage_count = usage_count + 1 WHERE id = ?', [id]);

        const row = rows[0];
        const data = {
            ...row,
            config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
            tags: row.tags ? row.tags.split(',').filter(t => t.trim()) : [],
            is_public: !!row.is_public,
            usage_count: row.usage_count + 1
        };

        logger.info('Preset loaded:', { id, name: row.name, userId });
        res.json({ success: true, data, message: '加载成功' });
    } catch (error) {
        logger.error('Load preset error:', { message: error.message });
        res.status(500).json({ success: false, message: '加载预设失败' });
    }
});

module.exports = router;
