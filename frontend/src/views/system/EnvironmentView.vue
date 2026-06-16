<template>
  <div class="page-container">
    <div class="page-header fade-in-up">
      <h2 class="page-title">环境管理</h2>
    </div>

    <div class="env-cards fade-in-up" v-loading="loading">
      <div v-for="env in envList" :key="env.environment" class="env-card" :class="env.environment">
        <div class="env-card-header">
          <div class="env-name">
            <span class="env-dot"></span>
            <span>{{ env.label }}</span>
          </div>
          <span class="env-key">{{ env.environment }}</span>
        </div>
        <div class="env-stats">
          <div class="stat-item">
            <span class="stat-value">{{ env.pipeline_count }}</span>
            <span class="stat-label">生产线数量</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">{{ env.run_count }}</span>
            <span class="stat-label">运行次数</span>
          </div>
        </div>
        <div class="env-config-preview">
          <div class="config-row">
            <span class="config-label">配额倍率</span>
            <span class="config-value">{{ env.quota_multiplier }}x</span>
          </div>
          <div class="config-row">
            <span class="config-label">默认标签集</span>
            <div class="config-tags">
              <el-tag v-for="tagId in env.default_tag_ids" :key="tagId" size="small" type="info" round>
                {{ getTagName(tagId) }}
              </el-tag>
              <span v-if="!env.default_tag_ids?.length" class="no-tags">未配置</span>
            </div>
          </div>
        </div>
        <div class="env-card-actions">
          <el-button size="small" type="primary" plain @click="openConfigDialog(env)">
            <el-icon><Setting /></el-icon>配置
          </el-button>
          <el-button size="small" plain @click="openCloneDialog(env)">
            <el-icon><CopyDocument /></el-icon>跨环境复制
          </el-button>
        </div>
      </div>
    </div>

    <div v-if="isAdmin" class="admin-section fade-in-up">
      <div class="section-header">
        <h3><el-icon><DataLine /></el-icon>各环境详细统计</h3>
      </div>
      <el-table :data="envStats" stripe v-loading="loadingStats">
        <el-table-column label="环境" width="160">
          <template #default="{ row }">
            <span class="env-tag" :class="row.environment">{{ row.label }}</span>
          </template>
        </el-table-column>
        <el-table-column label="生产线数" prop="pipeline_count" width="120" />
        <el-table-column label="运行次数" prop="run_count" width="120" />
        <el-table-column label="状态分布">
          <template #default="{ row }">
            <div class="status-breakdown">
              <el-tag v-for="item in row.status_breakdown" :key="item.status" size="small" :type="statusTypeMap[item.status]" round>
                {{ statusMap[item.status] || item.status }}: {{ item.count }}
              </el-tag>
              <span v-if="!row.status_breakdown?.length" class="no-data">暂无数据</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="配额倍率" width="120">
          <template #default="{ row }">{{ row.quota_multiplier }}x</template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="configDialogVisible" :title="`配置 - ${editingEnv?.label || ''}`" width="500px" destroy-on-close>
      <el-form ref="configFormRef" :model="configForm" :rules="configRules" label-width="100px">
        <el-form-item label="显示名称" prop="label">
          <el-input v-model="configForm.label" placeholder="环境显示名称" maxlength="20" />
        </el-form-item>
        <el-form-item label="配额倍率" prop="quota_multiplier">
          <el-input-number v-model="configForm.quota_multiplier" :min="0.1" :max="10" :step="0.1" :precision="2" style="width: 100%" />
          <div class="form-tip">该环境的配额将按此倍率计算</div>
        </el-form-item>
        <el-form-item label="默认标签集">
          <el-select v-model="configForm.default_tag_ids" multiple placeholder="选择默认标签" style="width: 100%">
            <el-option v-for="tag in allTags" :key="tag.id" :label="tag.name" :value="tag.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="configDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="saveConfig">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="cloneDialogVisible" title="跨环境复制生产线" width="500px" destroy-on-close>
      <el-form ref="cloneFormRef" :model="cloneForm" :rules="cloneRules" label-width="100px">
        <el-form-item label="源生产线" prop="pipelineId">
          <el-select v-model="cloneForm.pipelineId" placeholder="选择要复制的生产线" filterable style="width: 100%">
            <el-option v-for="p in sourcePipelines" :key="p.id" :label="p.name" :value="p.id">
              <span>{{ p.name }}</span>
              <span class="env-tag small" :class="p.environment" style="margin-left: 8px;">{{ envMap[p.environment] }}</span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="目标环境" prop="targetEnvironment">
          <el-select v-model="cloneForm.targetEnvironment" placeholder="选择目标环境" style="width: 100%">
            <el-option v-for="env in targetEnvironments" :key="env.environment" :label="env.label" :value="env.environment">
              <span class="env-dot" :class="env.environment"></span>
              {{ env.label }}
            </el-option>
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="cloneDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="cloning" @click="handleClone">复制</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '@/utils/request'

const loading = ref(false)
const loadingStats = ref(false)
const submitting = ref(false)
const cloning = ref(false)
const configDialogVisible = ref(false)
const cloneDialogVisible = ref(false)
const configFormRef = ref()
const cloneFormRef = ref()
const editingEnv = ref(null)

const envList = ref([])
const envStats = ref([])
const allTags = ref([])
const allPipelines = ref([])

const envMap = { development: '开发', test: '测试', production: '生产' }
const statusMap = { draft: '草稿', published: '已发布', running: '运行中', stopped: '已停止', error: '异常' }
const statusTypeMap = { draft: 'info', published: 'success', running: 'warning', stopped: 'info', error: 'danger' }

