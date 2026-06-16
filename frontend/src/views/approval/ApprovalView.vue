<template>
  <div class="page-container">
    <div class="page-header fade-in-up">
      <h2 class="page-title">发布审批</h2>
    </div>
    <div class="table-card fade-in-up">
      <el-tabs v-model="activeTab" @tab-change="handleTabChange">
        <el-tab-pane label="待审批" name="pending">
          <div class="table-header">
            <el-input v-model="keyword" placeholder="搜索生产线/申请人/备注" clearable prefix-icon="Search" style="width: 280px" @clear="loadList" @keyup.enter="loadList" />
          </div>
          <el-table :data="list" stripe v-loading="loading">
            <el-table-column prop="pipeline_name" label="生产线名称" min-width="180" />
            <el-table-column prop="applicant_name" label="申请人" width="120" />
            <el-table-column label="目标版本" width="100">
              <template #default="{ row }">
                <el-tag size="small" type="primary">v{{ row.target_version }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="remark" label="备注" min-width="160" show-overflow-tooltip />
            <el-table-column label="提交时间" width="160">
              <template #default="{ row }">{{ formatDate(row.submitted_at) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="200" fixed="right">
              <template #default="{ row }">
                <el-button size="small" type="primary" link @click="viewDetail(row)"><el-icon><View /></el-icon>详情</el-button>
                <el-button size="small" type="success" link @click="handleApprove(row)"><el-icon><Check /></el-icon>批准</el-button>
                <el-button size="small" type="danger" link @click="handleReject(row)"><el-icon><Close /></el-icon>驳回</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="已处理" name="processed">
          <div class="table-header">
            <el-input v-model="keyword" placeholder="搜索生产线/申请人/备注" clearable prefix-icon="Search" style="width: 280px" @clear="loadList" @keyup.enter="loadList" />
            <el-select v-model="statusFilter" placeholder="状态筛选" clearable style="width: 120px" @change="loadList">
              <el-option label="已批准" value="approved" />
              <el-option label="已驳回" value="rejected" />
            </el-select>
          </div>
          <el-table :data="list" stripe v-loading="loading">
            <el-table-column prop="pipeline_name" label="生产线名称" min-width="180" />
            <el-table-column prop="applicant_name" label="申请人" width="120" />
            <el-table-column label="目标版本" width="100">
              <template #default="{ row }">
                <el-tag size="small" type="primary">v{{ row.target_version }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.status === 'approved' ? 'success' : 'danger'" size="small">
                  {{ statusMap[row.status] }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="approver_name" label="处理人" width="120" />
            <el-table-column prop="remark" label="备注" min-width="140" show-overflow-tooltip />
            <el-table-column prop="reject_reason" label="驳回原因" min-width="140" show-overflow-tooltip />
            <el-table-column label="提交时间" width="160">
              <template #default="{ row }">{{ formatDate(row.submitted_at) }}</template>
            </el-table-column>
            <el-table-column label="处理时间" width="160">
              <template #default="{ row }">{{ formatDate(row.approved_at) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="100" fixed="right">
              <template #default="{ row }">
                <el-button size="small" type="primary" link @click="viewDetail(row)"><el-icon><View /></el-icon>详情</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
      <div style="display: flex; justify-content: center; margin-top: 16px;">
        <el-pagination background layout="total, prev, pager, next" :total="total" :page-size="pageSize" v-model:current-page="page" @current-change="loadList" />
      </div>
    </div>

    <el-drawer v-model="detailVisible" title="审批详情" size="600px" destroy-on-close>
      <div v-loading="detailLoading" class="detail-content">
        <template v-if="detailData">
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="生产线名称">{{ detailData.pipeline_name }}</el-descriptions-item>
            <el-descriptions-item label="目标版本">v{{ detailData.target_version }}</el-descriptions-item>
            <el-descriptions-item label="申请人">{{ detailData.applicant_name }}</el-descriptions-item>
            <el-descriptions-item label="提交时间">{{ formatDate(detailData.submitted_at) }}</el-descriptions-item>
            <el-descriptions-item label="状态">
              <el-tag :type="statusTypeMap[detailData.status]" size="small">{{ statusMap[detailData.status] }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item v-if="detailData.approver_name" label="处理人">{{ detailData.approver_name }}</el-descriptions-item>
            <el-descriptions-item v-if="detailData.approved_at" label="处理时间">{{ formatDate(detailData.approved_at) }}</el-descriptions-item>
            <el-descriptions-item label="节点数">{{ detailData.node_count || 0 }}</el-descriptions-item>
            <el-descriptions-item label="备注" :span="2">{{ detailData.remark || '-' }}</el-descriptions-item>
            <el-descriptions-item v-if="detailData.reject_reason" label="驳回原因" :span="2">
              <div style="color: var(--el-color-danger);">{{ detailData.reject_reason }}</div>
            </el-descriptions-item>
          </el-descriptions>

          <el-divider content-position="left">编排预览</el-divider>
          <div class="flow-preview">
            <div v-if="detailData.flow_data?.nodes?.length" class="flow-mini-map">
              <svg :width="previewWidth" :height="previewHeight" class="mini-svg">
                <g v-for="node in detailData.flow_data.nodes" :key="node.id">
                  <rect
                    :x="getNodeX(node)"
                    :y="getNodeY(node)"
                    width="120"
                    height="50"
                    rx="6"
                    :fill="getNodeColor(node.data?.category)"
                    fill-opacity="0.15"
                    :stroke="getNodeColor(node.data?.category)"
                    stroke-width="1.5"
                  />
                  <text
                    :x="getNodeX(node) + 60"
                    :y="getNodeY(node) + 30"
                    text-anchor="middle"
                    font-size="10"
                    fill="var(--text-primary)"
                  >{{ node.data?.label || node.id }}</text>
                </g>
                <g v-for="edge in detailData.flow_data.edges" :key="edge.id">
                  <line
                    :x1="getEdgeX(edge, 'source')"
                    :y1="getEdgeY(edge, 'source')"
                    :x2="getEdgeX(edge, 'target')"
                    :y2="getEdgeY(edge, 'target')"
                    stroke="var(--primary)"
                    stroke-width="1.5"
                    stroke-opacity="0.6"
                  />
                </g>
              </svg>
            </div>
            <el-empty v-else description="暂无编排数据" />
          </div>

          <div v-if="detailData.status === 'pending'" class="detail-actions">
            <el-button type="success" @click="handleApprove(detailData)"><el-icon><Check /></el-icon>批准发布</el-button>
            <el-button type="danger" @click="handleReject(detailData)"><el-icon><Close /></el-icon>驳回申请</el-button>
          </div>
        </template>
      </div>
    </el-drawer>

    <el-dialog v-model="rejectDialogVisible" title="驳回申请" width="420px">
      <el-form label-width="80px">
        <el-form-item label="驳回原因" prop="rejectReason">
          <el-input type="textarea" v-model="rejectReason" :rows="4" placeholder="请输入驳回原因..." maxlength="200" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rejectDialogVisible = false">取消</el-button>
        <el-button type="danger" :loading="rejectLoading" @click="confirmReject">确认驳回</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '@/utils/request'
import dayjs from 'dayjs'

const activeTab = ref('pending')
const loading = ref(false)
const detailLoading = ref(false)
const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const keyword = ref('')
const statusFilter = ref('')
const detailVisible = ref(false)
const detailData = ref(null)
const rejectDialogVisible = ref(false)
const rejectReason = ref('')
const rejectLoading = ref(false)
const currentRejectId = ref(null)

const statusMap = { pending: '待审批', approved: '已批准', rejected: '已驳回' }
const statusTypeMap = { pending: 'warning', approved: 'success', rejected: 'danger' }

const categoryColors = {
  'data-access': '#3b82f6',
  'data-preprocess': '#10b981',
  'model-labeling': '#f59e0b',
  'entity-extract': '#ef4444',
  'relation-build': '#8b5cf6',
  'knowledge-production': '#06b6d4',
  'data-browse': '#ec4899'
}

const previewWidth = 520
const previewHeight = 320

const formatDate = (d) => d ? dayjs(d).format('YYYY-MM-DD HH:mm:ss') : '-'

const loadList = async () => {
  loading.value = true
  try {
    const params = {
      page: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value || undefined
    }
    if (activeTab.value === 'pending') {
      params.status = 'pending'
    } else if (statusFilter.value) {
      params.status = statusFilter.value
    }
    const res = await api.get('/approval', { params })
    list.value = res.data.list
    total.value = res.data.total
  } catch { /* handled */ } finally { loading.value = false }
}

const handleTabChange = () => {
  page.value = 1
  loadList()
}

const viewDetail = async (row) => {
  detailVisible.value = true
  detailLoading.value = true
  detailData.value = null
  try {
    const res = await api.get(`/approval/${row.id}`)
    detailData.value = res.data
  } catch { /* handled */ } finally { detailLoading.value = false }
}

const getNodeColor = (category) => categoryColors[category] || '#94a3b8'

let scale = computed(() => {
  if (!detailData.value?.flow_data?.nodes?.length) return 1
  const nodes = detailData.value.flow_data.nodes
  const maxX = Math.max(...nodes.map(n => n.position?.x || 0)) + 200
  const maxY = Math.max(...nodes.map(n => n.position?.y || 0)) + 100
  const scaleX = previewWidth / maxX
  const scaleY = previewHeight / maxY
  return Math.min(scaleX, scaleY, 1)
})

const getNodeX = (node) => {
  const x = node.position?.x || 0
  return x * scale.value
}

const getNodeY = (node) => {
  const y = node.position?.y || 0
  return y * scale.value
}

const getEdgeX = (edge, type) => {
  const node = detailData.value?.flow_data?.nodes?.find(n => n.id === edge[type])
  if (!node) return 0
  const x = node.position?.x || 0
  const offset = type === 'source' ? 120 : 0
  return (x + offset) * scale.value
}

const getEdgeY = (edge, type) => {
  const node = detailData.value?.flow_data?.nodes?.find(n => n.id === edge[type])
  if (!node) return 0
  const y = node.position?.y || 0
  return (y + 25) * scale.value
}

const handleApprove = async (row) => {
  ElMessageBox.confirm(
    `确定批准发布 "${row.pipeline_name}" 版本 v${row.target_version}？`,
    '批准发布',
    { confirmButtonText: '确认批准', cancelButtonText: '取消', type: 'success' }
  ).then(async () => {
    try {
      await api.post(`/approval/${row.id}/approve`)
      ElMessage.success('已批准发布')
      detailVisible.value = false
      loadList()
    } catch { /* handled */ }
  }).catch(() => {})
}

const handleReject = (row) => {
  currentRejectId.value = row.id
  rejectReason.value = ''
  rejectDialogVisible.value = true
}

const confirmReject = async () => {
  if (!rejectReason.value.trim()) {
    ElMessage.warning('请填写驳回原因')
    return
  }
  rejectLoading.value = true
  try {
    await api.post(`/approval/${currentRejectId.value}/reject`, { rejectReason: rejectReason.value })
    ElMessage.success('已驳回申请')
    rejectDialogVisible.value = false
    detailVisible.value = false
    loadList()
  } catch { /* handled */ } finally { rejectLoading.value = false }
}

onMounted(() => { loadList() })
</script>

<style scoped>
.table-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  padding: 24px;
}
.table-header {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}
.detail-content { padding: 0 8px;
}
.flow-preview {
  background: var(--bg-dark);
  border-radius: 8px;
  padding: 16px;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
}
.flow-mini-map {
  width: 100%;
  display: flex;
  justify-content: center;
}
.mini-svg {
  background: var(--bg-card);
  border-radius: 6px;
}
.detail-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}
</style>
