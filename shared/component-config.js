const { CATEGORY_KEYS, COMPONENT_KEYS } = require('./component-types');

const K = COMPONENT_KEYS;
const C = CATEGORY_KEYS;

const COMPONENT_SCHEMAS = {
  [K.DATABASE_READER]: {
    label: 'MySQL数据读取',
    category: C.DATA_ACCESS,
    icon: 'Download',
    color: '#3b82f6',
    defaults: { host: '10.0.1.100', port: 3306, database: 'data_source', table: 'raw_data' },
    required: ['host', 'port', 'database', 'table'],
    types: { host: 'string', port: 'number', database: 'string', table: 'string' }
  },
  [K.API_CONNECTOR]: {
    label: 'API数据采集',
    category: C.DATA_ACCESS,
    icon: 'Download',
    color: '#3b82f6',
    defaults: { url: 'https://api.example.com/data', method: 'GET', interval: '5m', format: 'json' },
    required: ['url', 'method', 'format'],
    types: { url: 'string', method: 'string', interval: 'string', format: 'string' }
  },
  [K.FILE_READER]: {
    label: '文件数据读取',
    category: C.DATA_ACCESS,
    icon: 'Download',
    color: '#3b82f6',
    defaults: { path: '/data/input', format: 'csv', encoding: 'utf-8', batchSize: 1000 },
    required: ['path', 'format'],
    types: { path: 'string', format: 'string', encoding: 'string', batchSize: 'number' }
  },
  [K.KAFKA_CONSUMER]: {
    label: 'Kafka消费者',
    category: C.DATA_ACCESS,
    icon: 'Download',
    color: '#3b82f6',
    defaults: { brokers: 'kafka:9092', topic: 'data-input', groupId: 'pipeline-group' },
    required: ['brokers', 'topic', 'groupId'],
    types: { brokers: 'string', topic: 'string', groupId: 'string' }
  },
  [K.FTP_LOADER]: {
    label: 'FTP文件加载',
    category: C.DATA_ACCESS,
    icon: 'Download',
    color: '#3b82f6',
    defaults: { host: 'ftp.example.com', port: 21, username: 'reader', remotePath: '/data' },
    required: ['host', 'remotePath'],
    types: { host: 'string', port: 'number', username: 'string', remotePath: 'string' }
  },

  [K.DATA_CLEANER]: {
    label: '数据清洗',
    category: C.DATA_PREPROCESS,
    icon: 'MagicStick',
    color: '#10b981',
    defaults: { removeNull: true, removeDuplicate: true, trimWhitespace: true },
    required: [],
    types: { removeNull: 'boolean', removeDuplicate: 'boolean', trimWhitespace: 'boolean' }
  },
  [K.TEXT_NORMALIZER]: {
    label: '文本归一化',
    category: C.DATA_PREPROCESS,
    icon: 'MagicStick',
    color: '#10b981',
    defaults: { lowercase: false, removeSpecialChars: true, encoding: 'utf-8' },
    required: ['encoding'],
    types: { lowercase: 'boolean', removeSpecialChars: 'boolean', encoding: 'string' }
  },
  [K.DATA_FILTER]: {
    label: '数据过滤',
    category: C.DATA_PREPROCESS,
    icon: 'MagicStick',
    color: '#10b981',
    defaults: { conditions: ['field != null'], mode: 'AND' },
    required: ['conditions', 'mode'],
    types: { conditions: 'array', mode: 'string' }
  },
  [K.TEXT_SPLITTER]: {
    label: '文本分段',
    category: C.DATA_PREPROCESS,
    icon: 'MagicStick',
    color: '#10b981',
    defaults: { method: 'paragraph', maxLength: 512, overlap: 50 },
    required: ['method', 'maxLength'],
    types: { method: 'string', maxLength: 'number', overlap: 'number' }
  },
  [K.FORMAT_CONVERTER]: {
    label: '格式转换',
    category: C.DATA_PREPROCESS,
    icon: 'MagicStick',
    color: '#10b981',
    defaults: { inputFormat: 'json', outputFormat: 'csv', dateFormat: 'YYYY-MM-DD' },
    required: ['inputFormat', 'outputFormat'],
    types: { inputFormat: 'string', outputFormat: 'string', dateFormat: 'string' }
  },

  [K.NER_MODEL]: {
    label: 'NER实体识别',
    category: C.MODEL_LABELING,
    icon: 'Stamp',
    color: '#f59e0b',
    defaults: { model: 'bert-base-chinese', entityTypes: ['PER', 'ORG', 'LOC', 'TIME'], confidence: 0.85 },
    required: ['model', 'entityTypes'],
    types: { model: 'string', entityTypes: 'array', confidence: 'number' }
  },
  [K.SENTIMENT_MODEL]: {
    label: '情感分析',
    category: C.MODEL_LABELING,
    icon: 'Stamp',
    color: '#f59e0b',
    defaults: { model: 'sentiment-bert', labels: ['positive', 'negative', 'neutral'] },
    required: ['model', 'labels'],
    types: { model: 'string', labels: 'array' }
  },
  [K.CLASSIFY_MODEL]: {
    label: '文本分类',
    category: C.MODEL_LABELING,
    icon: 'Stamp',
    color: '#f59e0b',
    defaults: { model: 'text-classifier', categories: ['科技', '财经', '体育', '娱乐'], threshold: 0.7 },
    required: ['model', 'categories'],
    types: { model: 'string', categories: 'array', threshold: 'number' }
  },
  [K.CUSTOM_MODEL]: {
    label: '自定义模型',
    category: C.MODEL_LABELING,
    icon: 'Stamp',
    color: '#f59e0b',
    defaults: { modelPath: '/models/custom', inputField: 'text', outputField: 'label' },
    required: ['modelPath', 'inputField', 'outputField'],
    types: { modelPath: 'string', inputField: 'string', outputField: 'string' }
  },

  [K.RULE_EXTRACTOR]: {
    label: '规则抽取',
    category: C.ENTITY_EXTRACT,
    icon: 'Promotion',
    color: '#ef4444',
    defaults: { rules: ['正则表达式'], fieldName: 'entity', caseSensitive: false },
    required: ['rules', 'fieldName'],
    types: { rules: 'array', fieldName: 'string', caseSensitive: 'boolean' }
  },
  [K.MEDICAL_NER]: {
    label: '医学实体识别',
    category: C.ENTITY_EXTRACT,
    icon: 'Promotion',
    color: '#ef4444',
    defaults: { model: 'biobert-ner', entityTypes: ['疾病', '药物', '症状', '治疗方案'], confidence: 0.9 },
    required: ['model', 'entityTypes'],
    types: { model: 'string', entityTypes: 'array', confidence: 'number' }
  },
  [K.FINANCE_NER]: {
    label: '金融实体识别',
    category: C.ENTITY_EXTRACT,
    icon: 'Promotion',
    color: '#ef4444',
    defaults: { entityTypes: ['公司', '股票', '行业', '人物'] },
    required: ['entityTypes'],
    types: { entityTypes: 'array' }
  },
  [K.ADDRESS_PARSER]: {
    label: '地址解析',
    category: C.ENTITY_EXTRACT,
    icon: 'Promotion',
    color: '#ef4444',
    defaults: { level: 'district', includeCoords: true },
    required: ['level'],
    types: { level: 'string', includeCoords: 'boolean' }
  },

  [K.RELATION_EXTRACTOR]: {
    label: '关系抽取',
    category: C.RELATION_BUILD,
    icon: 'Connection',
    color: '#8b5cf6',
    defaults: { model: 're-bert-chinese', relationTypes: ['任职', '投资', '合作', '收购'], threshold: 0.8 },
    required: ['model', 'relationTypes'],
    types: { model: 'string', relationTypes: 'array', threshold: 'number' }
  },
  [K.CO_OCCURRENCE]: {
    label: '共现分析',
    category: C.RELATION_BUILD,
    icon: 'Connection',
    color: '#8b5cf6',
    defaults: { windowSize: 5, minFrequency: 3, method: 'PMI' },
    required: ['windowSize', 'minFrequency', 'method'],
    types: { windowSize: 'number', minFrequency: 'number', method: 'string' }
  },
  [K.CAUSAL_ANALYSIS]: {
    label: '因果关系分析',
    category: C.RELATION_BUILD,
    icon: 'Connection',
    color: '#8b5cf6',
    defaults: { model: 'causal-bert', confidence: 0.75 },
    required: ['model'],
    types: { model: 'string', confidence: 'number' }
  },
  [K.EVENT_EXTRACTOR]: {
    label: '事件抽取',
    category: C.RELATION_BUILD,
    icon: 'Connection',
    color: '#8b5cf6',
    defaults: { eventTypes: ['并购', '融资', '合作', '发布'], extractArgs: true },
    required: ['eventTypes'],
    types: { eventTypes: 'array', extractArgs: 'boolean' }
  },

  [K.KG_BUILDER]: {
    label: '知识图谱构建',
    category: C.KNOWLEDGE_PRODUCTION,
    icon: 'Cpu',
    color: '#06b6d4',
    defaults: { graphDB: 'neo4j', host: '10.0.1.200', port: 7687 },
    required: ['graphDB', 'host', 'port'],
    types: { graphDB: 'string', host: 'string', port: 'number' }
  },
  [K.KG_WRITER]: {
    label: '知识库写入',
    category: C.KNOWLEDGE_PRODUCTION,
    icon: 'Cpu',
    color: '#06b6d4',
    defaults: { target: 'elasticsearch', index: 'knowledge_base' },
    required: ['target', 'index'],
    types: { target: 'string', index: 'string' }
  },
  [K.DATA_FUSION]: {
    label: '数据融合',
    category: C.KNOWLEDGE_PRODUCTION,
    icon: 'Cpu',
    color: '#06b6d4',
    defaults: { strategy: 'voting', sources: 3, conflictResolution: 'latest' },
    required: ['strategy', 'sources'],
    types: { strategy: 'string', sources: 'number', conflictResolution: 'string' }
  },
  [K.QUALITY_CHECK]: {
    label: '质量校验',
    category: C.KNOWLEDGE_PRODUCTION,
    icon: 'Cpu',
    color: '#06b6d4',
    defaults: { rules: ['完整性', '一致性', '准确性'], strictMode: false },
    required: ['rules'],
    types: { rules: 'array', strictMode: 'boolean' }
  },

  [K.GRAPH_VIEWER]: {
    label: '图谱浏览器',
    category: C.DATA_BROWSE,
    icon: 'Monitor',
    color: '#ec4899',
    defaults: { maxNodes: 500, layout: 'force' },
    required: ['maxNodes', 'layout'],
    types: { maxNodes: 'number', layout: 'string' }
  },
  [K.DATA_DASHBOARD]: {
    label: '数据看板',
    category: C.DATA_BROWSE,
    icon: 'Monitor',
    color: '#ec4899',
    defaults: { refreshInterval: 30, chartTypes: ['line', 'bar', 'pie'] },
    required: ['chartTypes'],
    types: { refreshInterval: 'number', chartTypes: 'array' }
  },
  [K.DATA_EXPORT]: {
    label: '数据导出',
    category: C.DATA_BROWSE,
    icon: 'Monitor',
    color: '#ec4899',
    defaults: { format: 'csv', encoding: 'utf-8', maxRows: 100000 },
    required: ['format'],
    types: { format: 'string', encoding: 'string', maxRows: 'number' }
  },
  [K.REPORT_GENERATOR]: {
    label: '报告生成',
    category: C.DATA_BROWSE,
    icon: 'Monitor',
    color: '#ec4899',
    defaults: { template: 'default', format: 'pdf', includeCharts: true },
    required: ['format'],
    types: { template: 'string', format: 'string', includeCharts: 'boolean' }
  },
  [K.DATA_WRITER]: {
    label: '数据输出',
    category: C.DATA_BROWSE,
    icon: 'Monitor',
    color: '#ec4899',
    defaults: { target: 'database', table: 'output_table', mode: 'append' },
    required: ['target'],
    types: { target: 'string', table: 'string', mode: 'string' }
  }
};

