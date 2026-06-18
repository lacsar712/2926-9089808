const CATEGORY_KEYS = {
  DATA_ACCESS: 'data-access',
  DATA_PREPROCESS: 'data-preprocess',
  MODEL_LABELING: 'model-labeling',
  ENTITY_EXTRACT: 'entity-extract',
  RELATION_BUILD: 'relation-build',
  KNOWLEDGE_PRODUCTION: 'knowledge-production',
  DATA_BROWSE: 'data-browse'
};

const COMPONENT_KEYS = {
  DATABASE_READER: 'database-reader',
  API_CONNECTOR: 'api-connector',
  FILE_READER: 'file-reader',
  KAFKA_CONSUMER: 'kafka-consumer',
  FTP_LOADER: 'ftp-loader',

  DATA_CLEANER: 'data-cleaner',
  TEXT_NORMALIZER: 'text-normalizer',
  DATA_FILTER: 'data-filter',
  TEXT_SPLITTER: 'text-splitter',
  FORMAT_CONVERTER: 'format-converter',

  NER_MODEL: 'ner-model',
  SENTIMENT_MODEL: 'sentiment-model',
  CLASSIFY_MODEL: 'classify-model',
  CUSTOM_MODEL: 'custom-model',

  RULE_EXTRACTOR: 'rule-extractor',
  MEDICAL_NER: 'medical-ner',
  FINANCE_NER: 'finance-ner',
  ADDRESS_PARSER: 'address-parser',

  RELATION_EXTRACTOR: 'relation-extractor',
  CO_OCCURRENCE: 'co-occurrence',
  CAUSAL_ANALYSIS: 'causal-analysis',
  EVENT_EXTRACTOR: 'event-extractor',

  KG_BUILDER: 'kg-builder',
  KG_WRITER: 'kg-writer',
  DATA_FUSION: 'data-fusion',
  QUALITY_CHECK: 'quality-check',

  GRAPH_VIEWER: 'graph-viewer',
  DATA_DASHBOARD: 'data-dashboard',
  DATA_EXPORT: 'data-export',
  REPORT_GENERATOR: 'report-generator',
  DATA_WRITER: 'data-writer'
};

const ALL_COMPONENT_KEYS = Object.values(COMPONENT_KEYS);

module.exports = {
  CATEGORY_KEYS,
  COMPONENT_KEYS,
  ALL_COMPONENT_KEYS
};
