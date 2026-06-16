const db = require('./db');
const logger = require('./logger');

const QUOTA_DIMENSIONS = {
    PIPELINES: 'max_pipelines',
    TAGS: 'max_tags',
    NODES_PER_PIPELINE: 'max_nodes_per_pipeline',
    PUBLISHES_PER_DAY: 'max_publishes_per_day'
};

const getGlobalConfig = async () => {
    const rows = await db.query('SELECT * FROM quota_config ORDER BY id DESC LIMIT 1');
    return rows[0] || {
        max_pipelines: 10,
        max_tags: 20,
        max_nodes_per_pipeline: 50,
        max_publishes_per_day: 10
    };
};

const getUserQuotaOverride = async (userId) => {
    const rows = await db.query('SELECT * FROM user_quota WHERE user_id = ?', [userId]);
    return rows[0] || null;
};

const getEffectiveQuota = async (userId) => {
    const globalConfig = await getGlobalConfig();
    const userOverride = await getUserQuotaOverride(userId);
    
    const effective = {};
    Object.values(QUOTA_DIMENSIONS).forEach(dim => {
        effective[dim] = userOverride && userOverride[dim] !== null && userOverride[dim] !== undefined
            ? userOverride[dim]
            : globalConfig[dim];
    });
    
    return {
        effective,
        global: globalConfig,
        userOverride
    };
};

const getUsage = async (userId) => {
    const [
        pipelineCount,
        tagCount,
        todayPublishCount
    ] = await Promise.all([
        db.query('SELECT COUNT(*) as count FROM pipeline WHERE creator_id = ? AND deleted_at IS NULL', [userId]),
        db.query('SELECT COUNT(*) as count FROM tag'),
        db.query(
            `SELECT COUNT(*) as count FROM pipeline_history ph
             INNER JOIN pipeline p ON ph.pipeline_id = p.id
             WHERE ph.operator = (SELECT username FROM sys_user WHERE id = ?)
             AND ph.action = 'publish'
             AND DATE(ph.created_at) = CURDATE()
             AND p.deleted_at IS NULL`,
            [userId]
        )
    ]);

    return {
        pipelines: pipelineCount[0].count,
        tags: tagCount[0].count,
        publishes_today: todayPublishCount[0].count
    };
};

const getPipelineNodeCount = async (pipelineId) => {
    const rows = await db.query('SELECT flow_data FROM pipeline_flow WHERE pipeline_id = ?', [pipelineId]);
    if (rows.length === 0) return 0;
    const flowData = typeof rows[0].flow_data === 'string' ? JSON.parse(rows[0].flow_data) : rows[0].flow_data;
    return flowData.nodes ? flowData.nodes.length : 0;
};

const checkQuota = async (userId, dimension, currentValue = 1) => {
    const { effective } = await getEffectiveQuota(userId);
    const limit = effective[dimension];
    
    if (limit === -1) {
        return { allowed: true, remaining: Infinity, limit };
    }

    const usage = await getUsage(userId);
    let used;
    
    switch (dimension) {
        case QUOTA_DIMENSIONS.PIPELINES:
            used = usage.pipelines;
            break;
        case QUOTA_DIMENSIONS.TAGS:
            used = usage.tags;
            break;
        case QUOTA_DIMENSIONS.PUBLISHES_PER_DAY:
            used = usage.publishes_today;
            break;
        default:
            used = 0;
    }

    const remaining = limit - used - currentValue;
    
    return {
        allowed: remaining >= 0,
        remaining: Math.max(0, remaining),
        used: used + currentValue,
        limit
    };
};

const checkNodeQuota = async (userId, pipelineId, nodeCount) => {
    const { effective } = await getEffectiveQuota(userId);
    const limit = effective[QUOTA_DIMENSIONS.NODES_PER_PIPELINE];
    
    if (limit === -1) {
        return { allowed: true, remaining: Infinity, limit };
    }

    const remaining = limit - nodeCount;
    
    return {
        allowed: remaining >= 0,
        remaining: Math.max(0, remaining),
        used: nodeCount,
        limit
    };
};

const createQuotaError = (dimension, remaining, limit) => {
    const messages = {
        [QUOTA_DIMENSIONS.PIPELINES]: `生产线数量已达上限`,
        [QUOTA_DIMENSIONS.TAGS]: `标签数量已达上限`,
        [QUOTA_DIMENSIONS.NODES_PER_PIPELINE]: `生产线节点数已达上限`,
        [QUOTA_DIMENSIONS.PUBLISHES_PER_DAY]: `今日发布次数已达上限`
    };

    const error = new Error(messages[dimension] || '配额不足');
    error.status = 403;
    error.code = 'QUOTA_EXCEEDED';
    error.dimension = dimension;
    error.remaining = remaining;
    error.limit = limit;
    return error;
};

const validateQuota = async (userId, dimension, currentValue = 1) => {
    const result = await checkQuota(userId, dimension, currentValue);
    if (!result.allowed) {
        logger.warn('Quota exceeded:', { userId, dimension, remaining: result.remaining, limit: result.limit });
        throw createQuotaError(dimension, result.remaining, result.limit);
    }
    return result;
};

const validateNodeQuota = async (userId, pipelineId, nodeCount) => {
    const result = await checkNodeQuota(userId, pipelineId, nodeCount);
    if (!result.allowed) {
        logger.warn('Node quota exceeded:', { userId, pipelineId, nodeCount, limit: result.limit });
        throw createQuotaError(QUOTA_DIMENSIONS.NODES_PER_PIPELINE, result.remaining, result.limit);
    }
    return result;
};

const getAllUsersQuotaUsage = async () => {
    const users = await db.query('SELECT id, username, nickname, role FROM sys_user ORDER BY id');
    const result = [];

    for (const user of users) {
        const [quota, usage] = await Promise.all([
            getEffectiveQuota(user.id),
            getUsage(user.id)
        ]);

        result.push({
            user: {
                id: user.id,
                username: user.username,
                nickname: user.nickname,
                role: user.role
            },
            quota: quota.effective,
            usage,
            details: {
                pipelines: {
                    used: usage.pipelines,
                    limit: quota.effective.max_pipelines,
                    remaining: quota.effective.max_pipelines === -1 ? Infinity : quota.effective.max_pipelines - usage.pipelines
                },
                tags: {
                    used: usage.tags,
                    limit: quota.effective.max_tags,
                    remaining: quota.effective.max_tags === -1 ? Infinity : quota.effective.max_tags - usage.tags
                },
                publishes_today: {
                    used: usage.publishes_today,
                    limit: quota.effective.max_publishes_per_day,
                    remaining: quota.effective.max_publishes_per_day === -1 ? Infinity : quota.effective.max_publishes_per_day - usage.publishes_today
                }
            }
        });
    }

    return result;
};

module.exports = {
    QUOTA_DIMENSIONS,
    getGlobalConfig,
    getUserQuotaOverride,
    getEffectiveQuota,
    getUsage,
    getPipelineNodeCount,
    checkQuota,
    checkNodeQuota,
    validateQuota,
    validateNodeQuota,
    getAllUsersQuotaUsage
};