const CATEGORY_META = {
  [C.DATA_ACCESS]: { label: '数据接入', icon: 'Download', color: '#3b82f6' },
  [C.DATA_PREPROCESS]: { label: '数据预处理', icon: 'MagicStick', color: '#10b981' },
  [C.MODEL_LABELING]: { label: '模型打标', icon: 'Stamp', color: '#f59e0b' },
  [C.ENTITY_EXTRACT]: { label: '实体抽取', icon: 'Promotion', color: '#ef4444' },
  [C.RELATION_BUILD]: { label: '关系构建', icon: 'Connection', color: '#8b5cf6' },
  [C.KNOWLEDGE_PRODUCTION]: { label: '知识数据生产', icon: 'Cpu', color: '#06b6d4' },
  [C.DATA_BROWSE]: { label: '数据浏览', icon: 'Monitor', color: '#ec4899' }
};

const CONFIG_LABELS = {
  host: '服务器地址', port: '端口', database: '数据库名', table: '表名',
  url: 'API地址', method: '请求方法', interval: '采集间隔', format: '数据格式',
  path: '文件路径', encoding: '编码', batchSize: '批次大小',
  brokers: 'Broker地址', topic: '主题', groupId: '消费组',
  username: '用户名', remotePath: '远程路径',
  removeNull: '移除空值', removeDuplicate: '去重', trimWhitespace: '去除空白',
  lowercase: '转小写', removeSpecialChars: '去特殊字符',
  conditions: '过滤条件', mode: '过滤模式',
  maxLength: '最大长度', overlap: '重叠长度',
  inputFormat: '输入格式', outputFormat: '输出格式', dateFormat: '日期格式',
  model: '模型名称', modelPath: '模型路径', entityTypes: '实体类型',
  confidence: '置信度阈值', labels: '标签列表', categories: '分类列表',
  threshold: '阈值', rules: '规则列表', fieldName: '字段名',
  caseSensitive: '区分大小写', level: '解析级别', includeCoords: '包含坐标',
  relationTypes: '关系类型', windowSize: '窗口大小', minFrequency: '最小频率',
  eventTypes: '事件类型', extractArgs: '提取参数',
  graphDB: '图数据库', target: '目标存储', index: '索引名',
  strategy: '融合策略', sources: '数据源数', conflictResolution: '冲突处理',
  strictMode: '严格模式', maxNodes: '最大节点数', layout: '布局方式',
  refreshInterval: '刷新间隔(秒)', chartTypes: '图表类型',
  maxRows: '最大行数', template: '模板', includeCharts: '包含图表',
  inputField: '输入字段', outputField: '输出字段'
};

