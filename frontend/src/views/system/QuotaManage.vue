<template>
  <div class="page-container">
    <div class="page-header fade-in-up">
      <h2 class="page-title">资源配额</h2>
      <div v-if="isAdmin" class="header-actions">
        <el-button type="primary" plain @click="exportCSV">
          <el-icon><Download /></el-icon>导出报表
        </el-button>
        <el-button type="primary" @click="openConfigDialog">
          <el-icon><Setting /></el-icon>全局配置
        </el-button>
      </div>
    </div>

    <div v-if="!isAdmin" class="usage-card fade-in-up">
      <div class="card-title">
        <el-icon :size="20"><Odometer /></el-icon>
        <span>我的配额使用情况</span>
      </div>
      <div class="quota-grid">
        <div class="quota-item">
          <div class="quota-header">
            <span class="quota-label">生产线总数</span>
            <span class="quota-count">{{ usageData.details.pipelines.used }} / {{ formatLimit(usageData.details.pipelines.limit) }}</span>
          </div>
          <el-progress 
            :percentage="Math.round(usageData.details.pipelines.percentage)" 
            :status="getStatus(usageData.details.pipelines.percentage)"
            :stroke-width="12"
          />
          <div class="quota-remaining">剩余: {{ formatRemaining(usageData.details.pipelines.remaining) }}</div>
        </div>
        <div class="quota-item">
          <div class="quota-header">
            <span class="quota-label">标签总数</span>
            <span class="quota-count">{{ usageData.details.tags.used }} / {{ formatLimit(usageData.details.tags.limit) }}</span>
          </div>
          <el-progress 
            :percentage="Math.round(usageData.details.tags.percentage)" 
            :status="getStatus(usageData.details.tags.percentage)"
            :stroke-width="12"
          />
          <div class="quota-remaining">剩余: {{ formatRemaining(usageData.details.tags.remaining) }}</div>
        </div>
        <div class="quota-item">
          <div class="quota-header">
            <span class="quota-label">今日发布次数</span>
            <span class="quota-count">{{ usageData.details.publishes_today.used }} / {{ formatLimit(usageData.details.publishes_today.limit) }}</span>
          </div>
          <el-progress 
            :percentage="Math.round(usageData.details.publishes_today.percentage)" 
            :status="getStatus(usageData.details.publishes_today.percentage)"
            :stroke-width="12"
          />
          <div class="quota-remaining">剩余: {{ formatRemaining(usageData.details.publishes_today.remaining) }}</div>
        </div>
      </div>
      <div v-if="usageData.hasUserOverride" class="override-badge">
        <el-tag type="warning" effect="dark">
          <el-icon><Warning /></el-icon> 已配置个性化配额
        </el-tag>
      </div>
    </div>

    <div v-if="isAdmin" class="admin-section fade-in-up">
      <div class="section-header">
        <h3><el-icon><User /></el-icon>全局配额配置</h3>
        <el-button size="small" type="primary" link @click="openConfigDialog">
          <el-icon><Edit /></el-icon>编辑
        </el-button>
      </div>
      <div class="global-config-card">
        <div class="config-grid">
          <div class="config-item">
            <span class="config-label">生产线总数上限</span>
            <span class="config-value">{{ formatLimit(globalConfig.max_pipelines) }}</span>
          </div>
          <div class="config-item">
            <span class="config-label">标签总数上限</span>
            <span class="config-value">{{ formatLimit(globalConfig.max_tags) }}</span>
          </div>
          <div class="config-item">
            <span class="config-label">单条生产线最大节点数</span>
            <span class="config-value">{{ formatLimit(globalConfig.max_nodes_per_pipeline) }}</span>
          </div>
          <div class="config-item">
            <span class="config-label">单日最大发布次数</span>
            <span class="config-value">{{ formatLimit(globalConfig.max_publishes_per_day) }}</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="isAdmin" class="admin-section fade-in-up">
      <div class="section-header">
        <h3><el-icon><Avatar /></el-icon>用户配额管理</h3>
      </div>
      <el-table :data="usersQuota" stripe v-loading="loadingUsers">
        <el-table-column label="用户" width="180">
          <template #default="{ row }">
            <div class="user-info">
              <el-avatar :size="36" :style="{ background: 'var(--gradient-primary)' }">
                {{ row.user.nickname?.charAt(0) || 'U' }}
              </el-avatar>
              <div class="user-meta">
                <div class="user-name">{{ row.user.nickname }}</div>
                <div class="user-role">
                  <el-tag size="small" :type="row.user.role === 'admin' ? 'danger' : row.user.role === 'editor' ? 'warning' : 'info'">
                    {{ roleMap[row.user.role] }}
                  </el-tag>
                </div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="生产线" width="180">
          <template #default="{ row }">
            <div class="mini-progress">
              <div class="progress-label">
                <span>{{ row.usage.pipelines }} / {{ formatLimit(row.quota.max_pipelines) }}</span>
              </div>
              <el-progress 
                :percentage="row.quota.max_pipelines === -1 ? 0 : Math.min(100, (row.usage.pipelines / row.quota.max_pipelines) * 100)"
                :status="row.quota.max_pipelines === -1 ? '' : getStatus((row.usage.pipelines / row.quota.max_pipelines) * 100)"
                :stroke-width="6"
                :show-text="false"
              />
            </div>
          </template>
        </el-table-column>
        <el-table-column label="标签" width="180">
          <template #default="{ row }">
            <div class="mini-progress">
              <div class="progress-label">
                <span>{{ row.usage.tags }} / {{ formatLimit(row.quota.max_tags) }}</span>
              </div>
              <el-progress 
                :percentage="row.quota.max_tags === -1 ? 0 : Math.min(100, (row.usage.tags / row.quota.max_tags) * 100)"
                :status="row.quota.max_tags === -1 ? '' : getStatus((row.usage.tags / row.quota.max_tags) * 100)"
                :stroke-width="6"
                :show-text="false"
              />
            </div>
          </template>
        </el-table-column>
        <el-table-column label="今日发布" width="180">
          <template #default="{ row }">
            <div class="mini-progress">
              <div class="progress-label">
                <span>{{ row.usage.publishes_today }} / {{ formatLimit(row.quota.max_publishes_per_day) }}</span>
              </div>
              <el-progress 
                :percentage="row.quota.max_publishes_per_day === -1 ? 0 : Math.min(100, (row.usage.publishes_today / row.quota.max_publishes_per_day) * 100)"
                :status="row.quota.max_publishes_per_day === -1 ? '' : getStatus((row.usage.publishes_today / row.quota.max_publishes_per_day) * 100)"
                :stroke-width="6"
                :show-text="false"
              />
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" link @click="openUserQuotaDialog(row)">
              <el-icon><Edit /></el-icon>配置
            </el-button>
            <el-button size="small" type="danger" link @click="resetUserQuota(row.user.id)">
              <el-icon><Refresh /></el-icon>重置
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="configDialogVisible" :title="editingUser ? '用户配额配置' : '全局配额配置'" width="500px" destroy-on-close>
      <el-form ref="configFormRef" :model="configForm" :rules="configRules" label-width="140px">
        <el-form-item label="生产线总数上限" prop="max_pipelines">
          <el-input-number v-model="configForm.max_pipelines" :min="-1" :max="9999" style="width: 100%" />
          <div class="form-tip">输入 -1 表示无限制</div>
        </el-form-item>
        <el-form-item label="标签总数上限" prop="max_tags">
          <el-input-number v-model="configForm.max_tags" :min="-1" :max="9999" style="width: 100%" />
          <div class="form-tip">输入 -1 表示无限制</div>
        </el-form-item>
        <el-form-item label="单条生产线最大节点数" prop="max_nodes_per_pipeline">
          <el-input-number v-model="configForm.max_nodes_per_pipeline" :min="-1" :max="9999" style="width: 100%" />
          <div class="form-tip">输入 -1 表示无限制</div>
        </el-form-item>
        <el-form-item label="单日最大发布次数" prop="max_publishes_per_day">
          <el-input-number v-model="configForm.max_publishes_per_day" :min="-1" :max="9999" style="width: 100%" />
          <div class="form-tip">输入 -1 表示无限制</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="configDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="saveConfig">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '@/utils/request'

