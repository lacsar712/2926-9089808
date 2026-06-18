const logger = require('../utils/logger');

const SLOW_REQUEST_THRESHOLD = 500;
const MAX_PARAM_LENGTH = 100;

const summarizeParams = (obj) => {
    if (!obj || Object.keys(obj).length === 0) return '';
    const summarized = {};
    for (const key of Object.keys(obj)) {
        const value = typeof obj[key] === 'string'
            ? (obj[key].length > MAX_PARAM_LENGTH ? obj[key].slice(0, MAX_PARAM_LENGTH) + '...' : obj[key])
            : obj[key];
        summarized[key] = value;
    }
    return JSON.stringify(summarized);
};

const slowRequestLogger = (req, res, next) => {
    const isDev = process.env.NODE_ENV !== 'production';
    if (!isDev) {
        return next();
    }

    const startTime = Date.now();
    const route = `${req.method} ${req.baseUrl || ''}${req.route ? req.route.path : req.path}`;

    res.on('finish', () => {
        const duration = Date.now() - startTime;
        if (duration > SLOW_REQUEST_THRESHOLD) {
            const querySummary = summarizeParams(req.query);
            const bodySummary = req.method !== 'GET' ? summarizeParams(req.body) : '';
            const paramsPart = [
                querySummary ? `query=${querySummary}` : '',
                bodySummary ? `body=${bodySummary}` : ''
            ].filter(Boolean).join(' ');

            logger.warn(`[SLOW REQUEST] ${route} - ${duration}ms${paramsPart ? ' | ' + paramsPart : ''}`);
        }
    });

    next();
};

module.exports = { slowRequestLogger };
