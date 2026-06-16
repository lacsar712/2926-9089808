<template>
  <div class="page-container">
    <div class="page-header fade-in-up">
      <h2 class="page-title">
        <el-icon><Delete /></el-icon>
        回收站
      </h2>
    </div>

    <div class="stats-bar fade-in-up" v-loading="statsLoading">
      <div class="stat-card">
        <div class="stat-icon" style="background: rgba(99, 102, 241, 0.15); color: #818cf8;">
          <el-icon :size="24"><Files /></el-icon>
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ stats?.total_count || 0 }}</div>
          <div class="stat-label">项目总数</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b;">
          <el-icon :size="24"><Coin /></el-icon>
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ stats?.total_size_formatted || '0 B' }}</div>
          <div class="stat-label">占用空间</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background: rgba(239, 68, 68, 0.15); color: #ef4444;">
          <el-icon :size="24"><Timer /></el-icon>
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ stats?.expired_count || 0 }}</div>
          <div class="stat-label">已过期（超过 {{ stats?.retention_days || 30 }} 天）</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background: rgba(34, 197, 94, 0.15); color: #22c55e;">
          <el-icon :size="24"><Calendar /></el-icon>
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ stats?.retention_days || 30 }} 天</div>
          <div class="stat-label">保留期限</div>
        </div>
      </div>
      <div class="stats-actions">
        <el-button
          type="danger"
          :disabled="!stats?.expired_count"
          :loading="clearingExpired"
          @click="handleClearExpired"
        >
          <el-icon><DeleteFilled /></el-icon>
          清空过期项
        </el-button>
      </div>
    </div>

    <div class="filter-bar fade-in-up">
      <el-input
        v-model="filters.keyword"
        placeholder="搜索生产线名称..."
        clearable
        style="width: 280px"
        prefix-icon="Search"
        @clear="loadList"
        @keyup.enter="loadList"
      />
      <el-button @click="loadList" type="primary" plain>
        <el-icon><Search /></el-icon>搜索
      </el-button>
      <div class="batch-actions" v-if="selectedIds.length > 0">
        <el-divider direction="vertical" />
        <span style="color: var(--text-secondary); margin-right: 8px;">已选 {{ selectedIds.length }} 项</span>
        <el-button type="primary" plain size="small" @click="handleBatchRestore">
          <el-icon><Refresh /></el-icon>批量恢复
        </el-button>
        <el-popconfirm
          title="确认永久删除选中的生产线？此操作不可撤销，将物理删除所有关联数据。"
          confirm-button-text="确认删除"
          cancel-button-text="取消"
          confirm-button-type="danger"
          @confirm="handleBatchPurge"
        >
          <template #reference>
            <el-button type="danger" plain size="small">
              <el-icon><DeleteFilled /></el-icon>批量永久删除
            </el-button>
          </template>
        </el-popconfirm>
      </div>
    </div>

    <div class="pipeline-grid fade-in-up" v-loading="loading">
      <div v-for="item in list" :key="item.id" class="pipeline-card trash-card" :class="{ selected: selectedIds.includes(item.id) }">
        <div class="card-select">
          <el-checkbox :model-value="selectedIds.includes(item.id)" @change="toggleSelect(item.id)" />
        </div>
        <div class="card-header">
          <h3>{{ item.name }}</h3>
          <el-tag
            :type="item.remaining_days <= 3 ? 'danger' : item.remaining_days <= 7 ? 'warning' : 'info'"
            size="small"
            effect="dark"
            round
          >
            剩余 {{ item.remaining_days }} 天
          </el-tag>
        </div>
        <p class="card-desc">{{ item.description || '暂无描述' }}</p>
        <div class="card-tags">
          <el-tag
            v-for="tag in item.tags"
            :key="tag.id"
            :color="tag.color + '22'"
            :style="{ color: tag.color, borderColor: tag.color + '44' }"
            size="small"
            effect="dark"
            round
          >
            {{ tag.name }}
          </el-tag>
        </div>
        <div class="card-meta">
          <span><el-icon><User /></el-icon>创建人: {{ item.creator_name || '系统' }}</span>
          <span><el-icon><DeleteUser /></el-icon>删除人: {{ item.deleter_name || '未知' }}</span>
        </div>
        <div class="card-meta">
          <span><el-icon><Clock /></el-icon>删除时间: {{ formatDate(item.deleted_at) }}</span>
          <span>v{{ item.version }}</span>
        </div>
        <div class="card-actions">
          <el-button size="small" type="primary" plain @click="handleRestore(item)">
            <el-icon><Refresh /></el-icon>恢复
          </el-button>
          <el-popconfirm
            title="确认永久删除该生产线？此操作不可撤销，将物理删除所有关联数据。"
            confirm-button-text="确认删除"
            cancel-button-text="取消"
            confirm-button-type="danger"
            @confirm="handlePurge(item)"
          >
            <template #reference>
              <el-button size="small" type="danger" plain>
                <el-icon><DeleteFilled /></el-icon>永久删除
              </el-button>
            </template>
          </el-popconfirm>
        </div>
      </div>
      <div v-if="!loading && list.length === 0" class="empty-state">
        <el-icon :size="64" color="var(--text-secondary)"><Delete /></el-icon>
        <p>回收站为空</p>
      </div>
    </div>

    <div class="pagination-bar" v-if="total > pageSize">
      <el-pagination
        background
        layout="total, prev, pager, next"
        :total="total"
        :page-size="pageSize"
        v-model:current-page="currentPage"
        @current-change="loadList"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '@/utils/request'
