const VALID_ENVIRONMENTS = ['development', 'test', 'production'];

const environmentMiddleware = (req, res, next) => {
    const env = req.headers['x-environment'];
    if (!env || !VALID_ENVIRONMENTS.includes(env)) {
        req.environment = 'development';
    } else {
        req.environment = env;
    }
    next();
};

module.exports = { environmentMiddleware, VALID_ENVIRONMENTS };