const loading = ref(false)
const loadingUsers = ref(false)
const submitting = ref(false)
const configDialogVisible = ref(false)
const editingUser = ref(null)
const configFormRef = ref()

const userInfo = computed(() => {
  try { return JSON.parse(localStorage.getItem('userInfo') || '{}') } catch { return {} }
})
const isAdmin = computed(() => userInfo.value.role === 'admin')
const roleMap = { admin: '管理员', editor: '编辑者', viewer: '查看者' }

const usageData = ref({
  quota: {},
  usage: {},
  details: {
    pipelines: { used: 0, limit: 0, remaining: 0, percentage: 0 },
    tags: { used: 0, limit: 0, remaining: 0, percentage: 0 },
    publishes_today: { used: 0, limit: 0, remaining: 0, percentage: 0 }
  },
  hasUserOverride: false
})

const globalConfig = ref({
  max_pipelines: 10,
  max_tags: 20,
  max_nodes_per_pipeline: 50,
  max_publishes_per_day: 10
})

const usersQuota = ref([])

const configForm = reactive({
  max_pipelines: 10,
  max_tags: 20,
  max_nodes_per_pipeline: 50,
  max_publishes_per_day: 10
})

const configRules = {
  max_pipelines: [{ required: true, message: '请输入生产线总数上限', trigger: 'blur' }],
  max_tags: [{ required: true, message: '请输入标签总数上限', trigger: 'blur' }],
  max_nodes_per_pipeline: [{ required: true, message: '请输入单条生产线最大节点数', trigger: 'blur' }],
  max_publishes_per_day: [{ required: true, message: '请输入单日最大发布次数', trigger: 'blur' }]
}

