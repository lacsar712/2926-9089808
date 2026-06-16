const bcrypt = require('bcryptjs');
const db = require('../utils/db');
const logger = require('../utils/logger');

const apiKeyAuth = (requiredScope = 'read') => {
    return async (req, res, next) => {
        const authHeader = req.headers['x-api-key'] || req.headers['X-API-KEY'];
        if (!authHeader) {
            return res.status(401).json({ success: false, message: '未提供 API 密钥' });
        }
        const apiKey = authHeader;
        try {
            const prefixLength = 11; // 'dp_' + 8 hex chars
            if (apiKey.length < prefixLength) {
                return res.status(401).json({ success: false, message: 'API 密钥无效' });
            }
            const keyPrefix = apiKey.substring(0, prefixLength);
            const keys = await db.query(
                'SELECT * FROM api_key WHERE key_prefix = ? AND status = ?',
                [keyPrefix, 'active']
            );
            if (keys.length === 0) {
                return res.status(401).json({ success: false, message: 'API 密钥无效' });
            }
            let validKey = null;
            for (const key of keys) {
                const isValid = await bcrypt.compare(apiKey, key.key_hash);
                if (isValid) {
                    validKey = key;
                    break;
                }
            }
            if (!validKey) {
                return res.status(401).json({ success: false, message: 'API 密钥无效' });
            }
            if (validKey.expires_at && new Date(validKey.expires_at) < new Date()) {
                return res.status(401).json({ success: false, message: 'API 密钥已过期' });
            }
            if (requiredScope === 'write' && validKey.scope !== 'write') {
                return res.status(403).json({ success: false, message: 'API 密钥权限不足' });
            }
            await db.query('UPDATE api_key SET last_used_at = NOW() WHERE id = ?', [validKey.id]);
            req.apiKey = {
                id: validKey.id,
                name: validKey.name,
                scope: validKey.scope,
                userId: validKey.user_id
            };
            next();
        } catch (error) {
            logger.error('API key verification failed:', { message: error.message });
            return res.status(500).json({ success: false, message: 'API 密钥验证失败' });
        }
    };
};

module.exports = { apiKeyAuth };