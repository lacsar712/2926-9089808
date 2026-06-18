const componentTypes = require('./component-types');
const componentConfig = require('./component-config');
const flowValidator = require('./flow-validator');

module.exports = {
  ...componentTypes,
  ...componentConfig,
  ...flowValidator
};