const formatLimit = (val) => val === -1 ? '无限制' : val
const formatRemaining = (val) => val === Infinity ? '无限制' : val

const getStatus = (percentage) => {
  if (percentage >= 90) return 'exception'
  if (percentage >= 70) return 'warning'
  return ''
}

const loadUsage = async () => {
  loading.value = true
  try {
    const res = await api.get('/quota/usage')
    usageData.value = res.data
  } catch { /* handled */ } finally { loading.value = false }
}

const loadGlobalConfig = async () => {
  try {
    const res = await api.get('/quota/config')
    globalConfig.value = res.data
  } catch { /* handled */ }
}

const loadUsersQuota = async () => {
  if (!isAdmin.value) return
  loadingUsers.value = true
  try {
    const res = await api.get('/quota/users')
    usersQuota.value = res.data
  } catch { /* handled */ } finally { loadingUsers.value = false }
}

const openConfigDialog = () => {
  editingUser.value = null
  Object.assign(configForm, globalConfig.value)
  configDialogVisible.value = true
}

const openUserQuotaDialog = (row) => {
  editingUser.value = row.user
  api.get(`/quota/user/${row.user.id}`).then(res => {
    const q = res.data.userQuota
    Object.assign(configForm, {
      max_pipelines: q.max_pipelines ?? globalConfig.value.max_pipelines,
      max_tags: q.max_tags ?? globalConfig.value.max_tags,
      max_nodes_per_pipeline: q.max_nodes_per_pipeline ?? globalConfig.value.max_nodes_per_pipeline,
      max_publishes_per_day: q.max_publishes_per_day ?? globalConfig.value.max_publishes_per_day
    })
    configDialogVisible.value = true
  })
}

const saveConfig = async () => {
  const valid = await configFormRef.value?.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    if (editingUser.value) {
      await api.put(`/quota/user/${editingUser.value.id}`, configForm)
      ElMessage.success('用户配额已更新')
    } else {
      await api.put('/quota/config', configForm)
      globalConfig.value = { ...configForm }
      ElMessage.success('全局配额配置已更新')
    }
    configDialogVisible.value = false
    loadUsage()
    loadUsersQuota()
  } catch { /* handled */ } finally { submitting.value = false }
}

const resetUserQuota = async (userId) => {
  try {
    await ElMessageBox.confirm('确认重置该用户的配额为全局配置？', '提示', { type: 'warning' })
    await api.delete(`/quota/user/${userId}`)
    ElMessage.success('用户配额已重置')
    loadUsersQuota()
  } catch { /* handled */ }
}

const exportCSV = async () => {
  try {
    const response = await api.get('/quota/export', { responseType: 'blob' })
    const url = window.URL.createObjectURL(new Blob([response]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `quota_usage_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
    ElMessage.success('导出成功')
  } catch { /* handled */ }
}

onMounted(() => {
  loadUsage()
  if (isAdmin.value) {
    loadGlobalConfig()
    loadUsersQuota()
  }
})
</script>

<style scoped>
.usage-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  padding: 24px;
  margin-bottom: 24px;
}
.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 20px;
}
.quota-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
}
.quota-item {
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
  padding: 16px;
}
.quota-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
}
.quota-label {
  font-size: 14px;
  color: var(--text-secondary);
}
.quota-count {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.quota-remaining {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 8px;
}
.override-badge {
  margin-top: 16px;
  text-align: right;
}
.admin-section {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  padding: 24px;
  margin-bottom: 24px;
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
.config-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}
.config-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.config-label {
  font-size: 13px;
  color: var(--text-secondary);
}
.config-value {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}
.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
}
.user-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.user-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}
.user-role {
  font-size: 12px;
}
.mini-progress {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.progress-label {
  font-size: 12px;
  color: var(--text-secondary);
}
.form-tip {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}
.header-actions {
  display: flex;
  gap: 8px;
}
</style>
