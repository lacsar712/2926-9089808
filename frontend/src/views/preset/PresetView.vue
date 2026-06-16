<template>
  <div class="preset-page">
    <div class="page-header">
      <h2>参数预设库</h2>
      <el-button
        v-if="userRole === 'admin' || userRole === 'editor'"
        type="primary"
        @click="openCreateDialog"
      >
        <el-icon><Plus /></el-icon>新建预设
      </el-button>
    </div>

    <div class="filter-bar">
      <div class="filter-left">
        <el-select
          v-model="filter.componentType"
          placeholder="选择组件类型"
          clearable
          size="default"
          style="width: 200px"
          @change="loadPresets"
        >
          <el-option
            v-for="comp in componentTypeOptions"
            :key="comp.value"
            :label="comp.label"
            :value="comp.value"
          />
        </el-select>
        <el-input
          v-model="filter.keyword"
          placeholder="搜索名称、描述、标签..."
          clearable
          size="default"
          style="width: 280px; margin-left: 12px"
          @keyup.enter="loadPresets"
          @clear="loadPresets"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-button size="default" @click="loadPresets" style="margin-left: 8px">
          <el-icon><Search /></el-icon>搜索
        </el-button>
      </div>
      <div class="filter-right">
        <el-select
          v-model="filter.sortBy"
          size="default"
          style="width: 160px"
          @change="loadPresets"
        >
          <el-option label="最新创建" value="created_at" />
          <el-option label="最近更新" value="updated_at" />
          <el-option label="使用次数" value="usage_count" />
          <el-option label="名称排序" value="name" />
        </el-select>
        <el-radio-group
          v-model="filter.sortOrder"
          size="default"
          style="margin-left: 12px"
          @change="loadPresets"
        >
          <el-radio-button value="desc">降序</el-radio-button>
          <el-radio-button value="asc">升序</el-radio-button>
        </el-radio-group>
      </div>
    </div>

    <div class="preset-grid" v-loading="loading">
      <el-empty v-if="presets.length === 0 && !loading" description="暂无预设数据" />
      <el-card
        v-for="preset in presets"
        :key="preset.id"
        class="preset-card"
        shadow="hover"
      >
        <div class="card-header">
          <div class="card-title">
            <span class="preset-name">{{ preset.name }}</span>
            <el-tag
              v-if="preset.is_public"
              type="success"
              size="small"
              effect="light"
            >
              公开
            </el-tag>
            <el-tag
              v-else
              type="info"
              size="small"
              effect="light"
            >
              私有
            </el-tag>
          </div>
          <div class="card-actions">
            <el-button
              link
              type="primary"
              size="small"
              @click="previewJson(preset)"
            >
              <el-icon><View /></el-icon>预览
            </el-button>
            <el-dropdown
              v-if="canEdit(preset)"
              trigger="click"
            >
              <el-button link type="primary" size="small">
                <el-icon><MoreFilled /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click="openEditDialog(preset)">
                    <el-icon><Edit /></el-icon>编辑
                  </el-dropdown-item>
                  <el-dropdown-item divided @click="handleDelete(preset)">
                    <el-icon><Delete /></el-icon>删除
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>

        <div class="card-body">
          <div class="card-meta">
            <el-tag size="small" effect="plain">{{ getComponentLabel(preset.component_type) }}</el-tag>
            <span class="usage-count">
              <el-icon><TrendCharts /></el-icon>
              {{ preset.usage_count }} 次使用
            </span>
          </div>
          <p class="card-description" v-if="preset.description">
            {{ preset.description }}
          </p>
          <div class="card-tags" v-if="preset.tags && preset.tags.length">
            <el-tag
              v-for="tag in preset.tags"
              :key="tag"
              size="small"
              effect="light"
              style="margin-right: 4px; margin-bottom: 4px"
            >
              {{ tag }}
            </el-tag>
          </div>
        </div>

        <div class="card-footer">
          <span class="creator">
            <el-avatar :size="20" :style="{ background: 'var(--primary)', fontSize: '10px' }">
              {{ preset.creator_name?.charAt(0) || 'U' }}
            </el-avatar>
            {{ preset.creator_name }}
          </span>
          <span class="create-time">{{ formatDate(preset.created_at) }}</span>
        </div>
      </el-card>
    </div>

    <el-dialog
      v-model="jsonDialogVisible"
      title="配置 JSON 预览"
      width="700px"
      destroy-on-close
    >
      <div v-if="currentPreset" class="json-preview">
        <div class="json-header">
          <span class="json-title">{{ currentPreset.name }}</span>
          <el-button size="small" @click="copyJson">
            <el-icon><CopyDocument /></el-icon>复制
          </el-button>
        </div>
        <pre class="json-content"><code>{{ formattedJson }}</code></pre>
      </div>
    </el-dialog>

    <el-dialog
      v-model="formDialogVisible"
      :title="isEdit ? '编辑预设' : '新建预设'"
      width="600px"
      destroy-on-close
      @close="resetForm"
    >
      <el-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-width="90px"
        label-position="left"
      >
        <el-form-item label="预设名称" prop="name">
          <el-input v-model="formData.name" placeholder="请输入预设名称" maxlength="100" show-word-limit />
        </el-form-item>
        <el-form-item label="组件类型" prop="component_type">
          <el-select v-model="formData.component_type" placeholder="请选择组件类型" style="width: 100%">
            <el-option
              v-for="comp in componentTypeOptions"
              :key="comp.value"
              :label="comp.label"
              :value="comp.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="配置 JSON" prop="config">
          <el-input
            v-model="configText"
            type="textarea"
            :rows="8"
            placeholder='{"host": "localhost", "port": 3306}'
            @blur="validateConfigJson"
          />
          <div v-if="configError" class="error-text">{{ configError }}</div>
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="formData.description"
            type="textarea"
            :rows="2"
            placeholder="请输入描述信息"
            maxlength="500"
            show-word-limit
          />
        </el-form-item>
        <el-form-item label="标签">
          <el-select
            v-model="formData.tags"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="输入标签后按回车添加"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="是否公开">
          <el-switch
            v-model="formData.is_public"
            active-text="公开"
            inactive-text="私有"
          />
          <div class="tip-text">
            公开预设所有用户可见，私有预设仅您自己可见
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">
          {{ isEdit ? '保存修改' : '创建预设' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '@/utils/request'
import dayjs from 'dayjs'

const loading = ref(false)
const presets = ref([])
const jsonDialogVisible = ref(false)
const formDialogVisible = ref(false)
const isEdit = ref(false)
const submitting = ref(false)
const currentPreset = ref(null)
const configText = ref('')
const configError = ref('')
const formRef = ref(null)

const userInfo = computed(() => {
  try { return JSON.parse(localStorage.getItem('userInfo') || '{}') } catch { return {} }
})
const userRole = computed(() => userInfo.value?.role || 'viewer')

const filter = reactive({
  componentType: '',
  keyword: '',
  sortBy: 'created_at',
  sortOrder: 'desc'
})

const componentTypeOptions = [
  { label: 'MySQL数据读取', value: 'database-reader' },
  { label: 'API数据采集', value: 'api-connector' },
  { label: '文件数据读取', value: 'file-reader' },
  { label: 'Kafka消费者', value: 'kafka-consumer' },
  { label: 'FTP文件加载', value: 'ftp-loader' },
  { label: '数据清洗', value: 'data-cleaner' },
  { label: '文本归一化', value: 'text-normalizer' },
  { label: '数据过滤', value: 'data-filter' },
  { label: '文本分段', value: 'text-splitter' },
  { label: '格式转换', value: 'format-converter' },
  { label: 'NER实体识别', value: 'ner-model' },
  { label: '情感分析', value: 'sentiment-model' },
  { label: '文本分类', value: 'classify-model' },
  { label: '自定义模型', value: 'custom-model' },
  { label: '规则抽取', value: 'rule-extractor' },
  { label: '医学实体识别', value: 'medical-ner' },
  { label: '金融实体识别', value: 'finance-ner' },
  { label: '地址解析', value: 'address-parser' },
  { label: '关系抽取', value: 'relation-extractor' },
  { label: '共现分析', value: 'co-occurrence' },
  { label: '因果关系分析', value: 'causal-analysis' },
  { label: '事件抽取', value: 'event-extractor' },
  { label: '知识图谱构建', value: 'kg-builder' },
  { label: '知识库写入', value: 'kg-writer' },
  { label: '数据融合', value: 'data-fusion' },
  { label: '质量校验', value: 'quality-check' },
  { label: '图谱浏览器', value: 'graph-viewer' },
  { label: '数据看板', value: 'data-dashboard' },
  { label: '数据导出', value: 'data-export' },
  { label: '报告生成', value: 'report-generator' }
]

const formData = reactive({
  id: null,
  name: '',
  component_type: '',
  config: {},
  description: '',
  tags: [],
  is_public: false
})

const formRules = {
  name: [{ required: true, message: '请输入预设名称', trigger: 'blur' }],
  component_type: [{ required: true, message: '请选择组件类型', trigger: 'change' }],
  config: [{ required: true, message: '请输入有效的配置JSON', trigger: 'blur' }]
}

const formattedJson = computed(() => {
  if (!currentPreset.value?.config) return ''
  return JSON.stringify(currentPreset.value.config, null, 2)
})

const getComponentLabel = (value) => {
  const opt = componentTypeOptions.find(o => o.value === value)
  return opt?.label || value
}

const formatDate = (d) => d ? dayjs(d).format('YYYY-MM-DD HH:mm') : '-'

const canEdit = (preset) => {
  return userRole.value === 'admin' || preset.creator_id === userInfo.value?.id
}

const loadPresets = async () => {
  loading.value = true
  try {
    const params = {
      sort_by: filter.sortBy,
      sort_order: filter.sortOrder
    }
    if (filter.componentType) params.component_type = filter.componentType
    if (filter.keyword) params.keyword = filter.keyword

    const res = await api.get('/presets', { params })
    presets.value = res.data || []
  } catch { /* handled */ } finally {
    loading.value = false
  }
}

const previewJson = (preset) => {
  currentPreset.value = preset
  jsonDialogVisible.value = true
}

const copyJson = async () => {
  try {
    await navigator.clipboard.writeText(formattedJson.value)
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败')
  }
}

const openCreateDialog = () => {
  isEdit.value = false
  formData.id = null
  formData.name = ''
  formData.component_type = ''
  formData.config = {}
  formData.description = ''
  formData.tags = []
  formData.is_public = false
  configText.value = ''
  configError.value = ''
  formDialogVisible.value = true
}

const openEditDialog = (preset) => {
  isEdit.value = true
  formData.id = preset.id
  formData.name = preset.name
  formData.component_type = preset.component_type
  formData.config = JSON.parse(JSON.stringify(preset.config))
  formData.description = preset.description || ''
  formData.tags = [...(preset.tags || [])]
  formData.is_public = preset.is_public
  configText.value = JSON.stringify(preset.config, null, 2)
  configError.value = ''
  formDialogVisible.value = true
}

const validateConfigJson = () => {
  if (!configText.value.trim()) {
    configError.value = '配置不能为空'
    return false
  }
  try {
    const parsed = JSON.parse(configText.value)
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      configError.value = '配置必须为JSON对象'
      return false
    }
    formData.config = parsed
    configError.value = ''
    return true
  } catch {
    configError.value = 'JSON格式错误'
    return false
  }
}

const resetForm = () => {
  formRef.value?.resetFields()
  configError.value = ''
}

const handleSubmit = async () => {
  if (!validateConfigJson()) return
  await formRef.value?.validate()
  submitting.value = true
  try {
    if (isEdit.value) {
      await api.put(`/presets/${formData.id}`, formData)
      ElMessage.success('更新成功')
    } else {
      await api.post('/presets', formData)
      ElMessage.success('创建成功')
    }
    formDialogVisible.value = false
    loadPresets()
  } catch { /* handled */ } finally {
    submitting.value = false
  }
}

const handleDelete = (preset) => {
  ElMessageBox.confirm(
    `确定要删除预设「${preset.name}」吗？此操作不可恢复。`,
    '删除确认',
    { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
  ).then(async () => {
    try {
      await api.delete(`/presets/${preset.id}`)
      ElMessage.success('删除成功')
      loadPresets()
    } catch { /* handled */ }
  }).catch(() => {})
}

onMounted(() => {
  loadPresets()
})
</script>

<style scoped>
.preset-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 20px;
  overflow: hidden;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-header h2 {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.filter-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding: 16px;
  background: var(--bg-card);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
}

.filter-left, .filter-right {
  display: flex;
  align-items: center;
}

.preset-grid {
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
  align-content: start;
  padding-right: 4px;
}

.preset-card {
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  transition: var(--transition);
}

.preset-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.preset-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.card-body {
  margin-bottom: 12px;
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.usage-count {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.card-description {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin: 8px 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-tags {
  margin-top: 8px;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
  font-size: 12px;
  color: var(--text-secondary);
}

.creator {
  display: flex;
  align-items: center;
  gap: 6px;
}

.json-preview {
  display: flex;
  flex-direction: column;
}

.json-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}

.json-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.json-content {
  background: var(--bg-dark);
  border-radius: var(--radius-sm);
  padding: 16px;
  margin: 0;
  max-height: 400px;
  overflow-y: auto;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-all;
}

.error-text {
  color: var(--color-error);
  font-size: 12px;
  margin-top: 4px;
}

.tip-text {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}

:deep(.el-dialog__body) {
  padding-top: 10px;
}
</style>
