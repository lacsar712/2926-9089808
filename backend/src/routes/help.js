const express = require('express');
const db = require('../utils/db');
const logger = require('../utils/logger');
const { authMiddleware, roleGuard } = require('../middleware/auth');

const router = express.Router();

const buildCategoryTree = (categories, articles) => {
    const categoryMap = {};
    const roots = [];

    categories.forEach(cat => {
        categoryMap[cat.id] = { ...cat, children: [], articles: [] };
    });

    articles.forEach(article => {
        if (categoryMap[article.category_id]) {
            categoryMap[article.category_id].articles.push(article);
        }
    });

    categories.forEach(cat => {
        if (cat.parent_id && categoryMap[cat.parent_id]) {
            categoryMap[cat.parent_id].children.push(categoryMap[cat.id]);
        } else if (!cat.parent_id) {
            roots.push(categoryMap[cat.id]);
        }
    });

    return roots;
};

router.get('/categories', async (_req, res) => {
    try {
        const categories = await db.query(
            'SELECT * FROM help_category ORDER BY sort_order ASC, id ASC'
        );

        const articles = await db.query(
            `SELECT id, title, slug, category_id, sort_order, view_count, created_at, updated_at
             FROM help_article
             WHERE status = 'published'
             ORDER BY sort_order ASC, id ASC`
        );

        const tree = buildCategoryTree(categories, articles);
        res.json({ success: true, data: tree });
    } catch (error) {
        logger.error('Get help categories error:', { message: error.message });
        res.status(500).json({ success: false, message: '获取帮助分类失败' });
    }
});

router.get('/articles/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const isNumeric = /^\d+$/.test(id);

        let article;
        if (isNumeric) {
            article = await db.query(
                `SELECT a.*, c.name as category_name, c.slug as category_slug
                 FROM help_article a
                 LEFT JOIN help_category c ON a.category_id = c.id
                 WHERE a.id = ? AND a.status = 'published'`,
                [id]
            );
        } else {
            article = await db.query(
                `SELECT a.*, c.name as category_name, c.slug as category_slug
                 FROM help_article a
                 LEFT JOIN help_category c ON a.category_id = c.id
                 WHERE a.slug = ? AND a.status = 'published'`,
                [id]
            );
        }

        if (article.length === 0) {
            return res.status(404).json({ success: false, message: '文章不存在' });
        }

        await db.query(
            'UPDATE help_article SET view_count = view_count + 1 WHERE id = ?',
            [article[0].id]
        );

        const feedbackStats = await db.query(
            `SELECT
                COUNT(*) as total_count,
                SUM(CASE WHEN is_helpful = 1 THEN 1 ELSE 0 END) as helpful_count,
                SUM(CASE WHEN is_helpful = 0 THEN 1 ELSE 0 END) as not_helpful_count
             FROM help_feedback
             WHERE article_id = ?`,
            [article[0].id]
        );

        res.json({
            success: true,
            data: {
                ...article[0],
                feedback: feedbackStats[0]
            }
        });
    } catch (error) {
        logger.error('Get help article error:', { message: error.message });
        res.status(500).json({ success: false, message: '获取文章详情失败' });
    }
});

router.get('/search', async (req, res) => {
    try {
        const { keyword, limit = 20, offset = 0 } = req.query;

        if (!keyword || !keyword.trim()) {
            return res.json({ success: true, data: [], total: 0 });
        }

        const searchKeyword = `%${keyword.trim()}%`;

        const articles = await db.query(
            `SELECT a.id, a.title, a.slug, a.content, a.category_id, c.name as category_name, c.slug as category_slug
             FROM help_article a
             LEFT JOIN help_category c ON a.category_id = c.id
             WHERE a.status = 'published'
             AND (a.title LIKE ? OR a.content LIKE ?)
             ORDER BY
                 CASE WHEN a.title LIKE ? THEN 0 ELSE 1 END,
                 a.sort_order ASC
             LIMIT ? OFFSET ?`,
            [searchKeyword, searchKeyword, searchKeyword, parseInt(limit), parseInt(offset)]
        );

        const countResult = await db.query(
            `SELECT COUNT(*) as total
             FROM help_article a
             WHERE a.status = 'published'
             AND (a.title LIKE ? OR a.content LIKE ?)`,
            [searchKeyword, searchKeyword]
        );

        const results = articles.map(article => {
            const content = article.content || '';
            const keywordLower = keyword.toLowerCase();
            const contentLower = content.toLowerCase();
            const index = contentLower.indexOf(keywordLower);

            let snippet = '';
            if (index >= 0) {
                const start = Math.max(0, index - 50);
                const end = Math.min(content.length, index + keyword.length + 50);
                snippet = (start > 0 ? '...' : '') + content.substring(start, end) + (end < content.length ? '...' : '');
            } else {
                snippet = content.substring(0, 100) + (content.length > 100 ? '...' : '');
            }

            return {
                id: article.id,
                title: article.title,
                slug: article.slug,
                category_id: article.category_id,
                category_name: article.category_name,
                category_slug: article.category_slug,
                snippet
            };
        });

        res.json({ success: true, data: results, total: countResult[0].total });
    } catch (error) {
        logger.error('Search help articles error:', { message: error.message });
        res.status(500).json({ success: false, message: '搜索失败' });
    }
});