import dayjs from 'dayjs'

const loading = ref(false)
const statsLoading = ref(false)
const clearingExpired = ref(false)
const list = ref([])
const stats = ref(null)
const total = ref(0)
const currentPage = ref(1)
const pageSize = 12
const selectedIds = ref([])

const filters = reactive({ keyword: '' })

const formatDate = (d) => d ? dayjs(d).format('YYYY-MM-DD HH:mm') : '-'

const loadStats = async () => {
  statsLoading.value = true
  try {
    const res = await api.get('/pipelines/trash/stats')
    stats.value = res.data
  } catch { /* handled */ } finally { statsLoading.value = false }
}

const loadList = async () => {
  loading.value = true
  try {
    const res = await api.get('/pipelines/trash', { params: { ...filters, page: currentPage.value, pageSize } })
    list.value = res.data.list
    total.value = res.data.total
    selectedIds.value = selectedIds.value.filter(id => list.value.some(item => item.id === id))
  } catch { /* handled */ } finally { loading.value = false }
}

const toggleSelect = (id) => {
  const idx = selectedIds.value.indexOf(id)
  if (idx === -1) {
    selectedIds.value.push(id)
  } else {
    selectedIds.value.splice(idx, 1)
  }
}

const handleRestore = async (item) => {
  try {
    await api.post(`/pipelines/${item.id}/restore`)
    ElMessage.success('恢复成功')
    loadList()
    loadStats()
  } catch { /* handled */ }
}

const handleBatchRestore = async () => {
  if (selectedIds.value.length === 0) return
  try {
    await api.post('/pipelines/restore/batch', { ids: selectedIds.value })
    ElMessage.success(`成功恢复 ${selectedIds.value.length} 条生产线`)
    selectedIds.value = []
    loadList()
    loadStats()
  } catch { /* handled */ }
}

const handlePurge = async (item) => {
  try {
    await api.delete(`/pipelines/${item.id}/purge`)
    ElMessage.success('永久删除成功')
    loadList()
    loadStats()
  } catch { /* handled */ }
}

const handleBatchPurge = async () => {
  if (selectedIds.value.length === 0) return
  try {
    await api.delete('/pipelines/purge/batch', { data: { ids: selectedIds.value } })
    ElMessage.success(`成功永久删除 ${selectedIds.value.length} 条生产线`)
    selectedIds.value = []
    loadList()
    loadStats()
  } catch { /* handled */ }
}

const handleClearExpired = async () => {
  try {
    await ElMessageBox.confirm(
      `确认清空所有超过 ${stats.value.retention_days} 天的过期记录？此操作不可撤销。`,
      '清空过期项',
      {
        confirmButtonText: '确认清空',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger'
      }
    )
    clearingExpired.value = true
    const res = await api.delete('/pipelines/trash/purge-expired')
    ElMessage.success(res.message || '清空成功')
    loadList()
    loadStats()
  } catch (e) {
    if (e !== 'cancel') { /* handled */ }
  } finally { clearingExpired.value = false }
}

onMounted(() => { loadList(); loadStats() })
</script>

<style scoped>
.page-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.stats-bar {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
  flex-wrap: wrap;
  align-items: center;
}
.stat-card {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  padding: 16px 20px;
  min-width: 180px;
}
.stat-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
}
.stat-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}
.stats-actions {
  margin-left: auto;
}
.filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
  flex-wrap: wrap;
  align-items: center;
}
.batch-actions {
  display: flex;
  align-items: center;
}
.pipeline-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 20px;
  min-height: 200px;
}
.pipeline-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  padding: 20px 24px 24px;
  transition: var(--transition);
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: relative;
}
.trash-card.selected {
  border-color: var(--primary);
  background: rgba(99, 102, 241, 0.05);
}
.card-select {
  position: absolute;
  top: 12px;
  right: 12px;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-right: 40px;
}
.card-header h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}
.card-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.card-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.card-meta {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  font-size: 12px;
  color: var(--text-secondary);
  padding-top: 4px;
  border-top: 1px solid var(--border-color);
}
.card-meta span {
  display: flex;
  align-items: center;
  gap: 4px;
}
.card-actions {
  display: flex;
  gap: 8px;
  padding-top: 8px;
}
.empty-state {
  grid-column: 1/-1;
  text-align: center;
  padding: 80px 0;
  color: var(--text-secondary);
}
.empty-state p { margin-top: 16px; font-size: 14px; }
.pagination-bar {
  display: flex;
  justify-content: center;
  margin-top: 24px;
}
</style>