const configForm = reactive({ label: '', quota_multiplier: 1.0, default_tag_ids: [] })
const configRules = {
  label: [{ required: true, message: '请输入显示名称', trigger: 'blur' }],
  quota_multiplier: [{ required: true, message: '请输入配额倍率', trigger: 'blur' }]
}

const cloneForm = reactive({ pipelineId: null, targetEnvironment: '' })
const cloneRules = {
  pipelineId: [{ required: true, message: '请选择源生产线', trigger: 'change' }],
  targetEnvironment: [{ required: true, message: '请选择目标环境', trigger: 'change' }]
}

const userInfo = computed(() => {
  try { return JSON.parse(localStorage.getItem('userInfo') || '{}') } catch { return {} }
})
const isAdmin = computed(() => userInfo.value?.role === 'admin')

const sourcePipelines = computed(() => allPipelines.value.filter(p => !cloneForm.targetEnvironment || p.environment !== cloneForm.targetEnvironment))
const targetEnvironments = computed(() => {
  const source = allPipelines.value.find(p => p.id === cloneForm.pipelineId)
  return envList.value.filter(e => e.environment !== source?.environment)
})

const getTagName = (tagId) => {
  const tag = allTags.value.find(t => t.id === tagId)
  return tag ? tag.name : `标签${tagId}`
}

const loadEnvList = async () => {
  loading.value = true
  try {
    const res = await api.get('/environments/list')
    envList.value = res.data
  } catch { /* handled */ } finally { loading.value = false }
}

const loadEnvStats = async () => {
  if (!isAdmin.value) return
  loadingStats.value = true
  try {
    const res = await api.get('/environments/stats')
    envStats.value = res.data
  } catch { /* handled */ } finally { loadingStats.value = false }
}

const loadTags = async () => {
  try {
    const res = await api.get('/tags')
    allTags.value = res.data
  } catch { /* handled */ }
}

const loadAllPipelines = async () => {
  try {
    const res = await api.get('/pipelines', { params: { pageSize: 9999 } })
    allPipelines.value = res.data.list || []
  } catch { /* handled */ }
}

const openConfigDialog = (env) => {
  editingEnv.value = env
  configForm.label = env.label
  configForm.quota_multiplier = env.quota_multiplier
  configForm.default_tag_ids = [...(env.default_tag_ids || [])]
  configDialogVisible.value = true
}

const saveConfig = async () => {
  const valid = await configFormRef.value?.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    await api.put(`/environments/config/${editingEnv.value.environment}`, configForm)
    ElMessage.success('环境配置已更新')
    configDialogVisible.value = false
    loadEnvList()
    loadEnvStats()
  } catch { /* handled */ } finally { submitting.value = false }
}

const openCloneDialog = () => {
  cloneForm.pipelineId = null
  cloneForm.targetEnvironment = ''
  cloneDialogVisible.value = true
}

const handleClone = async () => {
  const valid = await cloneFormRef.value?.validate().catch(() => false)
  if (!valid) return
  cloning.value = true
  try {
    await api.post('/environments/clone', cloneForm)
    ElMessage.success('跨环境复制成功')
    cloneDialogVisible.value = false
    loadEnvList()
    loadEnvStats()
    loadAllPipelines()
  } catch { /* handled */ } finally { cloning.value = false }
}

onMounted(() => {
  loadEnvList()
  loadTags()
  loadAllPipelines()
  if (isAdmin.value) loadEnvStats()
})
</script>

<style scoped>
.env-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 20px;
  margin-bottom: 24px;
}
.env-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  transition: var(--transition);
  border-top: 3px solid transparent;
}
.env-card.development { border-top-color: #67C23A; }
.env-card.test { border-top-color: #E6A23C; }
.env-card.production { border-top-color: #F56C6C; }
.env-card:hover {
  box-shadow: var(--shadow-hover);
  transform: translateY(-2px);
}
.env-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.env-name {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}
.env-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: inline-block;
}
.env-card.development .env-dot { background: #67C23A; }
.env-card.test .env-dot { background: #E6A23C; }
.env-card.production .env-dot { background: #F56C6C; }
.env-key {
  font-size: 12px;
  color: var(--text-secondary);
  font-family: monospace;
  background: var(--bg-hover);
  padding: 2px 8px;
  border-radius: 4px;
}
.env-stats {
  display: flex;
  gap: 24px;
}
.stat-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
}
.stat-label {
  font-size: 12px;
  color: var(--text-secondary);
}
.env-config-preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 0;
  border-top: 1px solid var(--border-color);
}
.config-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.config-label {
  font-size: 13px;
  color: var(--text-secondary);
  min-width: 80px;
}
.config-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.config-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.no-tags {
  font-size: 12px;
  color: var(--text-secondary);
}
.env-card-actions {
  display: flex;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
}
.admin-section {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  padding: 24px;
}
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.section-header h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}
.env-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
}
.env-tag.development { background: rgba(103, 194, 58, 0.15); color: #67C23A; }
.env-tag.test { background: rgba(230, 162, 60, 0.15); color: #E6A23C; }
.env-tag.production { background: rgba(245, 108, 108, 0.15); color: #F56C6C; }
.env-tag.small { font-size: 10px; padding: 1px 6px; }
.env-dot.development { background: #67C23A; }
.env-dot.test { background: #E6A23C; }
.env-dot.production { background: #F56C6C; }
.status-breakdown {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.no-data {
  font-size: 12px;
  color: var(--text-secondary);
}
.form-tip {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}
</style>