router.post('/articles/:id/feedback', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { is_helpful } = req.body;

        if (is_helpful === undefined || is_helpful === null) {
            return res.status(400).json({ success: false, message: '请选择反馈类型' });
        }

        const article = await db.query(
            'SELECT id FROM help_article WHERE id = ? AND status = ?',
            [id, 'published']
        );

        if (article.length === 0) {
            return res.status(404).json({ success: false, message: '文章不存在' });
        }

        const existingFeedback = await db.query(
            'SELECT id FROM help_feedback WHERE article_id = ? AND user_id = ?',
            [id, req.user.id]
        );

        if (existingFeedback.length > 0) {
            await db.query(
                'UPDATE help_feedback SET is_helpful = ?, created_at = NOW() WHERE id = ?',
                [is_helpful ? 1 : 0, existingFeedback[0].id]
            );
        } else {
            await db.query(
                'INSERT INTO help_feedback (article_id, user_id, is_helpful) VALUES (?, ?, ?)',
                [id, req.user.id, is_helpful ? 1 : 0]
            );
        }

        const feedbackStats = await db.query(
            `SELECT
                COUNT(*) as total_count,
                SUM(CASE WHEN is_helpful = 1 THEN 1 ELSE 0 END) as helpful_count,
                SUM(CASE WHEN is_helpful = 0 THEN 1 ELSE 0 END) as not_helpful_count
             FROM help_feedback
             WHERE article_id = ?`,
            [id]
        );

        logger.info('Help feedback submitted:', { articleId: id, userId: req.user.id, isHelpful: is_helpful });

        res.json({ success: true, data: feedbackStats[0], message: '感谢您的反馈' });
    } catch (error) {
        logger.error('Submit feedback error:', { message: error.message });
        res.status(500).json({ success: false, message: '提交反馈失败' });
    }
});

router.get('/admin/categories', authMiddleware, roleGuard('admin'), async (_req, res) => {
    try {
        const categories = await db.query(
            'SELECT * FROM help_category ORDER BY sort_order ASC, id ASC'
        );

        const articleCounts = await db.query(
            `SELECT category_id, COUNT(*) as article_count
             FROM help_article
             GROUP BY category_id`
        );

        const countMap = {};
        articleCounts.forEach(item => {
            countMap[item.category_id] = item.article_count;
        });

        const data = categories.map(cat => ({
            ...cat,
            article_count: countMap[cat.id] || 0
        }));

        res.json({ success: true, data });
    } catch (error) {
        logger.error('Get admin help categories error:', { message: error.message });
        res.status(500).json({ success: false, message: '获取分类列表失败' });
    }
});

router.post('/admin/categories', authMiddleware, roleGuard('admin'), async (req, res) => {
    try {
        const { name, slug, icon, sort_order = 0, parent_id = null } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: '分类名称不能为空' });
        }
        if (!slug || !slug.trim()) {
            return res.status(400).json({ success: false, message: '分类标识不能为空' });
        }

        const existingSlug = await db.query('SELECT id FROM help_category WHERE slug = ?', [slug.trim()]);
        if (existingSlug.length > 0) {
            return res.status(400).json({ success: false, message: '分类标识已存在' });
        }

        const result = await db.query(
            'INSERT INTO help_category (name, slug, icon, sort_order, parent_id) VALUES (?, ?, ?, ?, ?)',
            [name.trim(), slug.trim(), icon || null, sort_order, parent_id || null]
        );

        logger.info('Help category created:', { id: result.insertId, name });

        res.json({ success: true, data: { id: result.insertId }, message: '创建成功' });
    } catch (error) {
        logger.error('Create help category error:', { message: error.message });
        res.status(500).json({ success: false, message: '创建分类失败' });
    }
});

