const { ALL_COMPONENT_KEYS } = require('./component-types');
const { getComponentSchema, isValidComponent } = require('./component-config');

const ERROR_MESSAGES = {
  FLOW_EMPTY: '编排数据为空',
  NO_NODES: '画布中没有任何组件',
  NO_EDGES: '组件之间没有连线',
  NODE_NOT_CONNECTED: (label) => `组件"${label}"未连接`,
  UNKNOWN_COMPONENT: (label, compKey) => `组件"${label}"使用了未知类型：${compKey}`,
  CONFIG_MISSING: (label) => `组件"${label}"缺少配置信息`,
  REQUIRED_FIELD_EMPTY: (label, field) => `组件"${label}"的必填字段"${field}"为空`,
  FIELD_TYPE_MISMATCH: (label, field, expected) => `组件"${label}"的字段"${field}"类型不正确，期望：${expected}`
};

const typeCheckers = {
  string: (v) => typeof v === 'string' && v.trim() !== '',
  number: (v) => typeof v === 'number' && !isNaN(v),
  boolean: (v) => typeof v === 'boolean',
  array: (v) => Array.isArray(v) && v.length > 0,
  object: (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
};

const checkFieldType = (value, expectedType) => {
  const checker = typeCheckers[expectedType];
  return checker ? checker(value) : true;
};

const validateFlow = (flowData) => {
  const errors = [];

  if (!flowData) {
    errors.push(ERROR_MESSAGES.FLOW_EMPTY);
    return { valid: false, errors };
  }

  const { nodes, edges } = flowData;

  if (!nodes || nodes.length === 0) {
    errors.push(ERROR_MESSAGES.NO_NODES);
  }
  if (!edges || edges.length === 0) {
    errors.push(ERROR_MESSAGES.NO_EDGES);
  }

  if (nodes && edges) {
    const connectedNodes = new Set();
    edges.forEach(e => {
      if (e.source) connectedNodes.add(e.source);
      if (e.target) connectedNodes.add(e.target);
    });
    nodes.forEach(n => {
      if (!connectedNodes.has(n.id)) {
        const label = n.data?.label || n.id;
        errors.push(ERROR_MESSAGES.NODE_NOT_CONNECTED(label));
      }
    });
  }

  if (nodes) {
    nodes.forEach(n => {
      const label = n.data?.label || n.id;
      const compKey = n.data?.component;
      const config = n.data?.config;

      if (!isValidComponent(compKey)) {
        errors.push(ERROR_MESSAGES.UNKNOWN_COMPONENT(label, compKey));
        return;
      }

      if (!config || typeof config !== 'object') {
        errors.push(ERROR_MESSAGES.CONFIG_MISSING(label));
        return;
      }

      const schema = getComponentSchema(compKey);
      if (!schema) return;

      if (schema.required && schema.required.length > 0) {
        schema.required.forEach(field => {
          const value = config[field];
          if (value === undefined || value === null || value === '') {
            errors.push(ERROR_MESSAGES.REQUIRED_FIELD_EMPTY(label, field));
          } else if (schema.types && schema.types[field]) {
            if (!checkFieldType(value, schema.types[field])) {
              errors.push(ERROR_MESSAGES.FIELD_TYPE_MISMATCH(label, field, schema.types[field]));
            }
          }
        });
      }
    });
  }

  return { valid: errors.length === 0, errors };
};

module.exports = {
  validateFlow,
  ERROR_MESSAGES,
  typeCheckers,
  checkFieldType
};
