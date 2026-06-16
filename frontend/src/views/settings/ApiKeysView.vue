<template>
  <div class="page-container">
    <div class="page-header fade-in-up">
      <h2 class="page-title">API 密钥管理</h2>
      <el-button type="primary" @click="openCreateDialog">
        <el-icon><Plus /></el-icon>生成新密钥
      </el-button>
    </div>

    <div class="content-section fade-in-up" v-loading="loading">
      <div class="table-card">
        <el-table :data="list" stripe style="width: 100%">
          <el-table-column prop="name" label="名称" min-width="150" />
          <el-table-column prop="key_prefix" label="前缀" width="140">
            <template #default="{ row }">
              <span class="key-prefix">{{ row.key_prefix }}...</span>
            </template>
          </el-table-column>
          <el-table-column prop="scope" label="权限" width="100">
            <template #default="{ row }">
              <el-tag :type="row.scope === 'write' ? 'danger' : 'primary'" size="small">
                {{ row.scope === 'write' ? 'write' : 'read' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="getStatusType(row)" size="small">
                {{ getStatusText(row) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="created_at" label="创建时间" width="180">
            <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
          </el-table-column>
          <el-table-column prop="expires_at" label="过期时间" width="180">
            <template #default="{ row }">
              {{ row.expires_at ? formatDate(row.expires_at) : '永不过期' }}
            </template>
          </el-table-column>
          <el-table-column prop="last_used_at" label="最后使用" width="180">
            <template #default="{ row }">
              {{ row.last_used_at ? formatDate(row.last_used_at) : '从未使用' }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="140" fixed="right">
            <template #default="{ row }">
              <el-button
                size="small"
                type="danger"
                text
                :disabled="row.status === 'revoked' || row.is_expired"
                @click="handleRevoke(row)"
              >
                吊销
              </el-button>
              <el-button size="small" text type="danger" @click="handleDelete(row)">
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="pagination-wrapper">
          <el-pagination
            v-model:current-page="pagination.page"
            v-model:page-size="pagination.pageSize"
            :page-sizes="[10, 20, 50]"
            :total="pagination.total"
            layout="total, sizes, prev, pager, next"
            @size-change="loadList"
            @current-change="loadList"
          />
        </div>
      </div>
    </div>

    <div class="content-section fade-in-up">
      <div class="curl-examples-card">
        <div class="card-header">
          <h3 class="card-title">
            <el-icon><Document /></el-icon>
            API 调用示例
          </h3>
          <el-radio-group v-model="selectedScope" size="small" @change="updateCurlExamples">
            <el-radio-button label="read">read</el-radio-button>
            <el-radio-button label="write">write</el-radio-button>
          </el-radio-group>
        </div>
        <div class="curl-examples">
          <div v-for="(example, index) in curlExamples" :key="index" class="curl-item">
            <div class="curl-title">
              <el-tag :type="example.method === 'GET' ? 'success' : 'warning'" size="small">
                {{ example.method }}
              </el-tag>
              <span>{{ example.name }}</span>
            </div>
            <div class="curl-code-wrapper">
              <pre class="curl-code"><code>{{ example.code }}</code></pre>
              <el-button size="small" text @click="copyToClipboard(example.code)">
                <el-icon><CopyDocument /></el-icon>
                复制
              </el-button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <el-dialog
      v-model="createDialogVisible"
      title="生成 API 密钥"
      width="500px"
      destroy-on-close
      :close-on-click-modal="false"
    >
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-width="100px">
        <el-form-item label="密钥名称" prop="name">
          <el-input v-model="createForm.name" placeholder="请输入密钥名称" maxlength="100" show-word-limit />
        </el-form-item>
        <el-form-item label="权限范围" prop="scope">
          <el-radio-group v-model="createForm.scope">
            <el-radio value="read">read（只读）</el-radio>
            <el-radio value="write">write（读写）</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="过期时间" prop="expiresIn">
          <el-select v-model="createForm.expiresIn" style="width: 100%">
            <el-option :value="30" label="30 天" />
            <el-option :value="90" label="90 天" />
            <el-option :value="365" label="365 天" />
            <el-option :value="-1" label="永不过期" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="handleCreate">生成密钥</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="keyDisplayDialogVisible"
      title="密钥创建成功"
      width="500px"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      :show-close="false"
    >
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="请妥善保管你的 API 密钥"
        description="出于安全原因，这是唯一一次显示完整密钥，离开此页面后将无法再次查看。"
        style="margin-bottom: 20px;"
      />
      <div class="key-display">
        <div class="key-label">密钥名称</div>
        <div class="key-value">{{ createdKey.name }}</div>
      </div>
      <div class="key-display">
        <div class="key-label">完整密钥</div>
        <div class="key-value key-full">
          <span class="key-text">{{ createdKey.key }}</span>
          <el-button size="small" type="primary" @click="copyToClipboard(createdKey.key)">
            <el-icon><CopyDocument /></el-icon>
            复制
          </el-button>
        </div>
      </div>
      <template #footer>
        <el-button type="primary" @click="keyDisplayDialogVisible = false">我已保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import api from '@/utils/request'

const loading = ref(false)
const creating = ref(false)
const list = ref([])
const selectedScope = ref('read')

const createDialogVisible = ref(false)
const keyDisplayDialogVisible = ref(false)
const createFormRef = ref()
const createForm = reactive({
  name: '',
  scope: 'read',
  expiresIn: 30
})
const createRules = {
  name: [{ required: true, message: '请输入密钥名称', trigger: 'blur' }]
}

const createdKey = reactive({
  id: null,
  name: '',
  key: '',
  key_prefix: '',
  scope: 'read'
})

const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0
})

const loadList = async () => {
  loading.value = true
  try {
    const res = await api.get('/api-keys', {
      params: {
        page: pagination.page,
        pageSize: pagination.pageSize
      }
    })
    list.value = res.data.list
    pagination.total = res.data.total
  } catch (e) {
    // handled by interceptor
  } finally {
    loading.value = false
  }
}

const openCreateDialog = () => {
  createForm.name = ''
  createForm.scope = 'read'
  createForm.expiresIn = 30
  createDialogVisible.value = true
}

const handleCreate = async () => {
  const valid = await createFormRef.value?.validate().catch(() => false)
  if (!valid) return
  creating.value = true
  try {
    const res = await api.post('/api-keys', {
      name: createForm.name,
      scope: createForm.scope,
      expiresIn: createForm.expiresIn
    })
    createdKey.id = res.data.id
    createdKey.name = res.data.name
    createdKey.key = res.data.key
    createdKey.key_prefix = res.data.key_prefix
    createdKey.scope = res.data.scope
    createDialogVisible.value = false
    keyDisplayDialogVisible.value = true
    loadList()
  } catch (e) {
    // handled
  } finally {
    creating.value = false
  }
}

const handleRevoke = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定要吊销密钥"${row.name}"吗？吊销后该密钥将立即失效。`,
      '确认吊销',
      { type: 'warning' }
    )
    await api.put(`/api-keys/${row.id}/revoke`)
    ElMessage.success('吊销成功')
    loadList()
  } catch { /* handled or cancelled */ }
}

const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除密钥"${row.name}"吗？此操作不可恢复。`,
      '确认删除',
      { type: 'warning' }
    )
    await api.delete(`/api-keys/${row.id}`)
    ElMessage.success('删除成功')
    loadList()
  } catch { /* handled or cancelled */ }
}