router.put('/admin/categories/:id', authMiddleware, roleGuard('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, slug, icon, sort_order, parent_id } = req.body;

        const existing = await db.query('SELECT id FROM help_category WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: '分类不存在' });
        }

        const updates = [];
        const params = [];

        if (name !== undefined) {
            updates.push('name = ?');
            params.push(name.trim());
        }
        if (slug !== undefined) {
            const slugCheck = await db.query(
                'SELECT id FROM help_category WHERE slug = ? AND id != ?',
                [slug.trim(), id]
            );
            if (slugCheck.length > 0) {
                return res.status(400).json({ success: false, message: '分类标识已存在' });
            }
            updates.push('slug = ?');
            params.push(slug.trim());
        }
        if (icon !== undefined) {
            updates.push('icon = ?');
            params.push(icon || null);
        }
        if (sort_order !== undefined) {
            updates.push('sort_order = ?');
            params.push(sort_order);
        }
        if (parent_id !== undefined) {
            updates.push('parent_id = ?');
            params.push(parent_id || null);
        }

        if (updates.length > 0) {
            params.push(id);
            await db.query(`UPDATE help_category SET ${updates.join(', ')} WHERE id = ?`, params);
        }

        res.json({ success: true, message: '更新成功' });
    } catch (error) {
        logger.error('Update help category error:', { message: error.message });
        res.status(500).json({ success: false, message: '更新分类失败' });
    }
});

router.delete('/admin/categories/:id', authMiddleware, roleGuard('admin'), async (req, res) => {
    try {
        const { id } = req.params;

        const existing = await db.query('SELECT id FROM help_category WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: '分类不存在' });
        }

        const articles = await db.query(
            'SELECT id FROM help_article WHERE category_id = ?',
            [id]
        );
        if (articles.length > 0) {
            return res.status(400).json({ success: false, message: '该分类下存在文章，无法删除' });
        }

        const children = await db.query(
            'SELECT id FROM help_category WHERE parent_id = ?',
            [id]
        );
        if (children.length > 0) {
            return res.status(400).json({ success: false, message: '该分类下存在子分类，无法删除' });
        }

        await db.query('DELETE FROM help_category WHERE id = ?', [id]);
        logger.info('Help category deleted:', { id });

        res.json({ success: true, message: '删除成功' });
    } catch (error) {
        logger.error('Delete help category error:', { message: error.message });
        res.status(500).json({ success: false, message: '删除分类失败' });
    }
});

router.get('/admin/articles', authMiddleware, roleGuard('admin'), async (req, res) => {
    try {
        const { category_id, status, keyword, limit = 20, offset = 0 } = req.query;

        const where = [];
        const params = [];

        if (category_id) {
            where.push('a.category_id = ?');
            params.push(category_id);
        }
        if (status) {
            where.push('a.status = ?');
            params.push(status);
        }
        if (keyword && keyword.trim()) {
            where.push('(a.title LIKE ? OR a.content LIKE ?)');
            params.push(`%${keyword.trim()}%`, `%${keyword.trim()}%`);
        }

        const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

        const articles = await db.query(
            `SELECT a.*, c.name as category_name
             FROM help_article a
             LEFT JOIN help_category c ON a.category_id = c.id
             ${whereSql}
             ORDER BY a.sort_order ASC, a.id DESC
             LIMIT ? OFFSET ?`,
            [...params, parseInt(limit), parseInt(offset)]
        );

        const countResult = await db.query(
            `SELECT COUNT(*) as total FROM help_article a ${whereSql}`,
            params
        );

        res.json({ success: true, data: articles, total: countResult[0].total });
    } catch (error) {
        logger.error('Get admin help articles error:', { message: error.message });
        res.status(500).json({ success: false, message: '获取文章列表失败' });
    }
});

router.get('/admin/articles/:id', authMiddleware, roleGuard('admin'), async (req, res) => {
    try {
        const { id } = req.params;

        const article = await db.query(
            `SELECT a.*, c.name as category_name, c.slug as category_slug
             FROM help_article a
             LEFT JOIN help_category c ON a.category_id = c.id
             WHERE a.id = ?`,
            [id]
        );

        if (article.length === 0) {
            return res.status(404).json({ success: false, message: '文章不存在' });
        }

        res.json({ success: true, data: article[0] });
    } catch (error) {
        logger.error('Get admin help article detail error:', { message: error.message });
        res.status(500).json({ success: false, message: '获取文章详情失败' });
    }
});

