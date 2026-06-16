<template>
  <div class="page-container">
    <div class="page-header fade-in-up">
      <h2 class="page-title">告警规则</h2>
    </div>

    <el-tabs v-model="activeTab" class="alert-tabs fade-in-up" @tab-change="handleTabChange">
      <el-tab-pane label="规则管理" name="rules">
        <div class="filter-bar">
          <el-input v-model="ruleFilters.keyword" placeholder="搜索规则名称..." clearable style="width: 240px" prefix-icon="Search" @clear="loadRules" @keyup.enter="loadRules" />
          <el-select v-model="ruleFilters.conditionType" placeholder="条件类型" clearable style="width: 160px" @change="loadRules">
            <el-option label="运行失败" value="run_failed" />
            <el-option label="运行超时" value="run_timeout" />
            <el-option label="错误数阈值" value="error_threshold" />
            <el-option label="连续失败次数" value="consecutive_failure" />
          </el-select>
          <el-select v-model="ruleFilters.enabled" placeholder="启用状态" clearable style="width: 120px" @change="loadRules">
            <el-option label="已启用" :value="1" />
            <el-option label="已禁用" :value="0" />
          </el-select>
          <el-button @click="loadRules" type="primary" plain><el-icon><Search /></el-icon>搜索</el-button>
          <div style="flex:1"></div>
          <el-button type="primary" @click="openRuleDialog()">
            <el-icon><Plus /></el-icon>新建规则
          </el-button>
        </div>

        <el-table :data="ruleList" v-loading="ruleLoading" stripe style="width:100%">
          <el-table-column prop="name" label="规则名称" min-width="140" />
          <el-table-column label="关联生产线" min-width="120">
            <template #default="{ row }">{{ row.pipeline_name || '全部' }}</template>
          </el-table-column>
          <el-table-column label="条件类型" min-width="120">
            <template #default="{ row }">
              <el-tag :type="conditionTagType(row.condition_type)" size="small" effect="dark" round>
                {{ conditionMap[row.condition_type] }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="threshold" label="阈值" width="90" align="center">
            <template #default="{ row }">{{ row.condition_type === 'run_failed' ? '-' : row.threshold }}</template>
          </el-table-column>
          <el-table-column label="静默期" width="90" align="center">
            <template #default="{ row }">{{ row.silence_minutes }}分钟</template>
          </el-table-column>
          <el-table-column label="通知渠道" width="100" align="center">
            <template #default="{ row }">{{ channelMap[row.notify_channel] || row.notify_channel }}</template>
          </el-table-column>
          <el-table-column label="状态" width="90" align="center">
            <template #default="{ row }">
              <el-switch :model-value="!!row.enabled" @change="val => handleToggleRule(row, val)" size="small" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="220" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" plain @click="openRuleDialog(row)">编辑</el-button>
              <el-button size="small" type="warning" plain @click="handleSimulate(row)">模拟触发</el-button>
              <el-popconfirm title="确认删除该规则？" @confirm="handleDeleteRule(row.id)">
                <template #reference>
                  <el-button size="small" type="danger" plain>删除</el-button>
                </template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>

        <div class="pagination-bar" v-if="ruleTotal > rulePageSize">
          <el-pagination background layout="total, prev, pager, next" :total="ruleTotal" :page-size="rulePageSize" v-model:current-page="rulePage" @current-change="loadRules" />
        </div>
      </el-tab-pane>

      <el-tab-pane label="告警事件" name="events">
        <div class="filter-bar">
          <el-input v-model="eventFilters.ruleName" placeholder="搜索规则名称..." clearable style="width: 240px" prefix-icon="Search" @clear="loadEvents" @keyup.enter="loadEvents" />
          <el-select v-model="eventFilters.confirmed" placeholder="确认状态" clearable style="width: 120px" @change="loadEvents">
            <el-option label="未确认" :value="0" />
            <el-option label="已确认" :value="1" />
          </el-select>
          <el-date-picker v-model="eventTimeRange" type="datetimerange" range-separator="至" start-placeholder="开始时间" end-placeholder="结束时间" format="YYYY-MM-DD HH:mm" value-format="YYYY-MM-DD HH:mm:ss" style="width: 380px" @change="loadEvents" />
          <el-button @click="loadEvents" type="primary" plain><el-icon><Search /></el-icon>搜索</el-button>
          <div style="flex:1"></div>
          <el-button type="success" plain :disabled="selectedEventIds.length === 0" @click="handleBatchConfirm">
            <el-icon><Check /></el-icon>批量确认 ({{ selectedEventIds.length }})
          </el-button>
          <el-button type="info" plain @click="handleExportEvents">
            <el-icon><Download /></el-icon>导出
          </el-button>
        </div>

        <el-table :data="eventList" v-loading="eventLoading" stripe style="width:100%" @selection-change="handleEventSelection">
          <el-table-column type="selection" width="50" />
          <el-table-column prop="rule_name" label="规则名称" min-width="140" />
          <el-table-column label="关联生产线" min-width="120">
            <template #default="{ row }">{{ row.pipeline_name || '全部' }}</template>
          </el-table-column>
          <el-table-column label="关联 Run" width="100" align="center">
            <template #default="{ row }">
              <span v-if="row.run_id">#{{ row.run_id }}</span>
              <span v-else class="text-muted">-</span>
            </template>
          </el-table-column>
          <el-table-column label="触发时间" min-width="160">
            <template #default="{ row }">{{ formatDate(row.triggered_at) }}</template>
          </el-table-column>
          <el-table-column label="确认状态" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="row.confirmed ? 'success' : 'danger'" size="small" effect="dark" round>
                {{ row.confirmed ? '已确认' : '未确认' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="确认人" width="100" align="center">
            <template #default="{ row }">{{ row.confirmed_by || '-' }}</template>
          </el-table-column>
          <el-table-column label="确认时间" min-width="160">
            <template #default="{ row }">{{ formatDate(row.confirmed_at) }}</template>
          </el-table-column>
        </el-table>

        <div class="pagination-bar" v-if="eventTotal > eventPageSize">
          <el-pagination background layout="total, prev, pager, next" :total="eventTotal" :page-size="eventPageSize" v-model:current-page="eventPage" @current-change="loadEvents" />
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="ruleDialogVisible" :title="editRuleId ? '编辑告警规则' : '新建告警规则'" width="560px" destroy-on-close>
      <el-form ref="ruleFormRef" :model="ruleForm" :rules="ruleFormRules" label-width="100px">
        <el-form-item label="规则名称" prop="name">
          <el-input v-model="ruleForm.name" placeholder="请输入规则名称" maxlength="50" show-word-limit />
        </el-form-item>
        <el-form-item label="关联生产线">
          <el-select v-model="ruleForm.pipelineId" placeholder="全部生产线" clearable style="width:100%">
            <el-option v-for="p in pipelines" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="条件类型" prop="conditionType">
          <el-select v-model="ruleForm.conditionType" placeholder="请选择条件类型" style="width:100%">
            <el-option label="运行失败" value="run_failed" />
            <el-option label="运行超时" value="run_timeout" />
            <el-option label="错误数阈值" value="error_threshold" />
            <el-option label="连续失败次数" value="consecutive_failure" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="ruleForm.conditionType !== 'run_failed'" label="阈值参数" prop="threshold">
          <el-input-number v-model="ruleForm.threshold" :min="1" :max="9999" controls-position="right" style="width:100%" />
          <div class="form-hint" v-if="ruleForm.conditionType === 'run_timeout'">超时分钟数</div>
          <div class="form-hint" v-else-if="ruleForm.conditionType === 'error_threshold'">错误数阈值</div>
          <div class="form-hint" v-else-if="ruleForm.conditionType === 'consecutive_failure'">连续失败次数</div>
        </el-form-item>
        <el-form-item label="静默期">
          <el-input-number v-model="ruleForm.silenceMinutes" :min="0" :max="9999" controls-position="right" style="width:100%" />
          <div class="form-hint">分钟，同一规则在静默期内不重复触发</div>
        </el-form-item>
        <el-form-item label="通知渠道">
          <el-select v-model="ruleForm.notifyChannel" style="width:100%">
            <el-option label="站内通知" value="in_app" />
            <el-option label="邮件（占位）" value="email" />
          </el-select>
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="ruleForm.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="ruleDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="ruleSubmitting" @click="handleSubmitRule">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '@/utils/request'
import dayjs from 'dayjs'

const activeTab = ref('rules')

const conditionMap = { run_failed: '运行失败', run_timeout: '运行超时', error_threshold: '错误数阈值', consecutive_failure: '连续失败次数' }
const channelMap = { in_app: '站内通知', email: '邮件' }
const conditionTagType = (type) => {
  const map = { run_failed: 'danger', run_timeout: 'warning', error_threshold: '', consecutive_failure: 'danger' }
  return map[type] || ''
}

const formatDate = (d) => d ? dayjs(d).format('YYYY-MM-DD HH:mm:ss') : '-'

const ruleLoading = ref(false)
const ruleList = ref([])
const ruleTotal = ref(0)
const rulePage = ref(1)
const rulePageSize = 10
const ruleFilters = reactive({ keyword: '', conditionType: '', enabled: '' })
const ruleDialogVisible = ref(false)
const editRuleId = ref(null)
const ruleSubmitting = ref(false)
const ruleFormRef = ref()
const pipelines = ref([])

const ruleForm = reactive({
  name: '',
  pipelineId: null,
  conditionType: '',
  threshold: 1,
  silenceMinutes: 0,
  notifyChannel: 'in_app',
  enabled: true
})
const ruleFormRules = {
  name: [{ required: true, message: '请输入规则名称', trigger: 'blur' }],
  conditionType: [{ required: true, message: '请选择条件类型', trigger: 'change' }]
}

const eventLoading = ref(false)
const eventList = ref([])
const eventTotal = ref(0)
const eventPage = ref(1)
const eventPageSize = 10
const eventFilters = reactive({ ruleName: '', confirmed: '' })
const eventTimeRange = ref(null)
const selectedEventIds = ref([])

const loadRules = async () => {
  ruleLoading.value = true
  try {
    const params = { ...ruleFilters, page: rulePage.value, pageSize: rulePageSize }
    if (params.enabled === '') delete params.enabled
    const res = await api.get('/alert/rules', { params })
    ruleList.value = res.data.list
    ruleTotal.value = res.data.total
  } catch { /* handled */ } finally { ruleLoading.value = false }
}

const loadPipelines = async () => {
  try {
    const res = await api.get('/pipelines', { params: { pageSize: 999 } })
    pipelines.value = res.data.list
  } catch { /* handled */ }
}

const openRuleDialog = (row) => {
  editRuleId.value = row?.id || null
  ruleForm.name = row?.name || ''
  ruleForm.pipelineId = row?.pipeline_id || null
  ruleForm.conditionType = row?.condition_type || ''
  ruleForm.threshold = row?.threshold ?? 1
  ruleForm.silenceMinutes = row?.silence_minutes ?? 0
  ruleForm.notifyChannel = row?.notify_channel || 'in_app'
  ruleForm.enabled = row ? !!row.enabled : true
  ruleDialogVisible.value = true
}

const handleSubmitRule = async () => {
  const valid = await ruleFormRef.value?.validate().catch(() => false)
  if (!valid) return
  ruleSubmitting.value = true
  try {
    const payload = {
      name: ruleForm.name,
      pipelineId: ruleForm.pipelineId || null,
      conditionType: ruleForm.conditionType,
      threshold: ruleForm.conditionType === 'run_failed' ? 0 : ruleForm.threshold,
      silenceMinutes: ruleForm.silenceMinutes,
      notifyChannel: ruleForm.notifyChannel,
      enabled: ruleForm.enabled ? 1 : 0
    }
    if (editRuleId.value) {
      await api.put(`/alert/rules/${editRuleId.value}`, payload)
      ElMessage.success('更新成功')
    } else {
      await api.post('/alert/rules', payload)
      ElMessage.success('创建成功')
    }
    ruleDialogVisible.value = false
    loadRules()
  } catch { /* handled */ } finally { ruleSubmitting.value = false }
}

const handleDeleteRule = async (id) => {
  try {
    await api.delete(`/alert/rules/${id}`)
    ElMessage.success('删除成功')
    loadRules()
  } catch { /* handled */ }
}

const handleToggleRule = async (row, val) => {
  try {
    await api.patch(`/alert/rules/${row.id}/toggle`, { enabled: val ? 1 : 0 })
    ElMessage.success(val ? '已启用' : '已禁用')
    loadRules()
  } catch { /* handled */ }
}

const handleSimulate = async (row) => {
  try {
    await ElMessageBox.confirm(`确认对规则「${row.name}」执行模拟触发？将写入一条测试事件。`, '模拟触发', { type: 'warning' })
    await api.post(`/alert/rules/${row.id}/simulate`)
    ElMessage.success('模拟触发成功')
  } catch { /* handled or cancelled */ }
}

const loadEvents = async () => {
  eventLoading.value = true
  try {
    const params = { ...eventFilters, page: eventPage.value, pageSize: eventPageSize }
    if (params.confirmed === '') delete params.confirmed
    if (eventTimeRange.value && eventTimeRange.value.length === 2) {
      params.startTime = eventTimeRange.value[0]
      params.endTime = eventTimeRange.value[1]
    }
    const res = await api.get('/alert/events', { params })
    eventList.value = res.data.list
    eventTotal.value = res.data.total
  } catch { /* handled */ } finally { eventLoading.value = false }
}

const handleEventSelection = (rows) => {
  selectedEventIds.value = rows.filter(r => !r.confirmed).map(r => r.id)
}

const handleBatchConfirm = async () => {
  if (selectedEventIds.value.length === 0) return
  try {
    await api.patch('/alert/events/batch-confirm', { ids: selectedEventIds.value })
    ElMessage.success('批量确认成功')
    loadEvents()
  } catch { /* handled */ }
}

const handleExportEvents = () => {
  const params = new URLSearchParams()
  if (eventTimeRange.value && eventTimeRange.value.length === 2) {
    params.set('startTime', eventTimeRange.value[0])
    params.set('endTime', eventTimeRange.value[1])
  }
  const token = localStorage.getItem('token')
  const url = `/api/alert/events/export?${params.toString()}`
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', `alert_events_${dayjs().format('YYYYMMDDHHmmss')}.csv`)
  const xhr = new XMLHttpRequest()
  xhr.open('GET', url, true)
  xhr.setRequestHeader('Authorization', `Bearer ${token}`)
  xhr.responseType = 'blob'
  xhr.onload = () => {
    if (xhr.status === 200) {
      const blobUrl = URL.createObjectURL(xhr.response)
      link.href = blobUrl
      link.click()
      URL.revokeObjectURL(blobUrl)
    } else {
      ElMessage.error('导出失败')
    }
  }
  xhr.send()
}

const handleTabChange = (tab) => {
  if (tab === 'events') loadEvents()
  else loadRules()
}

onMounted(() => { loadRules(); loadPipelines() })
</script>

<style scoped>
.alert-tabs :deep(.el-tabs__header) {
  margin-bottom: 20px;
}
.alert-tabs :deep(.el-tabs__item) {
  font-size: 15px;
  font-weight: 600;
}
.filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
  align-items: center;
}
.pagination-bar {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}
.form-hint {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}
.text-muted {
  color: var(--text-secondary);
}
</style>