const getStatusType = (row) => {
  if (row.status === 'revoked') return 'info'
  if (row.is_expired) return 'info'
  return 'success'
}

const getStatusText = (row) => {
  if (row.status === 'revoked') return '已吊销'
  if (row.is_expired) return '已过期'
  return '活跃'
}

const formatDate = (date) => {
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss')
}

const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制到剪贴板')
  } catch (e) {
    const textarea = document.createElement('textarea')
    textarea.value = text
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
    ElMessage.success('已复制到剪贴板')
  }
}

const baseUrl = window.location.origin + '/api/open'

const curlExamples = computed(() => {
  const scope = selectedScope.value
  const examples = []

  if (scope === 'read' || scope === 'write') {
    examples.push({
      name: '获取生产线列表',
      method: 'GET',
      code: `curl -X GET "${baseUrl}/pipelines" \\\n  -H "x-api-key: YOUR_API_KEY"`
    })
    examples.push({
      name: '获取生产线详情',
      method: 'GET',
      code: `curl -X GET "${baseUrl}/pipelines/1" \\\n  -H "x-api-key: YOUR_API_KEY"`
    })
    examples.push({
      name: '获取监控概览',
      method: 'GET',
      code: `curl -X GET "${baseUrl}/monitor/overview" \\\n  -H "x-api-key: YOUR_API_KEY"`
    })
    examples.push({
      name: '获取运行记录',
      method: 'GET',
      code: `curl -X GET "${baseUrl}/monitor/runs" \\\n  -H "x-api-key: YOUR_API_KEY"`
    })
  }

  if (scope === 'write') {
    examples.push({
      name: '创建生产线',
      method: 'POST',
      code: `curl -X POST "${baseUrl}/pipelines" \\\n  -H "x-api-key: YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"name":"新生产线","description":"生产线描述","tagIds":[]}'`
    })
    examples.push({
      name: '保存编排数据',
      method: 'PUT',
      code: `curl -X PUT "${baseUrl}/flows/1" \\\n  -H "x-api-key: YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"flowData":{"nodes":[],"edges":[]}}'`
    })
  }

  return examples
})

const updateCurlExamples = () => {
  // computed will handle it
}

onMounted(() => {
  loadList()
})
</script>

<style scoped>
.page-container {
  padding: 20px;
  height: 100%;
  overflow-y: auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.content-section {
  margin-bottom: 20px;
}

.table-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  padding: 20px;
}

.key-prefix {
  font-family: 'Courier New', monospace;
  color: var(--text-secondary);
}

.pagination-wrapper {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

.curl-examples-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  padding: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.curl-examples {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.curl-item {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.curl-title {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: var(--bg-hover);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.curl-code-wrapper {
  display: flex;
  align-items: stretch;
  background: #1e293b;
}

.curl-code {
  flex: 1;
  margin: 0;
  padding: 12px 16px;
  overflow-x: auto;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: #e2e8f0;
  line-height: 1.6;
}

.curl-code code {
  font-family: inherit;
}

.key-display {
  margin-bottom: 16px;
}

.key-label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.key-value {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
}

.key-full {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-hover);
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  font-family: 'Courier New', monospace;
  font-size: 13px;
  word-break: break-all;
}

.key-text {
  flex: 1;
  margin-right: 10px;
}

.fade-in-up {
  animation: fadeInUp 0.4s ease both;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>