router.post('/admin/articles', authMiddleware, roleGuard('admin'), async (req, res) => {
    try {
        const { title, slug, content, category_id, sort_order = 0, status = 'draft' } = req.body;

        if (!title || !title.trim()) {
            return res.status(400).json({ success: false, message: '文章标题不能为空' });
        }
        if (!slug || !slug.trim()) {
            return res.status(400).json({ success: false, message: '文章标识不能为空' });
        }
        if (!category_id) {
            return res.status(400).json({ success: false, message: '请选择分类' });
        }

        const category = await db.query('SELECT id FROM help_category WHERE id = ?', [category_id]);
        if (category.length === 0) {
            return res.status(400).json({ success: false, message: '分类不存在' });
        }

        const existing = await db.query(
            'SELECT id FROM help_article WHERE category_id = ? AND slug = ?',
            [category_id, slug.trim()]
        );
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: '该分类下已存在相同标识的文章' });
        }

        const result = await db.query(
            `INSERT INTO help_article (title, slug, content, category_id, sort_order, status)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [title.trim(), slug.trim(), content || '', category_id, sort_order, status]
        );

        logger.info('Help article created:', { id: result.insertId, title });

        res.json({ success: true, data: { id: result.insertId }, message: '创建成功' });
    } catch (error) {
        logger.error('Create help article error:', { message: error.message });
        res.status(500).json({ success: false, message: '创建文章失败' });
    }
});

router.put('/admin/articles/:id', authMiddleware, roleGuard('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { title, slug, content, category_id, sort_order, status } = req.body;

        const existing = await db.query('SELECT id, category_id FROM help_article WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: '文章不存在' });
        }

        const updates = [];
        const params = [];

        if (title !== undefined) {
            updates.push('title = ?');
            params.push(title.trim());
        }
        if (slug !== undefined) {
            const checkCategory = category_id || existing[0].category_id;
            const slugCheck = await db.query(
                'SELECT id FROM help_article WHERE category_id = ? AND slug = ? AND id != ?',
                [checkCategory, slug.trim(), id]
            );
            if (slugCheck.length > 0) {
                return res.status(400).json({ success: false, message: '该分类下已存在相同标识的文章' });
            }
            updates.push('slug = ?');
            params.push(slug.trim());
        }
        if (content !== undefined) {
            updates.push('content = ?');
            params.push(content || '');
        }
        if (category_id !== undefined) {
            updates.push('category_id = ?');
            params.push(category_id);
        }
        if (sort_order !== undefined) {
            updates.push('sort_order = ?');
            params.push(sort_order);
        }
        if (status !== undefined) {
            updates.push('status = ?');
            params.push(status);
        }

        if (updates.length > 0) {
            params.push(id);
            await db.query(`UPDATE help_article SET ${updates.join(', ')} WHERE id = ?`, params);
        }

        res.json({ success: true, message: '更新成功' });
    } catch (error) {
        logger.error('Update help article error:', { message: error.message });
        res.status(500).json({ success: false, message: '更新文章失败' });
    }
});

router.delete('/admin/articles/:id', authMiddleware, roleGuard('admin'), async (req, res) => {
    try {
        const { id } = req.params;

        const existing = await db.query('SELECT id FROM help_article WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: '文章不存在' });
        }

        await db.query('DELETE FROM help_article WHERE id = ?', [id]);
        logger.info('Help article deleted:', { id });

        res.json({ success: true, message: '删除成功' });
    } catch (error) {
        logger.error('Delete help article error:', { message: error.message });
        res.status(500).json({ success: false, message: '删除文章失败' });
    }
});

router.get('/admin/articles/preview/:id', authMiddleware, roleGuard('admin'), async (req, res) => {
    try {
        const { id } = req.params;

        const article = await db.query(
            `SELECT a.*, c.name as category_name, c.slug as category_slug
             FROM help_article a
             LEFT JOIN help_category c ON a.category_id = c.id
             WHERE a.id = ?`,
            [id]
        );

        if (article.length === 0) {
            return res.status(404).json({ success: false, message: '文章不存在' });
        }

        const feedbackStats = await db.query(
            `SELECT
                COUNT(*) as total_count,
                SUM(CASE WHEN is_helpful = 1 THEN 1 ELSE 0 END) as helpful_count,
                SUM(CASE WHEN is_helpful = 0 THEN 1 ELSE 0 END) as not_helpful_count
             FROM help_feedback
             WHERE article_id = ?`,
            [id]
        );

        res.json({
            success: true,
            data: {
                ...article[0],
                feedback: feedbackStats[0]
            }
        });
    } catch (error) {
        logger.error('Preview help article error:', { message: error.message });
        res.status(500).json({ success: false, message: '获取文章预览失败' });
    }
});

module.exports = router;