const buildCategories = () => {
  const categoryOrder = [
    C.DATA_ACCESS, C.DATA_PREPROCESS, C.MODEL_LABELING, C.ENTITY_EXTRACT,
    C.RELATION_BUILD, C.KNOWLEDGE_PRODUCTION, C.DATA_BROWSE
  ];

  return categoryOrder.map((catKey, idx) => {
    const meta = CATEGORY_META[catKey];
    const components = Object.entries(COMPONENT_SCHEMAS)
      .filter(([_, schema]) => schema.category === catKey)
      .map(([compKey, schema]) => ({
        key: compKey,
        label: schema.label,
        config: { ...schema.defaults }
      }));

    return {
      key: catKey,
      label: meta.label,
      icon: meta.icon,
      color: meta.color,
      expanded: idx === 0,
      components
    };
  });
};

const getCategoryMeta = (catKey) => CATEGORY_META[catKey] || null;
const getComponentSchema = (compKey) => COMPONENT_SCHEMAS[compKey] || null;
const getConfigLabel = (key) => CONFIG_LABELS[key] || key;
const isValidComponent = (compKey) => !!COMPONENT_SCHEMAS[compKey];

module.exports = {
  COMPONENT_SCHEMAS,
  CATEGORY_META,
  CONFIG_LABELS,
  buildCategories,
  getCategoryMeta,
  getComponentSchema,
  getConfigLabel,
  isValidComponent
};
